import { query } from '../db/pool.js';
import { DAYS_LEFT_SQL } from '../db/sql.js';
import { conflict, forbidden, notFound } from '../lib/errors.js';
import { decrypt, maskFromLast4 } from '../lib/crypto.js';
import { audit } from './audit.service.js';
import { upsertCustomerByTelegram } from './customer.service.js';

/**
 * Customer-facing storefront operations used by the Telegram bot.
 * Keeps the bot thin — all business logic + DB access lives here.
 */

export interface StorePackage {
  id: string;
  name: string;
  total_tokens: string;
  price: string; // USD
  default_valid_days: number;
  description: string | null;
  stock_available: number;
}

/** Active packages that currently have stock, ordered for display. */
export async function getStorePackages(): Promise<StorePackage[]> {
  const { rows } = await query<StorePackage>(
    `SELECT p.id, p.name, p.total_tokens, p.price, p.default_valid_days, p.description,
            COALESCE(s.available, 0)::int AS stock_available
     FROM packages p
     LEFT JOIN (
        SELECT package_id, COUNT(*) AS available
        FROM tokens WHERE status = 'stock' GROUP BY package_id
     ) s ON s.package_id = p.id
     WHERE p.is_active = TRUE
     ORDER BY p.sort_order ASC, p.total_tokens ASC`,
  );
  return rows;
}

export async function getStorePackage(id: string): Promise<StorePackage> {
  const rows = await getStorePackages();
  const pkg = rows.find((p) => p.id === id);
  if (!pkg) {
    // Might exist but be inactive/out of stock.
    const { rows: r } = await query<StorePackage>(
      `SELECT id, name, total_tokens, price, default_valid_days, description, 0 AS stock_available
       FROM packages WHERE id = $1`,
      [id],
    );
    if (!r[0]) throw notFound('Package not found');
    return { ...r[0], stock_available: 0 };
  }
  return pkg;
}

/** Ensure a customer record exists for this Telegram user; return its id. */
export async function ensureCustomer(tg: {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}): Promise<string> {
  const customer = await upsertCustomerByTelegram({
    telegramUserId: tg.id,
    username: tg.username ?? null,
    firstName: tg.first_name ?? null,
    lastName: tg.last_name ?? null,
  });
  return customer.id;
}

/** Record/refresh a telegram_users row (analytics + language). */
export async function trackTelegramUser(tg: {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  language_code?: string;
}): Promise<void> {
  await query(
    `INSERT INTO telegram_users (telegram_user_id, username, first_name, last_name, language_code)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (telegram_user_id) DO UPDATE SET
        username = EXCLUDED.username,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        language_code = EXCLUDED.language_code,
        updated_at = NOW()`,
    [String(tg.id), tg.username ?? null, tg.first_name ?? null, tg.last_name ?? null, tg.language_code ?? null],
  );
}

/** Attach a customer-submitted transaction hash to an order's pending payment. */
export async function submitTransactionHash(
  orderId: string,
  telegramUserId: number,
  txHash: string,
): Promise<void> {
  const { rows } = await query<{ id: string; customer_tg: string | null; status: string }>(
    `SELECT o.id, o.status, c.telegram_user_id AS customer_tg
     FROM orders o JOIN customers c ON c.id = o.customer_id
     WHERE o.id = $1`,
    [orderId],
  );
  const order = rows[0];
  if (!order) throw notFound('Order not found');
  if (order.customer_tg !== String(telegramUserId)) throw forbidden('This is not your order');
  if (order.status !== 'pending') throw conflict(`Order is already "${order.status}"`);

  await query(
    `UPDATE payments SET transaction_hash = $2
     WHERE order_id = $1 AND status = 'pending'`,
    [orderId, txHash.trim()],
  );
}

export interface MyToken {
  id: string;
  package_name: string | null;
  base_url: string;
  masked_key: string;
  total_tokens: string;
  status: string;
  started_at: string | null;
  expires_at: string | null;
  days_left: number | null;
}

/** A customer's purchased API tokens (masked), newest first. */
export async function getMyTokens(telegramUserId: number): Promise<MyToken[]> {
  const { rows } = await query<MyToken>(
    `SELECT t.id, p.name AS package_name, t.base_url, t.token_last4,
            t.total_tokens, t.status, t.started_at, t.expires_at,
            ${DAYS_LEFT_SQL} AS days_left
     FROM tokens t
     JOIN customers c ON c.id = t.used_by
     LEFT JOIN packages p ON p.id = t.package_id
     WHERE c.telegram_user_id = $1 AND t.is_used = TRUE
     ORDER BY t.assigned_at DESC NULLS LAST`,
    [String(telegramUserId)],
  );
  return rows.map((r) => ({
    ...r,
    masked_key: maskFromLast4((r as unknown as { token_last4: string }).token_last4),
  }));
}

/** Reveal a full API key to its owning customer only. Audited. */
export async function revealMyKey(tokenId: string, telegramUserId: number): Promise<string> {
  const { rows } = await query<{ token_value: string; owner_tg: string | null }>(
    `SELECT t.token_value, c.telegram_user_id AS owner_tg
     FROM tokens t JOIN customers c ON c.id = t.used_by
     WHERE t.id = $1`,
    [tokenId],
  );
  const row = rows[0];
  if (!row) throw notFound('API key not found');
  if (row.owner_tg !== String(telegramUserId)) throw forbidden('This is not your API key');

  await audit({
    adminId: null,
    action: 'token.reveal_by_customer',
    entityType: 'token',
    entityId: tokenId,
    metadata: { telegram_user_id: telegramUserId },
  });
  return decrypt(row.token_value);
}

export interface OrderDeliveryInfo {
  order_number: string;
  customer_tg: string | null;
  package_name: string;
  base_url: string;
  token_id: string;
  masked_key: string;
  total_tokens: string;
  valid_days: number;
  expires_at: string | null;
}

/** Everything needed to send a delivery message for a completed order. */
export async function getDeliveryInfo(orderId: string): Promise<OrderDeliveryInfo | null> {
  const { rows } = await query<OrderDeliveryInfo & { token_last4: string }>(
    `SELECT o.order_number, c.telegram_user_id AS customer_tg,
            p.name AS package_name, t.base_url, t.id AS token_id, t.token_last4,
            t.total_tokens, t.valid_days, t.expires_at
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     JOIN packages p ON p.id = o.package_id
     JOIN tokens t ON t.id = o.token_id
     WHERE o.id = $1`,
    [orderId],
  );
  const r = rows[0];
  if (!r) return null;
  return { ...r, masked_key: maskFromLast4(r.token_last4) };
}

export interface OrderNotifyInfo {
  order_number: string;
  customer_tg: string | null;
  package_name: string;
}

/**
 * Minimal order info for notifying a customer about an order that was NOT
 * delivered (e.g. its payment window expired). Unlike `getDeliveryInfo` this
 * does not join `tokens`, so it still resolves after the reserved token has
 * been released back to stock.
 */
export async function getOrderNotifyInfo(orderId: string): Promise<OrderNotifyInfo | null> {
  const { rows } = await query<OrderNotifyInfo>(
    `SELECT o.order_number, c.telegram_user_id AS customer_tg, p.name AS package_name
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     JOIN packages p ON p.id = o.package_id
     WHERE o.id = $1`,
    [orderId],
  );
  return rows[0] ?? null;
}
