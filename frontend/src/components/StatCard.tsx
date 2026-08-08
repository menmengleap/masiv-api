import { clsx } from './clsx';

type Accent = 'brand' | 'ok' | 'warn' | 'danger' | 'info' | 'neutral';

const ACCENT: Record<Accent, string> = {
  brand: 'text-brand-400 bg-brand/10 ring-brand/20',
  ok: 'text-ok bg-ok/10 ring-ok/20',
  warn: 'text-warn bg-warn/10 ring-warn/20',
  danger: 'text-danger bg-danger/10 ring-danger/20',
  info: 'text-sky-400 bg-sky-500/10 ring-sky-500/20',
  neutral: 'text-gray-300 bg-ink-700/50 ring-ink-600',
};

export function StatCard({
  label,
  value,
  icon: Icon,
  accent = 'neutral',
  hint,
  loading,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  accent?: Accent;
  hint?: string;
  loading?: boolean;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
          {loading ? (
            <div className="mt-2 h-8 w-20 animate-pulse rounded bg-ink-700" />
          ) : (
            <p className="mt-1.5 truncate text-2xl font-semibold text-white">{value}</p>
          )}
          {hint && !loading && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
        </div>
        <div className={clsx('flex h-10 w-10 items-center justify-center rounded-lg ring-1 ring-inset', ACCENT[accent])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
