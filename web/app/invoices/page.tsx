'use client';

import { useState, useMemo, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Copy } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { WalletAuthControls } from '@/components/wallet-auth-controls';
import { RequireAuth } from '@/components/require-auth';

interface Invoice {
  id: string;
  invoiceNumber?: string;
  clientName: string;
  clientEmail?: string;
  amount: number;
  asset: string;
  asset_code?: string;
  assetCode?: string;
  asset_issuer?: string;
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

interface SavedQuery {
  id: string;
  name: string;
  filters: {
    status: string;
    asset: string;
    dueDate: string;
    q: string;
  };
}

const PREDEFINED_QUERIES: SavedQuery[] = [
  {
    id: 'all',
    name: 'All Invoices',
    filters: { status: 'all', asset: 'all', dueDate: 'all', q: '' },
  },
  {
    id: 'pending',
    name: 'Pending Invoices',
    filters: { status: 'pending', asset: 'all', dueDate: 'all', q: '' },
  },
  {
    id: 'overdue',
    name: 'Overdue Invoices',
    filters: { status: 'overdue', asset: 'all', dueDate: 'all', q: '' },
  },
  {
    id: 'paid-usdc',
    name: 'Paid USDC',
    filters: { status: 'paid', asset: 'USDC', dueDate: 'all', q: '' },
  },
];

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

function InvoicesContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // URL State values on mount
  const urlStatus = searchParams.get('status') || 'all';
  const urlAsset = searchParams.get('asset') || 'all';
  const urlDueDate = searchParams.get('dueDate') || 'all';
  const urlQ = searchParams.get('q') || '';

  const [statusFilter, setStatusFilter] = useState(urlStatus);
  const [assetFilter, setAssetFilter] = useState(urlAsset);
  const [dueDateFilter, setDueDateFilter] = useState(urlDueDate);
  const [searchQuery, setSearchQuery] = useState(urlQ);

  const [prevSearchParams, setPrevSearchParams] = useState(searchParams);

  if (searchParams !== prevSearchParams) {
    setPrevSearchParams(searchParams);
    setStatusFilter(urlStatus);
    setAssetFilter(urlAsset);
    setDueDateFilter(urlDueDate);
    setSearchQuery(urlQ);
  }

  const [customQueries, setCustomQueries] = useState<SavedQuery[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveName, setSaveName] = useState('');

  const pageSize = 20;

  // Load custom queries on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('invoisio_saved_queries');
      if (stored) {
        const parsed = JSON.parse(stored);
        setTimeout(() => {
          setCustomQueries(parsed);
        }, 0);
      }
    } catch (e) {
      console.error('Failed to load saved queries', e);
    }
  }, []);

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } = useInfiniteQuery({
    queryKey: ['invoices', pageSize],
    queryFn: async ({ pageParam }: { pageParam: number }) =>
      fetchInvoicesPage(pageParam, pageSize),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
  });

  const rawInvoices = useMemo(() => {
    return data?.pages.flatMap((page) => page.items.map((inv) => ({
      ...inv,
      asset: inv.asset || inv.asset_code || inv.assetCode || 'XLM'
    }))) ?? [];
  }, [data]);

  const totalSystemInvoices = data?.pages[0]?.total ?? rawInvoices.length;

  const dynamicAssets = useMemo(() => {
    const assets = new Set<string>(['XLM', 'USDC']);
    rawInvoices.forEach((inv) => {
      if (inv.asset) {
        assets.add(inv.asset.toUpperCase());
      }
    });
    return Array.from(assets);
  }, [rawInvoices]);

  const filteredInvoices = useMemo(() => {
    return rawInvoices.filter((invoice) => {
      // Search
      const matchesSearch =
        invoice.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (invoice.invoiceNumber && invoice.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
        invoice.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (invoice.clientEmail && invoice.clientEmail.toLowerCase().includes(searchQuery.toLowerCase()));

      // Status
      const matchesStatus = statusFilter === 'all' || invoice.status === statusFilter;

      // Asset
      const matchesAsset = assetFilter === 'all' || invoice.asset.toUpperCase() === assetFilter.toUpperCase();

      // Due Date
      let matchesDueDate = true;
      if (dueDateFilter !== 'all') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const invoiceDueDate = invoice.dueDate ? new Date(invoice.dueDate) : null;
        if (invoiceDueDate) {
          invoiceDueDate.setHours(0, 0, 0, 0);
        }

        if (dueDateFilter === 'no_due_date') {
          matchesDueDate = !invoiceDueDate;
        } else if (dueDateFilter === 'has_due_date') {
          matchesDueDate = !!invoiceDueDate;
        } else if (dueDateFilter === 'overdue') {
          matchesDueDate =
            invoice.status === 'overdue' ||
            (!!invoiceDueDate && invoiceDueDate < today && invoice.status !== 'paid' && invoice.status !== 'cancelled');
        } else if (dueDateFilter === 'today') {
          matchesDueDate = !!invoiceDueDate && invoiceDueDate.getTime() === today.getTime();
        } else if (dueDateFilter === 'this_week') {
          const endOfWeek = new Date(today);
          endOfWeek.setDate(today.getDate() + 7);
          matchesDueDate = !!invoiceDueDate && invoiceDueDate >= today && invoiceDueDate <= endOfWeek;
        } else if (dueDateFilter === 'this_month') {
          const endOfMonth = new Date(today);
          endOfMonth.setDate(today.getDate() + 30);
          matchesDueDate = !!invoiceDueDate && invoiceDueDate >= today && invoiceDueDate <= endOfMonth;
        }
      }

      return matchesSearch && matchesStatus && matchesAsset && matchesDueDate;
    });
  }, [rawInvoices, searchQuery, statusFilter, assetFilter, dueDateFilter]);

  const updateUrl = (status: string, asset: string, dueDate: string, q: string) => {
    const params = new URLSearchParams();
    if (status !== 'all') params.set('status', status);
    if (asset !== 'all') params.set('asset', asset);
    if (dueDate !== 'all') params.set('dueDate', dueDate);
    if (q.trim() !== '') params.set('q', q);

    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  };

  const handleFilterChange = (updates: { status?: string; asset?: string; dueDate?: string; q?: string }) => {
    const nextStatus = updates.status !== undefined ? updates.status : statusFilter;
    const nextAsset = updates.asset !== undefined ? updates.asset : assetFilter;
    const nextDueDate = updates.dueDate !== undefined ? updates.dueDate : dueDateFilter;
    const nextQ = updates.q !== undefined ? updates.q : searchQuery;

    setStatusFilter(nextStatus);
    setAssetFilter(nextAsset);
    setDueDateFilter(nextDueDate);
    setSearchQuery(nextQ);

    updateUrl(nextStatus, nextAsset, nextDueDate, nextQ);
  };

  const clearAllFilters = () => {
    setStatusFilter('all');
    setAssetFilter('all');
    setDueDateFilter('all');
    setSearchQuery('');
    router.replace(pathname, { scroll: false });
  };

  const saveCurrentQuery = (name: string) => {
    if (!name.trim()) return;
    const newQuery: SavedQuery = {
      id: `custom_${Date.now()}`,
      name: name.trim(),
      filters: {
        status: statusFilter,
        asset: assetFilter,
        dueDate: dueDateFilter,
        q: searchQuery,
      },
    };
    const updated = [...customQueries, newQuery];
    setCustomQueries(updated);
    localStorage.setItem('invoisio_saved_queries', JSON.stringify(updated));
  };

  const deleteCustomQuery = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customQueries.filter((q) => q.id !== id);
    setCustomQueries(updated);
    localStorage.setItem('invoisio_saved_queries', JSON.stringify(updated));
  };

  const handleDuplicateInvoice = async (invoiceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await apiClient.post(`/invoices/${invoiceId}/duplicate`);
      // Navigate to the new invoice detail page
      router.push(`/invoices/${response.data.id}`);
    } catch (error) {
      console.error('Failed to duplicate invoice:', error);
      alert('Failed to duplicate invoice. Please try again.');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20';
      case 'pending':
        return 'bg-amber-50 text-amber-700 ring-amber-600/20';
      case 'overdue':
        return 'bg-rose-50 text-rose-700 ring-rose-600/20';
      case 'cancelled':
        return 'bg-slate-50 text-slate-600 ring-slate-500/10';
      default:
        return 'bg-gray-50 text-gray-600 ring-gray-500/10';
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
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Invoices</h1>
            <p className="mt-2 text-sm text-gray-500">View, search, filter and manage your merchant transactions.</p>
          </div>
          <div className="flex items-center gap-3 self-start sm:self-center">
            <WalletAuthControls />
            <button
              type="button"
              onClick={() => refetch()}
              aria-label="Refresh invoices list"
              className="inline-flex items-center rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-colors"
            >
              Refresh
            </button>
            <Link
              href="/pos"
              className="inline-flex items-center rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
            >
              + Quick Sale
            </Link>
          </div>
        </div>

        {/* Saved Queries Row */}
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 mr-2">Quick Views:</span>
              {/* Predefined */}
              {PREDEFINED_QUERIES.map((q) => {
                const isActive =
                  statusFilter === q.filters.status &&
                  assetFilter === q.filters.asset &&
                  dueDateFilter === q.filters.dueDate &&
                  searchQuery === q.filters.q;
                return (
                  <button
                    key={q.id}
                    onClick={() => handleFilterChange(q.filters)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {q.name}
                  </button>
                );
              })}

              {/* Custom */}
              {customQueries.map((q) => {
                const isActive =
                  statusFilter === q.filters.status &&
                  assetFilter === q.filters.asset &&
                  dueDateFilter === q.filters.dueDate &&
                  searchQuery === q.filters.q;
                return (
                  <div
                    key={q.id}
                    onClick={() => handleFilterChange(q.filters)}
                    className={`group inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium cursor-pointer transition-all duration-200 ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <span>{q.name}</span>
                    <button
                      onClick={(e) => deleteCustomQuery(q.id, e)}
                      className={`ml-1.5 rounded-full p-0.5 transition-colors ${
                        isActive
                          ? 'hover:bg-blue-700 text-blue-200 hover:text-white'
                          : 'hover:bg-gray-200 text-gray-400 hover:text-gray-600'
                      }`}
                      title="Delete saved query"
                    >
                      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Inline Save Form */}
            <div className="flex items-center border-t border-gray-100 pt-3 sm:border-0 sm:pt-0">
              {isSaving ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveCurrentQuery(saveName);
                    setSaveName('');
                    setIsSaving(false);
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    placeholder="Saved view name..."
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    className="block rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-gray-400"
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700 transition-colors shadow-sm"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsSaving(false)}
                    className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsSaving(true)}
                  className="inline-flex items-center text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                >
                  <svg className="mr-1 h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                  </svg>
                  Save Current Filters
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Filter Inputs Grid */}
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
            {/* Search Input */}
            <div className="relative sm:col-span-5">
              <label htmlFor="invoice-search" className="sr-only">
                Search invoices
              </label>
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                id="invoice-search"
                type="text"
                placeholder="Search number, client name, or email..."
                value={searchQuery}
                onChange={(e) => handleFilterChange({ q: e.target.value })}
                className="block w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-gray-400 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => handleFilterChange({ q: '' })}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
                  title="Clear search"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
              )}
            </div>

            {/* Status Filter */}
            <div className="sm:col-span-3">
              <label htmlFor="status-filter" className="sr-only">
                Filter by status
              </label>
              <select
                id="status-filter"
                value={statusFilter}
                onChange={(e) => handleFilterChange({ status: e.target.value })}
                className="block w-full rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-10 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            {/* Asset Filter */}
            <div className="sm:col-span-2">
              <label htmlFor="asset-filter" className="sr-only">
                Filter by asset
              </label>
              <select
                id="asset-filter"
                value={assetFilter}
                onChange={(e) => handleFilterChange({ asset: e.target.value })}
                className="block w-full rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-10 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
              >
                <option value="all">All Assets</option>
                {dynamicAssets.map((asset) => (
                  <option key={asset} value={asset}>
                    {asset}
                  </option>
                ))}
              </select>
            </div>

            {/* Due Date Filter */}
            <div className="sm:col-span-2">
              <label htmlFor="due-date-filter" className="sr-only">
                Filter by due date
              </label>
              <select
                id="due-date-filter"
                value={dueDateFilter}
                onChange={(e) => handleFilterChange({ dueDate: e.target.value })}
                className="block w-full rounded-lg border border-gray-300 bg-white py-2 pl-3 pr-10 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors"
              >
                <option value="all">Any Due Date</option>
                <option value="overdue">Overdue</option>
                <option value="today">Due Today</option>
                <option value="this_week">Due This Week</option>
                <option value="this_month">Due This Month</option>
                <option value="has_due_date">Has Due Date</option>
                <option value="no_due_date">No Due Date</option>
              </select>
            </div>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 rounded-xl bg-rose-50 border border-rose-200 p-4" role="alert" aria-live="assertive">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-rose-600" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-rose-950">
                  Error loading invoices: {error instanceof Error ? error.message : 'Unknown error'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Table & States */}
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-white border border-gray-100 shadow-sm" />
            ))}
          </div>
        ) : totalSystemInvoices === 0 && rawInvoices.length === 0 ? (
          /* Premium Empty State */
          <div className="rounded-2xl border-2 border-dashed border-gray-300 bg-white p-12 text-center shadow-sm max-w-lg mx-auto mt-8 transition-all duration-300 hover:border-blue-400">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 mb-6 shadow-inner">
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-900">Create your first invoice</h3>
            <p className="mt-2 text-sm text-gray-500 leading-relaxed max-w-sm mx-auto">
              Invoisio helps you request payments from clients, settle transactions using Soroban smart contracts, and track status in real-time.
            </p>
            <div className="mt-8 flex justify-center gap-4">
              <Link
                href="/pos"
                className="inline-flex items-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
              >
                Go to Point of Sale
              </Link>
            </div>
          </div>
        ) : filteredInvoices.length === 0 ? (
          /* Premium No-Result State */
          <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-sm max-w-lg mx-auto mt-8 transition-all duration-300">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 mb-6 shadow-inner">
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-900">No matching invoices</h3>
            <p className="mt-2 text-sm text-gray-500 leading-relaxed max-w-xs mx-auto">
              {"We couldn't find any invoices matching your current filters and search criteria."}
            </p>
            {/* Show summarized filters info */}
            <div className="mt-4 bg-gray-50 rounded-lg p-3 text-xs text-gray-600 max-w-xs mx-auto text-left space-y-1">
              {statusFilter !== 'all' && (
                <div>• Status is <span className="font-semibold text-gray-800">{statusFilter}</span></div>
              )}
              {assetFilter !== 'all' && (
                <div>• Asset is <span className="font-semibold text-gray-800">{assetFilter}</span></div>
              )}
              {dueDateFilter !== 'all' && (
                <div>• Due Date is <span className="font-semibold text-gray-800">{dueDateFilter.replace('_', ' ')}</span></div>
              )}
              {searchQuery.trim() !== '' && (
                <div>• Search is <span className="font-semibold text-gray-800">&quot;{searchQuery}&quot;</span></div>
              )}
            </div>
            <div className="mt-6">
              <button
                type="button"
                onClick={clearAllFilters}
                className="inline-flex items-center rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 transition-colors shadow-sm"
              >
                Clear all filters
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Invoices Table */}
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Invoice #
                      </th>
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Client
                      </th>
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500 text-right">
                        Amount
                      </th>
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Created
                      </th>
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Due Date
                      </th>
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Status
                      </th>
                      <th className="px-6 py-4 text-xs font-semibold uppercase tracking-wider text-gray-500 text-center">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredInvoices.map((invoice) => (
                      <tr key={invoice.id} className="hover:bg-gray-50/75 transition-colors">
                        <td className="whitespace-nowrap px-6 py-4 text-sm font-mono font-medium text-gray-900">
                          {invoice.invoiceNumber || `#${invoice.id.slice(0, 8)}`}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="text-sm font-medium text-gray-900">{invoice.clientName}</div>
                          {invoice.clientEmail && (
                            <div className="text-xs text-gray-400">{invoice.clientEmail}</div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right">
                          <div className="text-sm font-bold text-gray-900">
                            {invoice.amount.toLocaleString('en-US', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 7,
                            })}
                          </div>
                          <div className="text-xs font-semibold text-gray-400">{invoice.asset}</div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                          {formatDate(invoice.createdAt)}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-600">
                          {invoice.dueDate ? formatDate(invoice.dueDate) : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-sm">
                          <span
                            className={`inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${getStatusColor(
                              invoice.status,
                            )}`}
                          >
                            {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Link
                              href={`/invoices/${invoice.id}`}
                              className="inline-flex rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm hover:shadow transition-all"
                            >
                              View
                            </Link>
                            <button
                              onClick={(e) => handleDuplicateInvoice(invoice.id, e)}
                              className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 shadow-sm transition-all"
                              title="Duplicate invoice"
                            >
                              <Copy className="h-3.5 w-3.5" />
                              Duplicate
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination Placeholder */}
            <div className="mt-6 flex items-center justify-between rounded-2xl border border-gray-200 bg-white px-6 py-4 shadow-sm">
              <div className="flex flex-1 justify-between sm:hidden">
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  aria-label="Go to previous page"
                  className="relative inline-flex items-center rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-300 cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled
                  aria-disabled="true"
                  aria-label="Go to next page"
                  className="relative ml-3 inline-flex items-center rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-300 cursor-not-allowed"
                >
                  Next
                </button>
              </div>
              <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-gray-700">
                    Showing <span className="font-semibold text-gray-900">{filteredInvoices.length}</span> of{' '}
                    <span className="font-semibold text-gray-900">{totalSystemInvoices}</span> total invoices
                  </p>
                </div>
                <div>
                  <nav className="isolate inline-flex -space-x-px rounded-lg shadow-sm" aria-label="Pagination">
                    <button
                      type="button"
                      disabled
                      aria-disabled="true"
                      className="relative inline-flex items-center rounded-l-lg px-2.5 py-2 text-gray-300 ring-1 ring-inset ring-gray-300 cursor-not-allowed hover:bg-gray-50 focus:z-20 focus:outline-offset-0"
                    >
                      <span className="sr-only">Previous</span>
                      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      disabled
                      aria-disabled="true"
                      className="relative inline-flex items-center rounded-r-lg px-2.5 py-2 text-gray-300 ring-1 ring-inset ring-gray-300 cursor-not-allowed hover:bg-gray-50 focus:z-20 focus:outline-offset-0"
                    >
                      <span className="sr-only">Next</span>
                      <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                        <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </nav>
                </div>
              </div>
            </div>

            {hasNextPage && (
              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  aria-label={isFetchingNextPage ? 'Loading more invoices' : 'Load more invoices'}
                  className="inline-flex rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 shadow-sm disabled:bg-gray-400 transition-colors"
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

export default function InvoicesPage() {
  return (
    <RequireAuth>
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-gray-50">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
          </div>
        }
      >
        <InvoicesContent />
      </Suspense>
    </RequireAuth>
  );
}