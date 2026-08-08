import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react';

export function EmptyState({
  icon: Icon = Inbox,
  title,
  hint,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-ink-800 text-gray-500">
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-200">{title}</p>
        {hint && <p className="mt-1 text-sm text-gray-500">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/15 text-danger">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-200">Something went wrong</p>
        <p className="mt-1 max-w-md text-sm text-gray-500">{message}</p>
      </div>
      {onRetry && (
        <button className="btn-ghost" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      )}
    </div>
  );
}
