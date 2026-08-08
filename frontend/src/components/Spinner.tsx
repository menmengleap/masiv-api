import { Loader2 } from 'lucide-react';
import { clsx } from './clsx';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('animate-spin', className)} />;
}

/** Full-panel loading state used inside cards/tables during first load. */
export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
      <Spinner className="h-6 w-6 text-brand" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

/** Centered full-screen loader (auth boot). */
export function FullScreenLoader() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-ink-950">
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand text-black">
          <span className="text-xl font-black">M</span>
        </div>
        <Spinner className="h-5 w-5 text-brand" />
      </div>
    </div>
  );
}
