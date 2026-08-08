import { config } from '../config/index.js';
import { query } from '../db/pool.js';

/**
 * Dashboard metrics. Expiry-derived numbers are computed from `expires_at`
 * (source of truth), independent of the stored status, so they're correct even
 * if the worker hasn't run yet.
 */
export interface DashboardStats {
  total_stock: number;
  available_stock: number;
  active_apis: number;
  expiring_soon: number;
  expired_apis: number;
  reserved: number;
  total_packages: number;
  orders_today: number;
  revenue_today: string;
  revenue_total: string;
  total_customers: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const threshold = config.expiringThresholdDays;

  const { rows } = await query<Record<string, string>>(
    `
    SELECT
      (SELECT COUNT(*) FROM tokens) AS total_stock,
      (SELECT COUNT(*) FROM tokens WHERE status = 'stock') AS available_stock,
      (SELECT COUNT(*) FROM tokens WHERE status = 'reserved') AS reserved,

      -- active / expiring / expired computed from expires_at (source of truth)
      (SELECT COUNT(*) FROM tokens
         WHERE started_at IS NOT NULL AND expires_at > NOW() + INTERVAL '${threshold} days'
      ) AS active_apis,
      (SELECT COUNT(*) FROM tokens
         WHERE started_at IS NOT NULL AND expires_at > NOW()
           AND expires_at <= NOW() + INTERVAL '${threshold} days'
      ) AS expiring_soon,
      (SELECT COUNT(*) FROM tokens
         WHERE started_at IS NOT NULL AND expires_at <= NOW()
      ) AS expired_apis,

      (SELECT COUNT(*) FROM packages WHERE is_active = TRUE) AS total_packages,
      (SELECT COUNT(*) FROM orders WHERE created_at::date = CURRENT_DATE) AS orders_today,
      (SELECT COALESCE(SUM(amount),0) FROM orders
         WHERE status = 'completed' AND completed_at::date = CURRENT_DATE) AS revenue_today,
      (SELECT COALESCE(SUM(amount),0) FROM orders WHERE status = 'completed') AS revenue_total,
      (SELECT COUNT(*) FROM customers) AS total_customers
    `,
  );

  const r = rows[0];
  return {
    total_stock: Number(r.total_stock),
    available_stock: Number(r.available_stock),
    active_apis: Number(r.active_apis),
    expiring_soon: Number(r.expiring_soon),
    expired_apis: Number(r.expired_apis),
    reserved: Number(r.reserved),
    total_packages: Number(r.total_packages),
    orders_today: Number(r.orders_today),
    revenue_today: r.revenue_today,
    revenue_total: r.revenue_total,
    total_customers: Number(r.total_customers),
  };
}

/** Small telemetry used by the Telegram Bot control panel. */
export interface TelegramStats {
  total_users: number;
  orders_today: number;
  messages_today: number;
}

export async function getTelegramStats(): Promise<TelegramStats> {
  const { rows } = await query<Record<string, string>>(
    `SELECT
       (SELECT COUNT(*) FROM telegram_users) AS total_users,
       (SELECT COUNT(*) FROM orders WHERE created_at::date = CURRENT_DATE) AS orders_today`,
  );
  const r = rows[0];
  return {
    total_users: Number(r.total_users),
    orders_today: Number(r.orders_today),
    messages_today: 0, // populated live by the bot process (see bot/state)
  };
}
