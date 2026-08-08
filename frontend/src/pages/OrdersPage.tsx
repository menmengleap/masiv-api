import { useCallback, useState } from 'react';
import { Search } from 'lucide-react';
import { api } from '../lib/api';
import type { OrderStatus, OrderView, Paginated } from '../lib/types';
import { useApi } from '../hooks/useApi';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Table, THead, TBody, TR } from '../components/Table';
import { StatusBadge } from '../components/StatusBadge';
import { LoadingState } from '../components/Spinner';
import { EmptyState, ErrorState } from '../components/States';
import { Pagination } from '../components/Pagination';
import { OrderDetailModal } from '../components/OrderDetailModal';
import { formatDateTime, formatMoney, truncateMiddle } from '../lib/format';

const PAGE_SIZE = 20;
const STATUS_FILTERS: Array<{ value: OrderStatus | ''; label: string }> = [
  { value: '', label: 'All orders' },
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'expired', label: 'Expired' },
  { value: 'refunded', label: 'Refunded' },
];

export function OrdersPage() {
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<OrderView | null>(null);

  const fetchOrders = useCallback(
    (signal: AbortSignal) =>
      api.get<Paginated<OrderView>>(
        '/api/orders',
        { status: status || undefined, limit: PAGE_SIZE, offset: page * PAGE_SIZE },
        signal,
      ),
    [status, page],
  );
  const orders = useApi(fetchOrders, [status, page], { pollMs: 20_000 });

  const items = orders.data?.items ?? [];
  const total = orders.data?.total ?? 0;

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Purchases from the Telegram store. Confirm payments here — never on a bot button click alone."
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <select
            className="input pl-9"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as OrderStatus | '');
              setPage(0);
            }}
          >
            {STATUS_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Card>
        {orders.initialLoading ? (
          <LoadingState />
        ) : orders.error && !orders.data ? (
          <ErrorState message={orders.error} onRetry={orders.refetch} />
        ) : !items.length ? (
          <EmptyState title="No orders yet" hint="Orders will appear here once customers buy from the store." />
        ) : (
          <Table>
            <THead>
              <th className="th">Order</th>
              <th className="th">Customer</th>
              <th className="th">Package</th>
              <th className="th">Amount</th>
              <th className="th">Payment</th>
              <th className="th">Status</th>
              <th className="th">Created</th>
            </THead>
            <TBody>
              {items.map((o) => (
                <TR key={o.id} onClick={() => setSelected(o)}>
                  <td className="td font-mono text-xs text-gray-300">{o.order_number}</td>
                  <td className="td">
                    <div className="text-gray-200">{o.customer_label || 'Telegram user'}</div>
                    {o.telegram_user_id && (
                      <div className="text-xs text-gray-600">ID {o.telegram_user_id}</div>
                    )}
                  </td>
                  <td className="td">{o.package_name}</td>
                  <td className="td whitespace-nowrap">{formatMoney(o.amount, o.currency)}</td>
                  <td className="td">
                    {o.payment_status ? <StatusBadge status={o.payment_status} /> : <span className="text-gray-600">—</span>}
                    {o.transaction_hash && (
                      <div className="mt-0.5 font-mono text-[11px] text-gray-600">
                        {truncateMiddle(o.transaction_hash, 6, 6)}
                      </div>
                    )}
                  </td>
                  <td className="td"><StatusBadge status={o.status} /></td>
                  <td className="td whitespace-nowrap text-gray-400">{formatDateTime(o.created_at)}</td>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        {total > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />}
      </Card>

      <OrderDetailModal
        order={selected}
        onClose={() => setSelected(null)}
        onChanged={() => {
          setSelected(null);
          orders.refetch();
        }}
      />
    </div>
  );
}
