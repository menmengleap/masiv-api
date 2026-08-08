import { CheckCircle2, Info, XCircle } from 'lucide-react';
import { clsx } from './clsx';
import { useToast } from '../context/ToastContext';

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

const STYLES = {
  success: 'border-ok/40 text-ok',
  error: 'border-danger/40 text-danger',
  info: 'border-sky-500/40 text-sky-400',
};

export function ToastViewport() {
  const { toasts, dismiss } = useToast();
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((t) => {
        const Icon = ICONS[t.kind];
        return (
          <div
            key={t.id}
            className={clsx(
              'pointer-events-auto flex items-start gap-3 rounded-xl border bg-ink-800 px-4 py-3 shadow-2xl',
              STYLES[t.kind],
            )}
            role="status"
          >
            <Icon className="mt-0.5 h-5 w-5 shrink-0" />
            <p className="flex-1 text-sm text-gray-100">{t.message}</p>
            <button
              onClick={() => dismiss(t.id)}
              className="text-gray-500 hover:text-gray-300"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
