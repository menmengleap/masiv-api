import { config } from '../config/index.js';
import { query } from '../db/pool.js';
import { logger } from '../lib/logger.js';
import { expireStaleOrders } from '../services/order.service.js';
import { sendOrderExpired } from '../bot/index.js';

/**
 * Expiry worker.
 *
 * Periodically reconciles the stored `status` of started tokens with reality:
 *   - expires_at <= NOW()                       → 'expired'
 *   - expires_at <= NOW() + threshold days      → 'expiring'
 *   - otherwise (still comfortably valid)        → 'active'
 *
 * It NEVER modifies `expires_at` — that column is the source of truth. The
 * stored status is just a cached, queryable convenience; the UI still computes
 * days-left and effective status live, so correctness never depends on this
 * worker having run.
 *
 * It also releases stock from orders whose payment window elapsed.
 */

let timer: NodeJS.Timeout | null = null;
let running = false;
let lastRunAt: string | null = null;
let lastRunSummary = '';

export interface WorkerStatus {
  running: boolean;
  interval_ms: number;
  last_run_at: string | null;
  last_run_summary: string;
}

export async function runExpiryPass(): Promise<{
  expired: number;
  expiring: number;
  reactivated: number;
  orders_expired: number;
}> {
  const threshold = config.expiringThresholdDays;

  // 1) Expired
  const expiredRes = await query(
    `UPDATE tokens
       SET status = 'expired', updated_at = NOW()
     WHERE started_at IS NOT NULL
       AND expires_at IS NOT NULL
       AND expires_at <= NOW()
       AND status <> 'expired'`,
  );

  // 2) Expiring (<= threshold days, but not yet expired)
  const expiringRes = await query(
    `UPDATE tokens
       SET status = 'expiring', updated_at = NOW()
     WHERE started_at IS NOT NULL
       AND expires_at IS NOT NULL
       AND expires_at > NOW()
       AND expires_at <= NOW() + ($1 || ' days')::interval
       AND status NOT IN ('expiring','expired','disabled')`,
    [threshold],
  );

  // 3) Reactivate: a token previously flagged expiring/expired whose expiry is
  //    now comfortably in the future again (e.g. admin extended valid_days).
  const reactivatedRes = await query(
    `UPDATE tokens
       SET status = 'active', updated_at = NOW()
     WHERE started_at IS NOT NULL
       AND expires_at > NOW() + ($1 || ' days')::interval
       AND status IN ('expiring','expired')`,
    [threshold],
  );

  // 4) Release stock from timed-out pending orders, and let each customer know
  //    their QR ran out of time (otherwise the payment window is invisible to
  //    them and they'd sit waiting on a dead QR).
  const ordersExpired = await expireStaleOrders();
  for (const orderId of ordersExpired) {
    void sendOrderExpired(orderId);
  }

  return {
    expired: expiredRes.rowCount ?? 0,
    expiring: expiringRes.rowCount ?? 0,
    reactivated: reactivatedRes.rowCount ?? 0,
    orders_expired: ordersExpired.length,
  };
}

async function tick() {
  try {
    const r = await runExpiryPass();
    lastRunAt = new Date().toISOString();
    lastRunSummary =
      `expired=${r.expired} expiring=${r.expiring} reactivated=${r.reactivated} ` +
      `orders_expired=${r.orders_expired}`;
    if (r.expired || r.expiring || r.reactivated || r.orders_expired) {
      logger.info('worker', `Expiry pass: ${lastRunSummary}`);
    }
  } catch (err) {
    logger.error('worker', `Expiry pass failed: ${(err as Error).message}`);
  }
}

export function startExpiryWorker(): void {
  if (running) return;
  running = true;
  logger.info('worker', `Expiry worker started (every ${config.expiryWorkerIntervalMs}ms)`);
  // Run once immediately, then on the interval.
  void tick();
  timer = setInterval(tick, config.expiryWorkerIntervalMs);
}

export function stopExpiryWorker(): void {
  if (timer) clearInterval(timer);
  timer = null;
  running = false;
  logger.info('worker', 'Expiry worker stopped');
}

/** Restart handler used by the admin "Restart Worker" control. */
export function restartExpiryWorker(): void {
  stopExpiryWorker();
  startExpiryWorker();
  logger.info('worker', 'Expiry worker restarted by admin');
}

export function getWorkerStatus(): WorkerStatus {
  return {
    running,
    interval_ms: config.expiryWorkerIntervalMs,
    last_run_at: lastRunAt,
    last_run_summary: lastRunSummary,
  };
}
