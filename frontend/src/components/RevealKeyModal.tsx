import { useEffect, useState } from 'react';
import { AlertTriangle, Eye } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { TokenView } from '../lib/types';
import { Modal } from './Modal';
import { Spinner } from './Spinner';
import { CopyButton } from './CopyButton';

/**
 * Reveals a full API key on explicit request. The reveal is audited server-side;
 * we surface that fact to the admin. The key is only fetched after confirmation
 * and never persisted client-side.
 */
export function RevealKeyModal({ token, onClose }: { token: TokenView | null; onClose: () => void }) {
  const [key, setKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Reset each time a new token is opened.
    setKey(null);
    setError(null);
    setLoading(false);
  }, [token?.id]);

  const doReveal = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const { api_key } = await api.post<{ api_key: string }>(`/api/stock/${token.id}/reveal`);
      setKey(api_key);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to reveal key');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={!!token}
      onClose={onClose}
      title="Reveal API key"
      description={token?.package_name ?? undefined}
      size="md"
    >
      {!key ? (
        <div className="space-y-4">
          <div className="flex gap-3 rounded-lg border border-warn/30 bg-warn/10 p-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-warn" />
            <p className="text-sm text-gray-300">
              Revealing decrypts the full key and records an audit log entry against your account.
              Only reveal when necessary.
            </p>
          </div>
          <div className="rounded-lg bg-ink-900 px-3 py-2 font-mono text-sm text-gray-400">
            {token?.masked_key}
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-3">
            <button className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn-primary" onClick={doReveal} disabled={loading}>
              {loading ? <Spinner className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              Reveal key
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="label">Full API key</label>
            <div className="flex items-start gap-2 rounded-lg border border-ink-700 bg-ink-900 p-3">
              <code className="flex-1 break-all font-mono text-sm text-ok">{key}</code>
              <CopyButton value={key} label="Copy" />
            </div>
          </div>
          <p className="text-xs text-gray-500">
            This value is shown once here and not stored in your browser. Close this dialog when done.
          </p>
          <div className="flex justify-end">
            <button className="btn-ghost" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
