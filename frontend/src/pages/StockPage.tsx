import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Search, Trash2, Ban, RotateCcw, Upload, MoreVertical } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { PackageView, Paginated, TokenStatus, TokenView } from '../lib/types';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Table, THead, TBody, TR } from '../components/Table';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingState } from '../components/Spinner';
import { EmptyState, ErrorState } from '../components/States';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { RevealKeyModal } from '../components/RevealKeyModal';
import { Pagination } from '../components/Pagination';
import {
  computeDaysLeft,
  effectiveStatus,
  formatDate,
  formatMoney,
  formatTokens,
} from '../lib/format';

const PAGE_SIZE = 20;
const STATUS_FILTERS: Array<{ value: TokenStatus | ''; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'stock', label: 'Available' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'active', label: 'Active' },
  { value: 'expiring', label: 'Expiring' },
  { value: 'expired', label: 'Expired' },
  { value: 'disabled', label: 'Disabled' },
];

export function StockPage() {
  const toast = useToast();
  const [status, setStatus] = useState<TokenStatus | ''>('');
  const [packageId, setPackageId] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);

  const [reveal, setReveal] = useState<TokenView | null>(null);
  const [toDelete, setToDelete] = useState<TokenView | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);

  // Debounce search input.
  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(0);
    }, 350);
    return () => window.clearTimeout(id);
  }, [search]);

  const fetchPackages = useCallback((s: AbortSignal) => api.get<PackageView[]>('/api/packages', undefined, s), []);
  const packages = useApi(fetchPackages, []);

  const fetchStock = useCallback(
    (signal: AbortSignal) =>
      api.get<Paginated<TokenView>>(
        '/api/stock',
        {
          status: status || undefined,
          package_id: packageId || undefined,
          search: debouncedSearch || undefined,
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        },
        signal,
      ),
    [status, packageId, debouncedSearch, page],
  );
  const stock = useApi(fetchStock, [status, packageId, debouncedSearch, page]);

  const setTokenStatus = async (token: TokenView, action: 'disable' | 'enable') => {
    setMenuId(null);
    try {
      await api.post(`/api/stock/${token.id}/${action}`);
      toast.success(action === 'disable' ? 'Token disabled' : 'Token re-enabled');
      stock.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Action failed');
    }
  };

  const deleteToken = async () => {
    if (!toDelete) return;
    try {
      await api.del(`/api/stock/${toDelete.id}`);
      toast.success('Token deleted');
      stock.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Delete failed');
      throw err;
    }
  };

  const items = stock.data?.items ?? [];
  const total = stock.data?.total ?? 0;

  return (
    <div>
      <PageHeader
        title="API Stock"
        description="All uploaded API keys. Keys are encrypted at rest and shown masked."
        actions={
          <Link to="/upload" className="btn-primary">
            <Upload className="h-4 w-4" />
            Upload API
          </Link>
        }
      />

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            className="input pl-9"
            placeholder="Search by base URL or last 4…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input sm:w-48"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as TokenStatus | '');
            setPage(0);
          }}
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <select
          className="input sm:w-52"
          value={packageId}
          onChange={(e) => {
            setPackageId(e.target.value);
            setPage(0);
          }}
        >
          <option value="">All packages</option>
          {packages.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <Card>
        {stock.initialLoading ? (
          <LoadingState />
        ) : stock.error && !stock.data ? (
          <ErrorState message={stock.error} onRetry={stock.refetch} />
        ) : !items.length ? (
          <EmptyState
            title="No API keys found"
            hint={debouncedSearch || status || packageId ? 'Try adjusting your filters.' : 'Upload your first API key to build stock.'}
          />
        ) : (
          <Table>
            <THead>
              <th className="th">API Key</th>
              <th className="th">Package</th>
              <th className="th">Tokens</th>
              <th className="th">Price</th>
              <th className="th">Status</th>
              <th className="th">Days Left</th>
              <th className="th">Uploaded</th>
              <th className="th text-right">Actions</th>
            </THead>
            <TBody>
              {items.map((t) => {
                const daysLeft = computeDaysLeft(t.expires_at);
                const eff = effectiveStatus(t);
                return (
                  <TR key={t.id}>
                    <td className="td">
                      <div className="font-mono text-gray-200">{t.masked_key}</div>
                      <div className="mt-0.5 truncate text-xs text-gray-600" title={t.base_url}>
                        {t.base_url}
                      </div>
                    </td>
                    <td className="td">{t.package_name ?? '—'}</td>
                    <td className="td whitespace-nowrap">{formatTokens(t.total_tokens)}</td>
                    <td className="td whitespace-nowrap">{formatMoney(t.price)}</td>
                    <td className="td">
                      <StatusBadge status={eff} />
                    </td>
                    <td className="td whitespace-nowrap">
                      {daysLeft === null ? (
                        <span className="text-gray-600">—</span>
                      ) : (
                        <span className={daysLeft <= 0 ? 'text-danger' : daysLeft <= 7 ? 'text-warn' : 'text-gray-200'}>
                          {daysLeft}d
                        </span>
                      )}
                    </td>
                    <td className="td whitespace-nowrap text-gray-400">{formatDate(t.created_at)}</td>
                    <td className="td">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          className="rounded-md p-1.5 text-gray-400 hover:bg-ink-750 hover:text-brand-400"
                          title="Reveal key"
                          onClick={() => setReveal(t)}
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <div className="relative">
                          <button
                            className="rounded-md p-1.5 text-gray-400 hover:bg-ink-750 hover:text-gray-200"
                            onClick={() => setMenuId(menuId === t.id ? null : t.id)}
                            onBlur={() => window.setTimeout(() => setMenuId((cur) => (cur === t.id ? null : cur)), 150)}
                            title="More"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                          {menuId === t.id && (
                            <div className="absolute right-0 z-10 mt-1 w-40 overflow-hidden rounded-lg border border-ink-700 bg-ink-850 shadow-xl">
                              {t.status === 'disabled' ? (
                                <button
                                  onMouseDown={(e) => { e.preventDefault(); void setTokenStatus(t, 'enable'); }}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-ink-800"
                                >
                                  <RotateCcw className="h-4 w-4" /> Re-enable
                                </button>
                              ) : (
                                <button
                                  onMouseDown={(e) => { e.preventDefault(); void setTokenStatus(t, 'disable'); }}
                                  disabled={!['stock'].includes(t.status)}
                                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-200 hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <Ban className="h-4 w-4" /> Disable
                                </button>
                              )}
                              <button
                                onMouseDown={(e) => { e.preventDefault(); setMenuId(null); setToDelete(t); }}
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-ink-800"
                              >
                                <Trash2 className="h-4 w-4" /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
        {total > PAGE_SIZE && (
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />
        )}
      </Card>

      <RevealKeyModal token={reveal} onClose={() => setReveal(null)} />
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={deleteToken}
        title="Delete API key"
        danger
        confirmLabel="Delete"
        message={
          <>
            This permanently removes the key <span className="font-mono text-gray-200">{toDelete?.masked_key}</span> from
            stock. Only unsold stock can be deleted. This cannot be undone.
          </>
        }
      />
    </div>
  );
}
