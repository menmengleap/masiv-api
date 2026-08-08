import type { TokenStatus, TokenView } from './types';

/** Format a bigint-string token count as "2B", "750M", "1.5B", etc. */
export function formatTokens(value: string | number | bigint | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  let n: bigint;
  try {
    n = typeof value === 'bigint' ? value : BigInt(String(value).split('.')[0]);
  } catch {
    return String(value);
  }
  if (n < 0n) return String(value);

  const units: Array<[bigint, string]> = [
    [1_000_000_000_000n, 'T'],
    [1_000_000_000n, 'B'],
    [1_000_000n, 'M'],
    [1_000n, 'K'],
  ];
  for (const [base, suffix] of units) {
    if (n >= base) {
      // One decimal of precision, trimmed.
      const whole = n / base;
      const remainder = (n % base) * 10n / base;
      const dec = remainder === 0n ? '' : `.${remainder}`;
      return `${whole}${dec}${suffix}`;
    }
  }
  return n.toLocaleString('en-US');
}

/** Full grouped number: 2,000,000,000 */
export function formatTokensFull(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  try {
    return BigInt(String(value).split('.')[0]).toLocaleString('en-US');
  } catch {
    return String(value);
  }
}

/** Money — numeric string → "$1,234.50". */
export function formatMoney(value: string | number | null | undefined, currency = 'USDT'): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  const formatted = n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${formatted} ${currency}`;
}

export function formatNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '0';
  return Number(value).toLocaleString('en-US');
}

/** Absolute date+time, e.g. "Aug 8, 2026, 14:32". */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Compact relative time, e.g. "3m ago", "in 2d". */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return '—';
  const diffMs = d - Date.now();
  const abs = Math.abs(diffMs);
  const past = diffMs < 0;

  const units: Array<[number, string]> = [
    [1000, 's'],
    [60_000, 'm'],
    [3_600_000, 'h'],
    [86_400_000, 'd'],
  ];
  if (abs < 60_000) return past ? 'just now' : 'in <1m';
  let label = '';
  if (abs < 3_600_000) label = `${Math.round(abs / 60_000)}m`;
  else if (abs < 86_400_000) label = `${Math.round(abs / 3_600_000)}h`;
  else label = `${Math.round(abs / 86_400_000)}d`;
  void units;
  return past ? `${label} ago` : `in ${label}`;
}

/**
 * Live days-left from `expires_at` — the single source of truth. Computed in the
 * browser so the number is correct even if the expiry worker hasn't run yet.
 * Returns null for tokens that have never been started (no expiry clock).
 */
export function computeDaysLeft(expiresAt: string | null | undefined): number | null {
  if (!expiresAt) return null;
  const exp = new Date(expiresAt).getTime();
  if (Number.isNaN(exp)) return null;
  const diffMs = exp - Date.now();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / 86_400_000);
}

/**
 * Live effective status derived from expires_at + stored status, so the UI never
 * shows a stale "active" for something that has actually expired.
 */
export function effectiveStatus(token: TokenView, expiringThresholdDays = 7): TokenStatus {
  // Non-started / inventory states are authoritative as stored.
  if (token.status === 'stock' || token.status === 'reserved' || token.status === 'disabled') {
    return token.status;
  }
  if (!token.expires_at) return token.status;
  const daysLeft = computeDaysLeft(token.expires_at);
  if (daysLeft === null) return token.status;
  if (daysLeft <= 0) return 'expired';
  if (daysLeft <= expiringThresholdDays) return 'expiring';
  return 'active';
}

/** Human label for a status. */
export function statusLabel(status: TokenStatus | OrderLike): string {
  const map: Record<string, string> = {
    stock: 'Available',
    reserved: 'Reserved',
    active: 'Active',
    expiring: 'Expiring',
    expired: 'Expired',
    disabled: 'Disabled',
    pending: 'Pending',
    paid: 'Paid',
    processing: 'Processing',
    completed: 'Completed',
    cancelled: 'Cancelled',
    refunded: 'Refunded',
    confirmed: 'Confirmed',
    failed: 'Failed',
  };
  return map[status] ?? status;
}

type OrderLike = string;

export function truncateMiddle(value: string | null | undefined, head = 8, tail = 8): string {
  if (!value) return '—';
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}
