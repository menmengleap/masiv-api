import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Boxes,
  PackageCheck,
  Activity,
  CalendarClock,
  CircleSlash,
  Package,
  ShoppingCart,
  DollarSign,
  Users,
  ArrowRight,
} from 'lucide-react';
import { api } from '../lib/api';
import type { DashboardStats, Paginated, TokenView } from '../lib/types';
import { useApi } from '../hooks/useApi';
import { PageHeader } from '../components/PageHeader';
import { StatCard } from '../components/StatCard';
import { Card, CardHeader } from '../components/Card';
import { Table, THead, TBody, TR } from '../components/Table';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingState } from '../components/Spinner';
import { EmptyState, ErrorState } from '../components/States';
import {
  computeDaysLeft,
  effectiveStatus,
  formatMoney,
  formatNumber,
  formatTokens,
} from '../lib/format';

export function DashboardPage() {
  const fetchStats = useCallback((signal: AbortSignal) => api.get<DashboardStats>('/api/dashboard/stats', undefined, signal), []);
  const fetchRecent = useCallback(
    (signal: AbortSignal) => api.get<Paginated<TokenView>>('/api/stock', { limit: 8 }, signal),
    [],
  );

  const stats = useApi(fetchStats, [], { pollMs: 30_000 });
  const recent = useApi(fetchRecent, []);

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Live overview of stock, revenue, and API lifecycle."
      />

      {stats.error && !stats.data ? (
        <ErrorState message={stats.error} onRetry={stats.refetch} />
      ) : (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Total API Stock" value={formatNumber(stats.data?.total_stock)} icon={Boxes} accent="neutral" loading={stats.initialLoading} />
          <StatCard label="Available Stock" value={formatNumber(stats.data?.available_stock)} icon={PackageCheck} accent="info" loading={stats.initialLoading} hint={`${formatNumber(stats.data?.reserved)} reserved`} />
          <StatCard label="Active APIs" value={formatNumber(stats.data?.active_apis)} icon={Activity} accent="ok" loading={stats.initialLoading} />
          <StatCard label="Expiring Soon" value={formatNumber(stats.data?.expiring_soon)} icon={CalendarClock} accent="warn" loading={stats.initialLoading} />
          <StatCard label="Expired APIs" value={formatNumber(stats.data?.expired_apis)} icon={CircleSlash} accent="danger" loading={stats.initialLoading} />
          <StatCard label="Total Packages" value={formatNumber(stats.data?.total_packages)} icon={Package} accent="brand" loading={stats.initialLoading} />
          <StatCard label="Orders Today" value={formatNumber(stats.data?.orders_today)} icon={ShoppingCart} accent="info" loading={stats.initialLoading} />
          <StatCard label="Revenue Today" value={formatMoney(stats.data?.revenue_today)} icon={DollarSign} accent="ok" loading={stats.initialLoading} hint={`${formatMoney(stats.data?.revenue_total)} all-time`} />
        </div>
      )}

      {/* Customers + revenue summary strip */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card flex items-center gap-4 p-5 lg:col-span-1">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand/10 text-brand-400 ring-1 ring-inset ring-brand/20">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">Total Customers</p>
            <p className="text-xl font-semibold text-white">{formatNumber(stats.data?.total_customers)}</p>
          </div>
        </div>
        <div className="card flex items-center justify-between p-5 lg:col-span-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-500">All-time Revenue</p>
            <p className="text-xl font-semibold text-white">{formatMoney(stats.data?.revenue_total)}</p>
          </div>
          <Link to="/orders" className="btn-ghost">
            View orders
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Recent stock */}
      <Card className="mt-6">
        <CardHeader
          title="Recent API Stock"
          subtitle="Most recently uploaded keys (masked)"
          action={
            <Link to="/stock" className="text-sm font-medium text-brand-400 hover:text-brand">
              View all
            </Link>
          }
        />
        {recent.initialLoading ? (
          <LoadingState />
        ) : recent.error && !recent.data ? (
          <ErrorState message={recent.error} onRetry={recent.refetch} />
        ) : !recent.data?.items.length ? (
          <EmptyState
            title="No API stock yet"
            hint="Upload your first API key to get started."
            action={
              <Link to="/upload" className="btn-primary">
                Upload API
              </Link>
            }
          />
        ) : (
          <Table>
            <THead>
              <th className="th">API Key</th>
              <th className="th">Package</th>
              <th className="th">Tokens</th>
              <th className="th">Status</th>
              <th className="th">Days Left</th>
            </THead>
            <TBody>
              {recent.data.items.map((t) => {
                const daysLeft = computeDaysLeft(t.expires_at);
                return (
                  <TR key={t.id}>
                    <td className="td font-mono text-gray-300">{t.masked_key}</td>
                    <td className="td">{t.package_name ?? '—'}</td>
                    <td className="td">{formatTokens(t.total_tokens)}</td>
                    <td className="td">
                      <StatusBadge status={effectiveStatus(t)} />
                    </td>
                    <td className="td">{daysLeft === null ? '—' : `${daysLeft}d`}</td>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
