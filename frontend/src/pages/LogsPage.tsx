import { useCallback, useState } from 'react';
import { ScrollText, ShieldCheck, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import type { AuditLogView, LogEntry, LogLevel, LogSource } from '../lib/types';
import { useApi } from '../hooks/useApi';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Table, THead, TBody, TR } from '../components/Table';
import { LoadingState } from '../components/Spinner';
import { EmptyState, ErrorState } from '../components/States';
import { clsx } from '../components/clsx';
import { formatDateTime } from '../lib/format';

type Tab = 'system' | 'audit';

const SOURCE_FILTERS: Array<{ value: LogSource | ''; label: string }> = [
  { value: '', label: 'All sources' },
  { value: 'api', label: 'API' },
  { value: 'bot', label: 'Bot' },
  { value: 'worker', label: 'Worker' },
  { value: 'db', label: 'Database' },
  { value: 'system', label: 'System' },
];

export function LogsPage() {
  const [tab, setTab] = useState<Tab>('system');

  return (
    <div>
      <PageHeader
        title="Logs"
        description="Live system activity and the immutable audit trail of admin actions."
      />

      <div className="mb-4 inline-flex rounded-xl border border-ink-700 bg-ink-850 p-1">
        <TabButton active={tab === 'system'} onClick={() => setTab('system')} icon={ScrollText}>
          System
        </TabButton>
        <TabButton active={tab === 'audit'} onClick={() => setTab('audit')} icon={ShieldCheck}>
          Audit trail
        </TabButton>
      </div>

      {tab === 'system' ? <SystemLogs /> : <AuditLogs />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors',
        active ? 'bg-brand text-white' : 'text-gray-400 hover:text-gray-200',
      )}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}

const LEVEL_STYLE: Record<LogLevel, string> = {
  info: 'text-sky-400',
  warn: 'text-warn',
  error: 'text-danger',
  debug: 'text-gray-500',
};

function SystemLogs() {
  const [source, setSource] = useState<LogSource | ''>('');
  const fetchLogs = useCallback(
    (signal: AbortSignal) =>
      api.get<{ items: LogEntry[] }>(
        '/api/logs/system',
        { limit: 300, source: source || undefined },
        signal,
      ),
    [source],
  );
  const logs = useApi(fetchLogs, [source], { pollMs: 10_000 });
  // Ring buffer returns oldest→newest; show newest first.
  const items = [...(logs.data?.items ?? [])].reverse();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <select
          className="input max-w-xs"
          value={source}
          onChange={(e) => setSource(e.target.value as LogSource | '')}
        >
          {SOURCE_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <button className="btn-ghost" onClick={logs.refetch}>
          <RefreshCw className={clsx('h-4 w-4', logs.loading && !logs.initialLoading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      <Card>
        {logs.initialLoading ? (
          <LoadingState />
        ) : logs.error && !logs.data ? (
          <ErrorState message={logs.error} onRetry={logs.refetch} />
        ) : !items.length ? (
          <EmptyState icon={ScrollText} title="No log entries" hint="Activity will stream in as the system runs." />
        ) : (
          <div className="max-h-[70vh] overflow-auto p-2 font-mono text-xs leading-relaxed">
            {items.map((e, i) => (
              <div
                key={`${e.ts}-${i}`}
                className="flex gap-3 rounded px-2 py-1 hover:bg-ink-800/60"
              >
                <span className="shrink-0 text-gray-600">{formatDateTime(e.ts)}</span>
                <span className={clsx('w-12 shrink-0 font-semibold uppercase', LEVEL_STYLE[e.level])}>
                  {e.level}
                </span>
                <span className="w-14 shrink-0 text-brand-400">{e.source}</span>
                <span className="whitespace-pre-wrap break-words text-gray-300">{e.message}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function AuditLogs() {
  const fetchAudit = useCallback(
    (signal: AbortSignal) => api.get<{ items: AuditLogView[] }>('/api/logs/audit', { limit: 200 }, signal),
    [],
  );
  const audit = useApi(fetchAudit, []);
  const items = audit.data?.items ?? [];

  return (
    <Card>
      {audit.initialLoading ? (
        <LoadingState />
      ) : audit.error && !audit.data ? (
        <ErrorState message={audit.error} onRetry={audit.refetch} />
      ) : !items.length ? (
        <EmptyState icon={ShieldCheck} title="No audit entries" hint="Admin actions are recorded here." />
      ) : (
        <Table>
          <THead>
            <th className="th">Time</th>
            <th className="th">Admin</th>
            <th className="th">Action</th>
            <th className="th">Entity</th>
            <th className="th">Details</th>
          </THead>
          <TBody>
            {items.map((a) => (
              <TR key={a.id}>
                <td className="td whitespace-nowrap text-gray-400">{formatDateTime(a.created_at)}</td>
                <td className="td text-gray-200">{a.admin_username ?? <span className="text-gray-600">system</span>}</td>
                <td className="td">
                  <code className="rounded bg-ink-800 px-2 py-0.5 font-mono text-xs text-brand-400">{a.action}</code>
                </td>
                <td className="td text-gray-400">
                  {a.entity_type ? (
                    <span>
                      {a.entity_type}
                      {a.entity_id && <span className="text-gray-600"> · {a.entity_id.slice(0, 8)}</span>}
                    </span>
                  ) : (
                    <span className="text-gray-600">—</span>
                  )}
                </td>
                <td className="td">
                  {a.metadata && Object.keys(a.metadata).length ? (
                    <code className="font-mono text-[11px] text-gray-500">{JSON.stringify(a.metadata)}</code>
                  ) : (
                    <span className="text-gray-600">—</span>
                  )}
                </td>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
