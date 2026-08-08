import { useCallback, useState } from 'react';
import { Wallet, Filter } from 'lucide-react';
import { api } from '../lib/api';
import type { PaymentStatus, PaymentView, Paginated } from '../lib/types';
import { useApi } from '../hooks/useApi';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Table, THead, TBody, TR } from '../components/Table';
import { StatusBadge } from '../components/StatusBadge';
import { CopyButton } from '../components/CopyButton';
import { LoadingState } from '../components/Spinner';
import { EmptyState, ErrorState } from '../components/States';
import { Pagination } from '../components/Pagination';
import { formatDateTime, formatMoney, truncateMiddle } from '../lib/format';

const PAGE_SIZE = 20;
const STATUS_FILTERS: Array<{ value: PaymentStatus | ''; label: string }> = [
  { value: '', label: 'All payments' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'failed', label: 'Failed' },
  { value: 'expired', label: 'Expired' },
  { value: 'refunded', label: 'Refunded' },
];

export function PaymentsPage() {
  const [status, setStatus] = useState<PaymentStatus | ''>('');
  const [page, setPage] = useState(0);

  const fetchPayments = useCallback(
    (signal: AbortSignal) =>
      api.get<Paginated<PaymentView>>(
        '/api/payments',
        { status: status || undefined, limit: PAGE_SIZE, offset: page * PAGE_SIZE },
        signal,
      ),
    [status, page],
  );
  const payments = useApi(fetchPayments, [status, page], { pollMs: 20_000 });

  const items = payments.data?.items ?? [];
  const total = payments.data?.total ?? 0;

  return (
    <div>
      <PageHeader
        title="Payments"
        description="USDT payment records for store orders. Confirmation is verified server-side before credentials are released."
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-xs flex-1">
          <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <select
            className="input pl-9"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as PaymentStatus | '');
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
        {payments.initialLoading ? (
          <LoadingState />
        ) : payments.error && !payments.data ? (
          <ErrorState message={payments.error} onRetry={payments.refetch} />
        ) : !items.length ? (
          <EmptyState
            icon={Wallet}
            title="No payments yet"
            hint="Payment records appear here once customers begin checkout."
          />
        ) : (
          <Table>
            <THead>
              <th className="th">Order</th>
              <th className="th">Amount</th>
              <th className="th">Network</th>
              <th className="th">Wallet</th>
              <th className="th">Tx Hash</th>
              <th className="th">Status</th>
              <th className="th">Created</th>
              <th className="th">Confirmed</th>
            </THead>
            <TBody>
              {items.map((p) => (
                <TR key={p.id}>
                  <td className="td font-mono text-xs text-gray-300">{p.order_number}</td>
                  <td className="td whitespace-nowrap">{formatMoney(p.amount, p.currency)}</td>
                  <td className="td">{p.network || <span className="text-gray-600">—</span>}</td>
                  <td className="td">
                    {p.wallet_address ? (
                      <div className="flex items-center gap-1.5">
                        <code className="font-mono text-xs text-gray-400">{truncateMiddle(p.wallet_address, 6, 6)}</code>
                        <CopyButton value={p.wallet_address} />
                      </div>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                  <td className="td">
                    {p.transaction_hash ? (
                      <div className="flex items-center gap-1.5">
                        <code className="font-mono text-xs text-gray-400">{truncateMiddle(p.transaction_hash, 6, 6)}</code>
                        <CopyButton value={p.transaction_hash} />
                      </div>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                  </td>
                  <td className="td"><StatusBadge status={p.status} /></td>
                  <td className="td whitespace-nowrap text-gray-400">{formatDateTime(p.created_at)}</td>
                  <td className="td whitespace-nowrap text-gray-400">
                    {p.confirmed_at ? formatDateTime(p.confirmed_at) : <span className="text-gray-600">—</span>}
                  </td>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        {total > PAGE_SIZE && <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={setPage} />}
      </Card>
    </div>
  );
}
