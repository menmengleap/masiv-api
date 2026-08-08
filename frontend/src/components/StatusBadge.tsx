import { clsx } from './clsx';
import { statusLabel } from '../lib/format';

type Kind = 'ok' | 'warn' | 'danger' | 'neutral' | 'info' | 'brand';

const STYLES: Record<Kind, string> = {
  ok: 'bg-ok/15 text-ok ring-1 ring-inset ring-ok/30',
  warn: 'bg-warn/15 text-warn ring-1 ring-inset ring-warn/30',
  danger: 'bg-danger/15 text-danger ring-1 ring-inset ring-danger/30',
  neutral: 'bg-ink-700/60 text-gray-300 ring-1 ring-inset ring-ink-600',
  info: 'bg-sky-500/15 text-sky-400 ring-1 ring-inset ring-sky-500/30',
  brand: 'bg-brand/15 text-brand-400 ring-1 ring-inset ring-brand/30',
};

// Map every domain status to a colour bucket.
const STATUS_KIND: Record<string, Kind> = {
  // token
  stock: 'info',
  reserved: 'brand',
  active: 'ok',
  expiring: 'warn',
  expired: 'danger',
  disabled: 'neutral',
  // order
  pending: 'warn',
  paid: 'info',
  processing: 'info',
  completed: 'ok',
  cancelled: 'neutral',
  refunded: 'neutral',
  // payment
  confirmed: 'ok',
  failed: 'danger',
};

const DOT: Record<Kind, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
  neutral: 'bg-gray-400',
  info: 'bg-sky-400',
  brand: 'bg-brand',
};

export function StatusBadge({ status, dot = true }: { status: string; dot?: boolean }) {
  const kind = STATUS_KIND[status] ?? 'neutral';
  return (
    <span className={clsx('badge', STYLES[kind])}>
      {dot && <span className={clsx('h-1.5 w-1.5 rounded-full', DOT[kind])} />}
      {statusLabel(status)}
    </span>
  );
}

export function Badge({ kind = 'neutral', children }: { kind?: Kind; children: React.ReactNode }) {
  return <span className={clsx('badge', STYLES[kind])}>{children}</span>;
}
