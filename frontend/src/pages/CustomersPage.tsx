import { useCallback, useEffect, useState } from 'react';
import { Search, User } from 'lucide-react';
import { api } from '../lib/api';
import type { CustomerView, Paginated } from '../lib/types';
import { useApi } from '../hooks/useApi';
import { PageHeader } from '../components/PageHeader';
import { Card } from '../components/Card';
import { Table, THead, TBody, TR } from '../components/Table';
import { LoadingState } from '../components/Spinner';
import { EmptyState, ErrorState } from '../components/States';
import { Pagination } from '../components/Pagination';
import { formatDate, formatMoney, formatNumber } from '../lib/format';

const PAGE_SIZE = 20;

export function CustomersPage() {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(0);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebounced(search);
      setPage(0);
    }, 350);
    return () => window.clearTimeout(id);
  }, [search]);

  const fetchCustomers = useCallback(
    (signal: AbortSignal) =>
      api.get<Paginated<CustomerView>>(
        '/api/customers',
        { search: debounced || undefined, limit: PAGE_SIZE, offset: page * PAGE_SIZE },
        signal,
      ),
    [debounced, page],
  );
  const customers = useApi(fetchCustomers, [debounced, page]);

  const items = customers.data?.items ?? [];
  const total = customers.data?.total ?? 0;

  const displayName = (c: CustomerView) => {
    const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim();
    return name || c.telegram_username || 'Telegram user';
  };

  return (
    <div>
      <PageHeader title="Customers" description="Everyone who has interacted with the store bot." />

      <div className="mb-4 max-w-md">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            className="input pl-9"
            placeholder="Search by name, username, or Telegram ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Card>
        {customers.initialLoading ? (
          <LoadingState />
        ) : customers.error && !customers.data ? (
          <ErrorState message={customers.error} onRetry={customers.refetch} />
        ) : !items.length ? (
          <EmptyState
            icon={User}
            title="No customers found"
            hint={debounced ? 'Try a different search.' : 'Customers appear here after they use the bot.'}
          />
        ) : (
          <Table>
            <THead>
              <th className="th">Customer</th>
              <th className="th">Telegram</th>
              <th className="th">Orders</th>
              <th className="th">Active APIs</th>
              <th className="th">Total Spent</th>
              <th className="th">Joined</th>
            </THead>
            <TBody>
              {items.map((c) => (
                <TR key={c.id}>
                  <td className="td">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/15 text-xs font-bold uppercase text-brand-400">
                        {displayName(c).slice(0, 2)}
                      </div>
                      <span className="text-gray-200">{displayName(c)}</span>
                    </div>
                  </td>
                  <td className="td">
                    {c.telegram_username ? (
                      <span className="text-gray-300">@{c.telegram_username}</span>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                    {c.telegram_user_id && (
                      <div className="text-xs text-gray-600">ID {c.telegram_user_id}</div>
                    )}
                  </td>
                  <td className="td">{formatNumber(c.orders_count)}</td>
                  <td className="td">
                    <span className={c.active_tokens > 0 ? 'text-ok' : 'text-gray-400'}>
                      {formatNumber(c.active_tokens)}
                    </span>
                  </td>
                  <td className="td whitespace-nowrap">{formatMoney(c.total_spent)}</td>
                  <td className="td whitespace-nowrap text-gray-400">{formatDate(c.created_at)}</td>
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
