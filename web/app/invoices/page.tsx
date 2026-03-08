
'use client';

import Link from 'next/link';
import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { WalletAuthControls } from '@/components/wallet-auth-controls';

interface Invoice {
  id: string;
  invoiceNumber?: string;
  clientName: string;
  clientEmail?: string;
  amount: number;
  asset: string;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  createdAt: string;
  dueDate?: string;
}

interface InvoicesPage {
  items: Invoice[];
  page: number;
  pageSize: number;
  total?: number;
  hasMore: boolean;
}

async function fetchInvoicesPage(page: number, pageSize: number): Promise<InvoicesPage> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(pageSize),
  }).toString();
  const response = await apiClient.get(`/invoices?${params}`);
  const data: unknown = response.data;

  if (Array.isArray(data)) {
    const items: Invoice[] = data as Invoice[];
    return {
      items,
      page,
      pageSize,
      total: items.length,
      hasMore: items.length === pageSize,
    };
  }

  const obj = (data ?? {}) as {
    items?: unknown;
    total?: unknown;
    hasMore?: unknown;
  };
  const items: Invoice[] = Array.isArray(obj.items) ? (obj.items as Invoice[]) : [];
  const total: number | undefined = typeof obj.total === 'number' ? obj.total : undefined;
  const hasMore =
    typeof obj.hasMore === 'boolean'
      ? obj.hasMore
      : total != null
        ? page * pageSize < total
        : items.length === pageSize;

  return total != null
    ? { items, page, pageSize, hasMore, total }
    : { items, page, pageSize, hasMore };
}

export default function InvoicesPage() {
  const pageSize = 20;

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ['invoices', pageSize],
    queryFn: async ({ pageParam }: { pageParam: number }) =>
      fetchInvoicesPage(pageParam, pageSize),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
  });

  const invoices = data?.pages.flatMap((page) => page.items) ?? [];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'overdue':
        return 'bg-red-100 text-red-800';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Invoices</h1>
          <p className="mt-2 text-gray-600">View and manage your invoices</p>
        </div>

        <div className="mb-6">
          <WalletAuthControls />
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 rounded-md bg-red-50 p-4">
            <p className="text-sm font-medium text-red-900">
              Error loading invoices: {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </div>
        )}

        {/* Loading State */}
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-gray-200" />
            ))}
          </div>
        ) : invoices.length === 0 ? (
          <div className="text-center">
            <p className="text-gray-500">No invoices found</p>
          </div>
        ) : (
          <>
            {/* Invoices Table */}
            <div className="overflow-hidden rounded-lg bg-white shadow">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-gray-200 bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                        Invoice #
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                        Client
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium uppercase text-gray-500">
                        Amount
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                        Created
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium uppercase text-gray-500">
                        Status
                      </th>
                      <th className="px-6 py-3 text-center text-xs font-medium uppercase text-gray-500">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {invoices.map((invoice) => (
                      <tr key={invoice.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">
                          {invoice.invoiceNumber || `#${invoice.id.slice(0, 8)}`}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {invoice.clientName}
                        </td>
                        <td className="px-6 py-4 text-right text-sm font-medium text-gray-900">
                          {invoice.amount.toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 7,
                          })}{' '}
                          {invoice.asset}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">
                          {formatDate(invoice.createdAt)}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getStatusColor(
                              invoice.status,
                            )}`}
                          >
                            {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center text-sm">
                          <Link
                            href={`/invoices/${invoice.id}`}
                            className="inline-flex rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Load More Button */}
            {hasNextPage && (
              <div className="mt-6 text-center">
                <button
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  className="inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {isFetchingNextPage ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}