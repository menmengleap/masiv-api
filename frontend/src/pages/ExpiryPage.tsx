import { useCallback, useState } from 'react';
import { CalendarClock, Play, RefreshCw, Activity, CircleSlash, AlertTriangle } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { ExpiryOverview, TokenView } from '../lib/types';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { PageHeader } from '../components/PageHeader';
import { Card, CardHeader } from '../components/Card';
import { Table, THead, TBody, TR } from '../components/Table';
import { LoadingState } from '../components/Spinner';
import { EmptyState, ErrorState } from '../components/States';
import { computeDaysLeft, formatDateTime, formatRelative, formatTokens } from '../lib/format';

export function ExpiryPage() {
  const toast = useToast();
  const fetchExpiry = useCallback((s: AbortSignal) => api.get<ExpiryOverview>('/api/expiry', undefined, s), []);
  const expiry = useApi(fetchExpiry, [], { pollMs: 30_000 });
  const [running, setRunning] = useState(false);
  const [restarting, setRestarting] = useState(false);

  const runPass = async () => {
    setRunning(true);
    try {
      const res = await api.post<{ result: { expired: number; expiring: number; reactivated: number; orders_expired: number } }>(
        '/api/expiry/run',
      );
      const r = res.result;
      toast.success(`Pass complete — ${r.expired} expired, ${r.expiring} expiring, ${r.reactivated} reactivated`);
      expiry.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Run failed');
    } finally {
      setRunning(false);
    }
  };

  const restartWorker = async () => {
    setRestarting(true);
    try {
      await api.post('/api/expiry/restart-worker');
      toast.success('Expiry worker restarted');
      expiry.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Restart failed');
    } finally {
      setRestarting(false);
    }
  };

  const worker = expiry.data?.worker;

  return (
    <div>
      <PageHeader
        title="Expiry"
        description="Lifecycle of started API keys. Days-left is computed live from expiry date — accurate even between worker runs."
        actions={
          <>
            <button className="btn-ghost" onClick={restartWorker} disabled={restarting}>
              <RefreshCw className={`h-4 w-4 ${restarting ? 'animate-spin' : ''}`} />
              Restart worker
            </button>
            <button className="btn-primary" onClick={runPass} disabled={running}>
              <Play className="h-4 w-4" />
              Run expiry now
            </button>
          </>
        }
      />

      {/* Worker status */}
      <Card className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ring-1 ring-inset ${worker?.running ? 'bg-ok/10 text-ok ring-ok/20' : 'bg-danger/10 text-danger ring-danger/20'}`}>
              <CalendarClock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-100">
                Worker {worker?.running ? 'running' : 'stopped'}
              </p>
              <p className="text-xs text-gray-500">
                Interval {worker ? Math.round(worker.interval_ms / 1000) : '—'}s
                {worker?.last_run_at && <> · Last run {formatRelative(worker.last_run_at)}</>}
              </p>
            </div>
          </div>
          {worker?.last_run_summary && (
            <code className="rounded-lg bg-ink-900 px-3 py-1.5 font-mono text-xs text-gray-400">
              {worker.last_run_summary}
            </code>
          )}
        </div>
      </Card>

      {expiry.initialLoading ? (
        <Card><LoadingState /></Card>
      ) : expiry.error && !expiry.data ? (
        <Card><ErrorState message={expiry.error} onRetry={expiry.refetch} /></Card>
      ) : (
        <div className="space-y-6">
          <ExpiryGroup
            title="Expiring soon"
            subtitle="Within the expiring threshold — renew before they lapse."
            icon={AlertTriangle}
            accent="warn"
            tokens={expiry.data?.expiring ?? []}
            emptyHint="Nothing is close to expiring."
          />
          <ExpiryGroup
            title="Expired"
            subtitle="Past their expiry date."
            icon={CircleSlash}
            accent="danger"
            tokens={expiry.data?.expired ?? []}
            emptyHint="No expired keys."
          />
          <ExpiryGroup
            title="Active"
            subtitle="Comfortably valid."
            icon={Activity}
            accent="ok"
            tokens={expiry.data?.active ?? []}
            emptyHint="No active keys yet."
          />
        </div>
      )}
    </div>
  );
}

function ExpiryGroup({
  title,
  subtitle,
  icon: Icon,
  accent,
  tokens,
  emptyHint,
}: {
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: 'ok' | 'warn' | 'danger';
  tokens: TokenView[];
  emptyHint: string;
}) {
  const accentClass = {
    ok: 'bg-ok/10 text-ok ring-ok/20',
    warn: 'bg-warn/10 text-warn ring-warn/20',
    danger: 'bg-danger/10 text-danger ring-danger/20',
  }[accent];

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2.5">
            <span className={`flex h-7 w-7 items-center justify-center rounded-md ring-1 ring-inset ${accentClass}`}>
              <Icon className="h-4 w-4" />
            </span>
            {title}
            <span className="rounded-full bg-ink-700 px-2 py-0.5 text-xs text-gray-400">{tokens.length}</span>
          </span>
        }
        subtitle={subtitle}
      />
      {!tokens.length ? (
        <EmptyState title="Nothing here" hint={emptyHint} />
      ) : (
        <Table>
          <THead>
            <th className="th">API Key</th>
            <th className="th">Package</th>
            <th className="th">Tokens</th>
            <th className="th">Customer</th>
            <th className="th">Expires</th>
            <th className="th">Days Left</th>
          </THead>
          <TBody>
            {tokens.map((t) => {
              const daysLeft = computeDaysLeft(t.expires_at);
              return (
                <TR key={t.id}>
                  <td className="td font-mono text-gray-300">{t.masked_key}</td>
                  <td className="td">{t.package_name ?? '—'}</td>
                  <td className="td whitespace-nowrap">{formatTokens(t.total_tokens)}</td>
                  <td className="td">{t.customer_label || <span className="text-gray-600">—</span>}</td>
                  <td className="td whitespace-nowrap text-gray-400">{formatDateTime(t.expires_at)}</td>
                  <td className="td whitespace-nowrap">
                    {daysLeft === null ? (
                      <span className="text-gray-600">—</span>
                    ) : (
                      <span className={daysLeft <= 0 ? 'text-danger' : daysLeft <= 7 ? 'text-warn' : 'text-ok'}>
                        {daysLeft <= 0 ? 'Expired' : `${daysLeft}d`}
                      </span>
                    )}
                  </td>
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
