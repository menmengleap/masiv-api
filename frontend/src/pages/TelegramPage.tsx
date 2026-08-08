import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Send,
  Users,
  ShoppingCart,
  MessageSquare,
  Wifi,
  WifiOff,
  RefreshCw,
  PlugZap,
  PackageCheck,
  Settings as SettingsIcon,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { TelegramStatus } from '../lib/types';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { PageHeader } from '../components/PageHeader';
import { Card, CardBody, CardHeader } from '../components/Card';
import { StatCard } from '../components/StatCard';
import { LoadingState } from '../components/Spinner';
import { ErrorState } from '../components/States';
import { formatNumber, formatRelative } from '../lib/format';

export function TelegramPage() {
  const toast = useToast();
  const fetchStatus = useCallback((s: AbortSignal) => api.get<TelegramStatus>('/api/telegram/status', undefined, s), []);
  const status = useApi(fetchStatus, [], { pollMs: 15_000 });
  const [busy, setBusy] = useState<'test' | 'sync' | 'worker' | null>(null);

  const run = async (
    action: 'test' | 'sync' | 'worker',
    path: string,
    onOk: (res: unknown) => string,
  ) => {
    setBusy(action);
    try {
      const res = await api.post(path);
      toast.success(onOk(res));
      status.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  };

  const s = status.data;
  const connected = !!s?.connected;

  return (
    <div>
      <PageHeader
        title="Telegram Bot"
        description="Control the customer-facing store bot. The package menu is served live from the database — no redeploy to add packages."
        actions={
          <Link to="/settings" className="btn-ghost">
            <SettingsIcon className="h-4 w-4" />
            Bot settings
          </Link>
        }
      />

      {status.initialLoading ? (
        <Card><LoadingState /></Card>
      ) : status.error && !status.data ? (
        <Card><ErrorState message={status.error} onRetry={status.refetch} /></Card>
      ) : (
        <div className="space-y-6">
          {/* Connection */}
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div className="flex items-center gap-3">
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ring-1 ring-inset ${connected ? 'bg-ok/10 text-ok ring-ok/20' : 'bg-danger/10 text-danger ring-danger/20'}`}>
                  {connected ? <Wifi className="h-6 w-6" /> : <WifiOff className="h-6 w-6" />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-base font-semibold text-white">{s?.status ?? 'Unknown'}</p>
                    {s?.bot_username && (
                      <span className="rounded-full bg-ink-700 px-2 py-0.5 text-xs text-brand-400">
                        @{s.bot_username}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    {s?.configured ? 'Bot token configured' : 'Bot token not set — configure TELEGRAM_BOT_TOKEN'}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn-ghost"
                  disabled={busy !== null}
                  onClick={() =>
                    run('test', '/api/telegram/test', (r) => {
                      const res = r as { ok: boolean; message: string };
                      return res.ok ? res.message : `Test failed: ${res.message}`;
                    })
                  }
                >
                  <PlugZap className={`h-4 w-4 ${busy === 'test' ? 'animate-pulse' : ''}`} />
                  Test connection
                </button>
                <button
                  className="btn-ghost"
                  disabled={busy !== null}
                  onClick={() =>
                    run('sync', '/api/telegram/sync-packages', (r) => {
                      const res = r as { packages: number };
                      return `Synced — ${res.packages} active package(s) live`;
                    })
                  }
                >
                  <PackageCheck className={`h-4 w-4 ${busy === 'sync' ? 'animate-pulse' : ''}`} />
                  Sync packages
                </button>
                <button
                  className="btn-ghost"
                  disabled={busy !== null}
                  onClick={() => run('worker', '/api/telegram/restart-worker', () => 'Worker restarted')}
                >
                  <RefreshCw className={`h-4 w-4 ${busy === 'worker' ? 'animate-spin' : ''}`} />
                  Restart worker
                </button>
              </div>
            </div>
          </Card>

          {/* Telemetry */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Total Users" value={formatNumber(s?.stats.total_users)} icon={Users} accent="brand" />
            <StatCard label="Orders Today" value={formatNumber(s?.stats.orders_today)} icon={ShoppingCart} accent="info" />
            <StatCard label="Messages Today" value={formatNumber(s?.stats.messages_today)} icon={MessageSquare} accent="ok" />
          </div>

          {/* Worker mini status */}
          <Card>
            <CardHeader title="Background worker" subtitle="Handles expiry + releasing timed-out orders." />
            <CardBody>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className={`h-2 w-2 rounded-full ${s?.worker.running ? 'bg-ok' : 'bg-danger'}`} />
                  <span className="text-gray-300">{s?.worker.running ? 'Running' : 'Stopped'}</span>
                  {s?.worker.last_run_at && (
                    <span className="text-gray-500">· last run {formatRelative(s.worker.last_run_at)}</span>
                  )}
                </div>
                {s?.worker.last_run_summary && (
                  <code className="rounded-lg bg-ink-900 px-3 py-1.5 font-mono text-xs text-gray-400">
                    {s.worker.last_run_summary}
                  </code>
                )}
              </div>
            </CardBody>
          </Card>

          <div className="flex items-start gap-3 rounded-xl border border-ink-700 bg-ink-850 p-4">
            <Send className="mt-0.5 h-5 w-5 shrink-0 text-brand-400" />
            <p className="text-sm text-gray-500">
              Customize the welcome message, USDT wallet, network, and payment timeout under{' '}
              <Link to="/settings" className="text-brand-400 hover:text-brand">Settings</Link>. All bot content is
              database-driven.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
