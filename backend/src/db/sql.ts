/**
 * Shared SQL fragments.
 *
 * `expires_at` is the single source of truth for expiry. `days_left` is ALWAYS
 * computed on read — never stored — so the UI is correct even if the worker
 * hasn't run yet.
 *
 * days_left semantics: whole days remaining, rounded up, floored at 0.
 *   - a fresh 30-day token reads 30 for its first day, then 29, … then 1,
 *     then 0 once expired. NULL when the token hasn't started (no expires_at).
 */
export const DAYS_LEFT_SQL = `
  CASE
    WHEN t.expires_at IS NULL THEN NULL
    ELSE GREATEST(0, CEIL(EXTRACT(EPOCH FROM (t.expires_at - NOW())) / 86400.0))::int
  END
`;

/**
 * Effective status computed on read, so the UI reflects reality even before
 * the worker updates the stored `status`. Only applies to started tokens.
 */
export function effectiveStatusSql(expiringThresholdDays: number): string {
  return `
    CASE
      WHEN t.status IN ('stock','reserved','disabled') THEN t.status
      WHEN t.expires_at IS NULL THEN t.status
      WHEN t.expires_at <= NOW() THEN 'expired'
      WHEN t.expires_at <= NOW() + INTERVAL '${expiringThresholdDays} days' THEN 'expiring'
      ELSE 'active'
    END
  `;
}
