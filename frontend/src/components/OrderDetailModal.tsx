import { useEffect, useState } from 'react';
import { CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import type { OrderView } from '../lib/types';
import { useToast } from '../context/ToastContext';
import { Modal } from './Modal';
import { Spinner } from './Spinner';
import { StatusBadge } from './StatusBadge';
import { CopyButton } from './CopyButton';
import { formatDateTime, formatMoney } from '../lib/format';

export function OrderDetailModal({
  order,
  onClose,
  onChanged,
}: {
  order: OrderView | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [txHash, setTxHash] = useState('');
  const [busy, setBusy] = useState<'confirm' | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTxHash(order?.transaction_hash ?? '');
    setError(null);
    setBusy(null);
  }, [order?.id, order?.transaction_hash]);

  if (!order) return null;

  const canAct = order.status === 'pending';

  const confirm = async () => {
    setBusy('confirm');
    setError(null);
    try {
      await api.post(`/api/orders/${order.id}/confirm-payment`, {
        transaction_hash: txHash.trim() || null,
      });
      toast.success('Payment confirmed — credentials delivered');
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Confirmation failed');
      setBusy(null);
    }
  };

  const cancel = async () => {
    setBusy('cancel');
    setError(null);
    try {
      await api.post(`/api/orders/${order.id}/cancel`);
      toast.success('Order cancelled — reserved stock released');
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Cancel failed');
      setBusy(null);
    }
  };

  return (
    <Modal open={!!order} onClose={busy ? () => {} : onClose} title={`Order ${order.order_number}`} size="md">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <Field label="Status"><StatusBadge status={order.status} /></Field>
          <Field label="Payment">
            {order.payment_status ? <StatusBadge status={order.payment_status} /> : '—'}
          </Field>
          <Field label="Customer">
            <span className="text-gray-200">{order.customer_label || 'Telegram user'}</span>
          </Field>
          <Field label="Telegram ID">
            <span className="text-gray-200">{order.telegram_user_id ?? '—'}</span>
          </Field>
          <Field label="Package"><span className="text-gray-200">{order.package_name}</span></Field>
          <Field label="Amount"><span className="text-gray-200">{formatMoney(order.amount, order.currency)}</span></Field>
          <Field label="Method">
            <span className="text-gray-200">
              {order.payment_method
                ? { khqr: '🇰🇭 KHQR', usdt: '💵 USDT (crypto)', manual: '✍️ Manual' }[order.payment_method]
                : '—'}
            </span>
          </Field>
          <Field label="Created"><span className="text-gray-200">{formatDateTime(order.created_at)}</span></Field>
          <Field label="Completed"><span className="text-gray-200">{formatDateTime(order.completed_at)}</span></Field>
        </div>

        {order.transaction_hash && (
          <div>
            <p className="label">Submitted transaction hash</p>
            <div className="flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2">
              <code className="flex-1 break-all font-mono text-xs text-gray-300">{order.transaction_hash}</code>
              <CopyButton value={order.transaction_hash} />
            </div>
          </div>
        )}

        {canAct ? (
          <div className="space-y-4 rounded-xl border border-ink-700 bg-ink-900/50 p-4">
            <div className="flex items-start gap-2.5">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-400" />
              <p className="text-sm text-gray-400">
                Confirm only after you've <span className="text-gray-200">verified the payment on-chain</span>.
                Confirming activates the reserved API key, starts its expiry clock, and delivers credentials to
                the customer over Telegram.
              </p>
            </div>
            <div>
              <label className="label">Transaction hash (optional record)</label>
              <input
                className="input font-mono"
                placeholder="0x…"
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
                spellCheck={false}
              />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <div className="flex items-center justify-between gap-3">
              <button className="btn-danger" onClick={cancel} disabled={busy !== null}>
                {busy === 'cancel' ? <Spinner className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                Cancel order
              </button>
              <button className="btn-primary" onClick={confirm} disabled={busy !== null}>
                {busy === 'confirm' ? <Spinner className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                Confirm payment
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-ink-700 bg-ink-900/50 px-4 py-3 text-sm text-gray-500">
            {order.status === 'completed'
              ? 'This order is complete and credentials were delivered.'
              : `This order is ${order.status} — no further action available.`}
          </div>
        )}
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <div className="mt-1">{children}</div>
    </div>
  );
}
