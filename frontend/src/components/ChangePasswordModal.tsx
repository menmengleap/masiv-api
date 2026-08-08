import { useState } from 'react';
import { api, ApiError } from '../lib/api';
import { useToast } from '../context/ToastContext';
import { Modal } from './Modal';
import { Spinner } from './Spinner';

export function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
    setError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (next !== confirm) {
      setError('New passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/api/auth/change-password', {
        current_password: current,
        new_password: next,
      });
      toast.success('Password changed');
      close();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to change password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Change password" size="sm">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label">Current password</label>
          <input
            type="password"
            className="input"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <div>
          <label className="label">New password</label>
          <input
            type="password"
            className="input"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        <div>
          <label className="label">Confirm new password</label>
          <input
            type="password"
            className="input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" className="btn-ghost" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy && <Spinner className="h-4 w-4" />}
            Update password
          </button>
        </div>
      </form>
    </Modal>
  );
}
