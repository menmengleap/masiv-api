import { useCallback, useState } from 'react';
import { Plus, Pencil, Trash2, Package as PackageIcon, Boxes } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { PackageView } from '../lib/types';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { Badge } from '../components/StatusBadge';
import { LoadingState } from '../components/Spinner';
import { EmptyState, ErrorState } from '../components/States';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { PackageFormModal } from '../components/PackageFormModal';
import { formatMoney, formatTokens, formatTokensFull } from '../lib/format';

export function PackagesPage() {
  const toast = useToast();
  const fetchPackages = useCallback((s: AbortSignal) => api.get<PackageView[]>('/api/packages', undefined, s), []);
  const packages = useApi(fetchPackages, []);

  const [editing, setEditing] = useState<PackageView | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<PackageView | null>(null);

  const deletePackage = async () => {
    if (!toDelete) return;
    try {
      await api.del(`/api/packages/${toDelete.id}`);
      toast.success('Package deleted');
      packages.refetch();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Delete failed');
      throw err;
    }
  };

  const items = packages.data ?? [];

  return (
    <div>
      <PageHeader
        title="Packages"
        description="Store catalogue. Prices, validity, and availability are all configurable here — nothing is hardcoded."
        actions={
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            New package
          </button>
        }
      />

      {packages.initialLoading ? (
        <Card><LoadingState /></Card>
      ) : packages.error && !packages.data ? (
        <Card><ErrorState message={packages.error} onRetry={packages.refetch} /></Card>
      ) : !items.length ? (
        <Card>
          <EmptyState
            icon={PackageIcon}
            title="No packages yet"
            hint="Upload an API key and a package is created automatically, or add one manually."
            action={<button className="btn-primary" onClick={() => setCreating(true)}>New package</button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((p) => (
            <div key={p.id} className="card flex flex-col p-5">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-base font-semibold text-white">{p.name}</h3>
                    {p.is_active ? (
                      <Badge kind="ok">Active</Badge>
                    ) : (
                      <Badge kind="neutral">Inactive</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500" title={formatTokensFull(p.total_tokens)}>
                    {formatTokens(p.total_tokens)} tokens
                  </p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand-400 ring-1 ring-inset ring-brand/20">
                  <PackageIcon className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-4 flex items-end justify-between">
                <div>
                  <p className="text-2xl font-bold text-white">{formatMoney(p.price)}</p>
                  <p className="text-xs text-gray-500">{p.default_valid_days} days validity</p>
                </div>
                <div className="text-right">
                  <div className="flex items-center justify-end gap-1.5 text-sm">
                    <Boxes className="h-4 w-4 text-gray-500" />
                    <span className={p.stock_available > 0 ? 'text-ok' : 'text-danger'}>
                      {p.stock_available}
                    </span>
                    <span className="text-gray-600">/ {p.stock_total} in stock</span>
                  </div>
                  {p.stock_available === 0 && (
                    <div className="mt-1">
                      <StatusBadge status="expired" dot={false} />
                    </div>
                  )}
                </div>
              </div>

              {p.description && (
                <p className="mt-3 line-clamp-2 text-sm text-gray-500">{p.description}</p>
              )}

              <div className="mt-4 flex items-center gap-2 border-t border-ink-700/70 pt-4">
                <button className="btn-ghost flex-1" onClick={() => setEditing(p)}>
                  <Pencil className="h-4 w-4" />
                  Edit
                </button>
                <button
                  className="btn-ghost text-danger hover:bg-danger/10"
                  onClick={() => setToDelete(p)}
                  title="Delete package"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <PackageFormModal
        open={creating}
        mode="create"
        onClose={() => setCreating(false)}
        onSaved={() => {
          setCreating(false);
          packages.refetch();
        }}
      />
      <PackageFormModal
        open={!!editing}
        mode="edit"
        pkg={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          packages.refetch();
        }}
      />
      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={deletePackage}
        title="Delete package"
        danger
        confirmLabel="Delete"
        message={
          <>
            Delete <span className="font-medium text-gray-200">{toDelete?.name}</span>? This will remove
            all unsold stock and unlink existing orders.
          </>
        }
      />
    </div>
  );
}
