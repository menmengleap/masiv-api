import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { clsx } from './clsx';

export function CopyButton({
  value,
  className,
  label,
}: {
  value: string;
  className?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked — ignore silently.
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-gray-400 transition-colors hover:bg-ink-750 hover:text-gray-200',
        className,
      )}
      title="Copy to clipboard"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-ok" /> : <Copy className="h-3.5 w-3.5" />}
      {label && <span>{copied ? 'Copied' : label}</span>}
    </button>
  );
}
