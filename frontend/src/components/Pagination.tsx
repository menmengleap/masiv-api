import { ChevronLeft, ChevronRight } from 'lucide-react';

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);

  return (
    <div className="flex items-center justify-between border-t border-ink-700/70 px-5 py-3">
      <p className="text-xs text-gray-500">
        Showing <span className="text-gray-300">{from}</span>–<span className="text-gray-300">{to}</span> of{' '}
        <span className="text-gray-300">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        <button
          className="btn-ghost px-2 py-1.5"
          onClick={() => onPage(page - 1)}
          disabled={page === 0}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-xs text-gray-400">
          Page {page + 1} / {totalPages}
        </span>
        <button
          className="btn-ghost px-2 py-1.5"
          onClick={() => onPage(page + 1)}
          disabled={page + 1 >= totalPages}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
