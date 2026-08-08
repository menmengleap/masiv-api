import { config } from '../config/index.js';
import { query, withTransaction } from '../db/pool.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import type { OrderRow, OrderStatus, PaymentRow, PaymentStatus } from '../types.js';
import { getSettings } from './settings.service.js';

/**
 * Order + payment lifecycle.
 *
 * Purchase is transaction-safe: stock is claimed with
 * `SELECT … FOR UPDATE SKIP LOCKED`, so two concurrent buyers can never be
 * handed the same API key. A token is:
 *   stock  ──reserve──▶ reserved ──confirm payment──▶ active   (delivered)
 *                          └────────release/expire────▶ stock
 */

function orderNumber(): string {
  // Human-friendly, unique-enough order number: MSV-<base36 time>-<rand>.
  // Date.now via performance-safe fallback (no Math.random in some sandboxes,
  // but this runs in the server process where it's available).
  const t = Date.now().toString(36).toUpperCase();
  const r = Math.floor(Math.random() * 46656).toString(36).toUpperCase().padStart(3, '0');
  return `MSV-${t}-${r}`;
}

export interface CreateOrderResult {
  order: OrderRow;
  payment: PaymentRow;
  package: { id: string; name: string; total_tokens: string; valid_days: number };
}

/**
 * Start a purchase: reserve one available token for the package and create a
 * pending order + pending payment invoice. Throws 409 if the package is out of
 * stock. Does NOT deliver credentials — that only happens after payment is
 * server-verified via `confirmPayment`.
 */
export async function createOrderForPackage(
  customerId: string,
  packageId: string,
): Promise<CreateOrderResult> {
  const settings = await getSettings();
  const rate = Number(settings.usd_to_usdt) || 1;
  const timeoutMin = settings.payment_timeout_minutes ?? config.paymentTimeoutMinutes;

  return withTransaction(async (client) => {
    const pkgRes = await client.query<{
      id: string;
      name: string;
      total_tokens: string;
      is_active: boolean;
    }>('SELECT id, name, total_tokens, is_active FROM packages WHERE id = $1', [packageId]);
    const pkg = pkgRes.rows[0];
    if (!pkg) throw notFound('Package not found');
    if (!pkg.is_active) throw badRequest('This package is not available');

    // Claim one available token atomically. SKIP LOCKED lets concurrent buyers
    // grab *different* rows instead of blocking on the same one.
    const tokenRes = await client.query<{
      id: string;
      price: string;
      valid_days: number;
      base_url: string;
    }>(
      `SELECT id, price, valid_days, base_url
       FROM tokens
       WHERE package_id = $1 AND status = 'stock' AND is_used = FALSE
       ORDER BY created_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1`,
      [packageId],
    );
    const token = tokenRes.rows[0];
    if (!token) throw conflict('This package is currently out of stock');

    // Reserve it.
    await client.query(
      `UPDATE tokens SET status = 'reserved', updated_at = NOW() WHERE id = $1`,
      [token.id],
    );

    const usdPrice = Number(token.price);
    const amount = +(usdPrice * rate).toFixed(2);

    const orderRes = await client.query<OrderRow>(
      `INSERT INTO orders (order_number, customer_id, package_id, token_id, amount, currency, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [orderNumber(), customerId, packageId, token.id, amount, settings.payment_currency],
    );
    const order = orderRes.rows[0];

    const paymentRes = await client.query<PaymentRow>(
      `INSERT INTO payments (order_id, currency, amount, network, wallet_address, status, expires_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', NOW() + ($6 || ' minutes')::interval)
       RETURNING *`,
      [
        order.id,
        settings.payment_currency,
        amount,
        settings.payment_network,
        settings.payment_wallet,
        timeoutMin,
      ],
    );

    logger.info('api', `Order ${order.order_number} created (pending) for package ${pkg.name}`);

    return {
      order,
      payment: paymentRes.rows[0],
      package: {
        id: pkg.id,
        name: pkg.name,
        total_tokens: pkg.total_tokens,
        valid_days: token.valid_days,
      },
    };
  });
}

export interface DeliveredCredentials {
  order: OrderRow;
  base_url: string;
  package_name: string;
  total_tokens: string;
  valid_days: number;
  started_at: string;
  expires_at: string;
  token_id: string;
}

/**
 * Confirm a payment (server-side) and deliver credentials in one transaction.
 *
 * This is the ONLY path that marks an order paid/completed and activates a
 * token. It must be triggered by a verified signal — an admin confirming the
 * payment, or an on-chain verification hook — never by a Telegram button click.
 *
 * `verify` receives the payment row and must return true if payment is real.
 * For manual admin confirmation, pass `() => true` (the admin IS the verifier);
 * a real on-chain integration performs the RPC check here.
 */
export async function confirmPayment(
  orderId: string,
  opts: {
    transactionHash?: string | null;
    verify?: (payment: PaymentRow) => Promise<boolean> | boolean;
    confirmedByAdminId?: string | null;
  } = {},
): Promise<DeliveredCredentials> {
  return withTransaction(async (client) => {
    // Lock the order row for the duration.
    const orderRes = await client.query<OrderRow>(
      'SELECT * FROM orders WHERE id = $1 FOR UPDATE',
      [orderId],
    );
    const order = orderRes.rows[0];
    if (!order) throw notFound('Order not found');

    if (order.status === 'completed') {
      throw conflict('Order is already completed');
    }
    if (['cancelled', 'expired', 'refunded'].includes(order.status)) {
      throw conflict(`Order cannot be paid — current status is "${order.status}"`);
    }
    if (!order.token_id) {
      throw badRequest('Order has no reserved token');
    }

    const payRes = await client.query<PaymentRow>(
      'SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE',
      [orderId],
    );
    const payment = payRes.rows[0];
    if (!payment) throw badRequest('No payment record for this order');

    // Server-side verification. Default verifier rejects (must be explicit).
    const verifier = opts.verify ?? (async () => false);
    const ok = await verifier({ ...payment, transaction_hash: opts.transactionHash ?? payment.transaction_hash });
    if (!ok) {
      throw badRequest('Payment could not be verified');
    }

    // Mark payment confirmed.
    await client.query(
      `UPDATE payments
         SET status = 'confirmed', confirmed_at = NOW(),
             transaction_hash = COALESCE($2, transaction_hash)
       WHERE id = $1`,
      [payment.id, opts.transactionHash ?? null],
    );

    // Activate the reserved token — set the clock now.
    const tokenRes = await client.query<{
      base_url: string;
      total_tokens: string;
      valid_days: number;
      started_at: string;
      expires_at: string;
    }>(
      `UPDATE tokens
         SET status = 'active',
             is_used = TRUE,
             used_by = $2,
             assigned_at = NOW(),
             started_at = NOW(),
             expires_at = NOW() + (valid_days || ' days')::interval,
             updated_at = NOW()
       WHERE id = $1 AND status = 'reserved'
       RETURNING base_url, total_tokens, valid_days, started_at, expires_at`,
      [order.token_id, order.customer_id],
    );
    const token = tokenRes.rows[0];
    if (!token) {
      // Reserved token vanished (e.g. released by expiry). Abort the whole tx.
      throw conflict('Reserved API stock is no longer available — payment not captured');
    }

    // Package name for the receipt.
    const pkgRes = await client.query<{ name: string }>(
      'SELECT name FROM packages WHERE id = $1',
      [order.package_id],
    );

    // Complete the order.
    const updatedOrderRes = await client.query<OrderRow>(
      `UPDATE orders
         SET status = 'completed', paid_at = NOW(), completed_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [order.id],
    );

    logger.info('api', `Order ${order.order_number} paid + token assigned`);

    return {
      order: updatedOrderRes.rows[0],
      base_url: token.base_url,
      package_name: pkgRes.rows[0]?.name ?? 'API Package',
      total_tokens: token.total_tokens,
      valid_days: token.valid_days,
      started_at: token.started_at,
      expires_at: token.expires_at,
      token_id: order.token_id,
    };
  });
}

/** Cancel a pending order and release its reserved token back to stock. */
export async function cancelOrder(orderId: string, reason = 'cancelled'): Promise<OrderRow> {
  return withTransaction(async (client) => {
    const orderRes = await client.query<OrderRow>(
      'SELECT * FROM orders WHERE id = $1 FOR UPDATE',
      [orderId],
    );
    const order = orderRes.rows[0];
    if (!order) throw notFound('Order not found');
    if (order.status === 'completed') throw conflict('Cannot cancel a completed order');
    if (['cancelled', 'expired', 'refunded'].includes(order.status)) return order;

    // Release reserved token.
    if (order.token_id) {
      await client.query(
        `UPDATE tokens SET status = 'stock', updated_at = NOW()
         WHERE id = $1 AND status = 'reserved'`,
        [order.token_id],
      );
    }

    const newStatus: OrderStatus = reason === 'expired' ? 'expired' : 'cancelled';
    const updated = await client.query<OrderRow>(
      `UPDATE orders SET status = $2 WHERE id = $1 RETURNING *`,
      [orderId, newStatus],
    );
    await client.query(
      `UPDATE payments SET status = 'expired'
       WHERE order_id = $1 AND status = 'pending'`,
      [orderId],
    );
    logger.info('api', `Order ${order.order_number} ${newStatus}; reserved stock released`);
    return updated.rows[0];
  });
}

/**
 * Sweep pending orders whose payment window has elapsed: cancel them and
 * release reserved stock. Called by the expiry worker.
 */
export async function expireStaleOrders(): Promise<number> {
  const { rows } = await query<{ id: string }>(
    `SELECT o.id
     FROM orders o
     JOIN payments p ON p.order_id = o.id
     WHERE o.status = 'pending'
       AND p.status = 'pending'
       AND p.expires_at IS NOT NULL
       AND p.expires_at <= NOW()`,
  );
  let count = 0;
  for (const r of rows) {
    try {
      await cancelOrder(r.id, 'expired');
      count++;
    } catch (err) {
      logger.warn('worker', `Failed to expire order ${r.id}: ${(err as Error).message}`);
    }
  }
  return count;
}

// ── Read models ────────────────────────────────────────────────

export interface OrderView extends OrderRow {
  customer_label: string | null;
  telegram_user_id: string | null;
  package_name: string;
  payment_status: PaymentStatus | null;
  transaction_hash: string | null;
}

export async function listOrders(opts?: {
  status?: OrderStatus;
  customerId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: OrderView[]; total: number }> {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (opts?.status) {
    params.push(opts.status);
    conds.push(`o.status = $${params.length}`);
  }
  if (opts?.customerId) {
    params.push(opts.customerId);
    conds.push(`o.customer_id = $${params.length}`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const countRes = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM orders o ${where}`,
    params,
  );

  const limit = Math.min(opts?.limit ?? 50, 200);
  const offset = opts?.offset ?? 0;
  params.push(limit, offset);

  const { rows } = await query<OrderView>(
    `SELECT o.*,
        p.name AS package_name,
        NULLIF(TRIM(COALESCE(c.telegram_username,'') || ' ' ||
             COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')), '') AS customer_label,
        c.telegram_user_id,
        pay.status AS payment_status,
        pay.transaction_hash
     FROM orders o
     JOIN packages p ON p.id = o.package_id
     JOIN customers c ON c.id = o.customer_id
     LEFT JOIN LATERAL (
        SELECT status, transaction_hash FROM payments
        WHERE order_id = o.id ORDER BY created_at DESC LIMIT 1
     ) pay ON TRUE
     ${where}
     ORDER BY o.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return { items: rows, total: Number(countRes.rows[0].count) };
}

export async function getOrder(id: string): Promise<OrderView> {
  const { items } = await listOrders({ limit: 1, offset: 0 });
  const found = items.find((o) => o.id === id);
  if (found) return found;
  // Fallback direct fetch (listOrders is paginated).
  const { rows } = await query<OrderView>(
    `SELECT o.*, p.name AS package_name,
        NULLIF(TRIM(COALESCE(c.telegram_username,'') || ' ' ||
             COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')), '') AS customer_label,
        c.telegram_user_id,
        pay.status AS payment_status, pay.transaction_hash
     FROM orders o
     JOIN packages p ON p.id = o.package_id
     JOIN customers c ON c.id = o.customer_id
     LEFT JOIN LATERAL (
        SELECT status, transaction_hash FROM payments
        WHERE order_id = o.id ORDER BY created_at DESC LIMIT 1
     ) pay ON TRUE
     WHERE o.id = $1`,
    [id],
  );
  if (!rows[0]) throw notFound('Order not found');
  return rows[0];
}

export async function listPayments(opts?: {
  status?: PaymentStatus;
  limit?: number;
  offset?: number;
}): Promise<{ items: Array<PaymentRow & { order_number: string }>; total: number }> {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (opts?.status) {
    params.push(opts.status);
    conds.push(`pay.status = $${params.length}`);
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  const countRes = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM payments pay ${where}`,
    params,
  );

  const limit = Math.min(opts?.limit ?? 50, 200);
  const offset = opts?.offset ?? 0;
  params.push(limit, offset);

  const { rows } = await query<PaymentRow & { order_number: string }>(
    `SELECT pay.*, o.order_number
     FROM payments pay
     JOIN orders o ON o.id = pay.order_id
     ${where}
     ORDER BY pay.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return { items: rows, total: Number(countRes.rows[0].count) };
}
