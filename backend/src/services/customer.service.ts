import { db, query, type Queryable } from '../db/pool.js';
import { notFound } from '../lib/errors.js';
import type { CustomerRow } from '../types.js';

/** Upsert a customer keyed by Telegram user id. Returns the customer row. */
export async function upsertCustomerByTelegram(
  params: {
    telegramUserId: number | string;
    username?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  },
  client?: Queryable,
): Promise<CustomerRow> {
  const q = client ?? db;
  const { rows } = await q.query<CustomerRow>(
    `INSERT INTO customers (telegram_user_id, telegram_username, first_name, last_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (telegram_user_id) DO UPDATE SET
        telegram_username = EXCLUDED.telegram_username,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        updated_at = NOW()
     RETURNING *`,
    [
      String(params.telegramUserId),
      params.username ?? null,
      params.firstName ?? null,
      params.lastName ?? null,
    ],
  );
  return rows[0];
}

export interface CustomerView extends CustomerRow {
  orders_count: number;
  active_tokens: number;
  total_spent: string;
}

export async function listCustomers(opts?: {
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: CustomerView[]; total: number }> {
  const params: unknown[] = [];
  let where = '';
  if (opts?.search) {
    params.push(`%${opts.search}%`);
    where = `WHERE c.telegram_username ILIKE $1 OR c.first_name ILIKE $1 OR c.last_name ILIKE $1 OR c.telegram_user_id::text ILIKE $1`;
  }

  const countRes = await query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM customers c ${where}`,
    params,
  );

  const limit = Math.min(opts?.limit ?? 50, 200);
  const offset = opts?.offset ?? 0;
  params.push(limit, offset);

  const { rows } = await query<CustomerView>(
    `SELECT c.*,
        COALESCE(o.orders_count, 0)::int AS orders_count,
        COALESCE(o.total_spent, 0)::text AS total_spent,
        COALESCE(t.active_tokens, 0)::int AS active_tokens
     FROM customers c
     LEFT JOIN (
        SELECT customer_id,
               COUNT(*) FILTER (WHERE status = 'completed') AS orders_count,
               SUM(amount) FILTER (WHERE status = 'completed') AS total_spent
        FROM orders GROUP BY customer_id
     ) o ON o.customer_id = c.id
     LEFT JOIN (
        SELECT used_by, COUNT(*) AS active_tokens
        FROM tokens
        WHERE status IN ('active','expiring') AND used_by IS NOT NULL
        GROUP BY used_by
     ) t ON t.used_by = c.id
     ${where}
     ORDER BY c.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  return { items: rows, total: Number(countRes.rows[0].count) };
}

export async function getCustomer(id: string): Promise<CustomerRow> {
  const { rows } = await query<CustomerRow>('SELECT * FROM customers WHERE id = $1', [id]);
  if (!rows[0]) throw notFound('Customer not found');
  return rows[0];
}
