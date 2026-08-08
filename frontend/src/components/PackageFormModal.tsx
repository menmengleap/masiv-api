import { useEffect, useState } from 'react';
import { api, ApiError } from '../lib/api';
import type { PackageView } from '../lib/types';
import { useToast } from '../context/ToastContext';
import { Modal } from './Modal';
import { Spinner } from './Spinner';

interface Props {
  open: boolean;
  mode: 'create' | 'edit';
  pkg?: PackageView | null;
  onClose: () => void;
  onSaved: () => void;
}

export function PackageFormModal({ open, mode, pkg, onClose, onSaved }: Props) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [totalTokens, setTotalTokens] = useState('');
  const [price, setPrice] = useState('');
  const [validDays, setValidDays] = useState('30');
  const [sortOrder, setSortOrder] = useState('0');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hydrate when opening.
  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && pkg) {
      setName(pkg.name);
      setTotalTokens(pkg.total_tokens);
      setPrice(String(Number(pkg.price)));
      setValidDays(String(pkg.default_valid_days));
      setSortOrder(String(pkg.sort_order));
      setDescription(pkg.description ?? '');
      setIsActive(pkg.is_active);
    } else {
      setName('');
      setTotalTokens('');
      setPrice('');
      setValidDays('30');
      setSortOrder('0');
      setDescription('');
      setIsActive(true);
    }
    setError(null);
  }, [open, mode, pkg]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'create') {
        await api.post('/api/packages', {
          name: name.trim(),
          total_tokens: totalTokens.trim(),
          price: Number(price),
          default_valid_days: Number(validDays),
          sort_order: Number(sortOrder),
          description: description.trim() || null,
          is_active: isActive,
        });
        toast.success('Package created');
      } else if (pkg) {
        // total_tokens is immutable (it's the package identity) — not sent on edit.
        await api.patch(`/api/packages/${pkg.id}`, {
          name: name.trim(),
          price: Number(price),
          default_valid_days: Number(validDays),
          sort_order: Number(sortOrder),
          description: description.trim() || null,
          is_active: isActive,
        });
        toast.success('Package updated');
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title={mode === 'create' ? 'New package' : 'Edit package'}
      description={mode === 'edit' ? 'Token amount is fixed — it defines the package identity.' : undefined}
    >
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>

        <div>
          <label className="label">Token Amount</label>
          <input
            className="input disabled:opacity-60"
            placeholder="2B, 750M, 5000000000…"
            value={totalTokens}
            onChange={(e) => setTotalTokens(e.target.value)}
            disabled={mode === 'edit'}
            required
          />
          {mode === 'create' && (
            <p className="mt-1 text-xs text-gray-500">Accepts 2B, 750M, 1.5B, or a raw number.</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Price (USD)</label>
            <input
              className="input"
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label">Valid Days</label>
            <input
              className="input"
              type="number"
              min="1"
              value={validDays}
              onChange={(e) => setValidDays(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Sort Order</label>
            <input
              className="input"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <label className="flex cursor-pointer items-center gap-2.5 pb-2">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-ink-600 bg-ink-900 text-brand focus:ring-brand/30"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <span className="text-sm text-gray-300">Active (visible in store)</span>
            </label>
          </div>
        </div>

        <div>
          <label className="label">Description <span className="text-gray-600">(optional)</span></label>
          <textarea
            className="input min-h-[60px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy && <Spinner className="h-4 w-4" />}
            {mode === 'create' ? 'Create package' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
