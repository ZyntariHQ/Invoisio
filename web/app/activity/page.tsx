'use client';

import { useState, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useInfiniteQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { WalletAuthControls } from '@/components/wallet-auth-controls';
import { RequireAuth } from '@/components/require-auth';

interface ActivityEvent {
  id: string;
  invoiceId: string | null;
  type: string;
  description: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface ActivityFeedPage {
  items: ActivityEvent[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

const EVENT_TYPE_ICONS: Record<string, string> = {
  invoice_created: '📄',
  invoice_updated: '✏️',
  invoice_paid: '✅',
  invoice_partially_paid: '💳',
  invoice_overdue: '⚠️',
  invoice_cancelled: '🗑️',
  payment_received: '💰',
  reminder_sent: '📧',
  webhook_delivered: '🔗',
  webhook_failed: '❌',
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  invoice_created: 'Invoice Created',
  invoice_updated: 'Invoice Updated',
  invoice_paid: 'Invoice Paid',
  invoice_partially_paid: 'Partially Paid',
  invoice_overdue: 'Invoice Overdue',
  invoice_cancelled: 'Invoice Cancelled',
  payment_received: 'Payment Received',
  reminder_sent: 'Reminder Sent',
  webhook_delivered: 'Webhook Delivered',
  webhook_failed: 'Webhook Failed',
};

const FILTER_OPTIONS = [
  { value: 'all', label: 'All Activity' },
  { value: 'invoice_created', label: 'Created' },
  { value: 'invoice_paid', label: 'Paid' },
  { value: 'invoice_partially_paid', label: 'Partially Paid' },
  { value: 'invoice_overdue', label: 'Overdue' },
  { value: 'invoice_cancelled', label: 'Cancelled' },
  { value: 'payment_received', label: 'Payments' },
  { value: 'reminder_sent', label: 'Reminders' },
  { value: 'webhook_delivered', label: 'Webhooks' },
  { value: 'webhook_failed', label: 'Webhook Failures' },
];

async function fetchActivityPage(page: number, pageSize: number, type?: string): Promise<ActivityFeedPage> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(pageSize),
  });
  if (type && type !== 'all') {
    params.set('type', type);
  }

  const response = await apiClient.get(`/activity-feed?${params.toString()}`);
  const data: unknown = response.data;

  if (Array.isArray(data)) {
    const items: ActivityEvent[] = data as ActivityEvent[];
    return {
      items,
      total: items.length,
      page,
      pageSize,
      hasMore: items.length === pageSize,
    };
  }

  const obj = (data ?? {}) as Record<string, unknown>;
  const items: ActivityEvent[] = Array.isArray(obj.items) ? (obj.items as ActivityEvent[]) : [];
  const total: number = typeof obj.total === 'number' ? obj.total : items.length;
  const hasMore: boolean =
    typeof obj.hasMore === 'boolean' ? obj.hasMore : items.length === pageSize;

  return { items, total, page, pageSize, hasMore };
}

function getTypeIcon(type: string): string {
  return EVENT_TYPE_ICONS[type] || '📌';
}

function getTypeLabel(type: string): string {
  return EVENT_TYPE_LABELS[type] || type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function getEventColor(type: string): string {
  if (type.includes('paid') || type === 'payment_received') return 'text-emerald-600 bg-emerald-50';
  if (type.includes('overdue') || type === 'webhook_failed') return 'text-rose-600 bg-rose-50';
  if (type.includes('cancelled')) return 'text-slate-500 bg-slate-50';
  if (type === 'reminder_sent') return 'text-amber-600 bg-amber-50';
  if (type === 'webhook_delivered') return 'text-blue-600 bg-blue-50';
  return 'text-gray-600 bg-gray-50';
}

function formatTimeAgo(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ActivityContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const urlType = searchParams.get('type') || 'all';
  const [typeFilter, setTypeFilter] = useState(urlType);

  const pageSize = 30;

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } = useInfiniteQuery({
    queryKey: ['activity-feed', typeFilter],
    queryFn: async ({ pageParam }: { pageParam: number }) =>
      fetchActivityPage(pageParam, pageSize, typeFilter === 'all' ? undefined : typeFilter),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
  });

  const events = useMemo(() => {
    return data?.pages.flatMap((page) => page.items) ?? [];
  }, [data]);

  const totalEvents = data?.pages[0]?.total ?? events.length;

  const updateFilter = (type: string) => {
    setTypeFilter(type);
    const params = new URLSearchParams();
    if (type !== 'all') params.set('type', type);
    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  };

  const clearFilter = () => updateFilter('all');

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Activity Feed</h1>
            <p className="mt-2 text-sm text-gray-500">
              Track invoice changes, payments, reminders, and webhook events in real-time.
            </p>
          </div>
          <div className="flex items-center gap-3 self-start sm:self-center">
            <WalletAuthControls />
            <button
              type="button"
              onClick={() => refetch()}
              aria-label="Refresh activity feed"
              className="inline-flex items-center rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-colors"
            >
              <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 mr-1">
              Filter:
            </span>
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => updateFilter(opt.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                  typeFilter === opt.value
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
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
                  Error loading activity: {error instanceof Error ? error.message : 'Unknown error'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-white border border-gray-100 shadow-sm" />
            ))}
          </div>
        ) : events.length === 0 ? (
          /* Empty State */
          <div className="rounded-2xl border-2 border-dashed border-gray-300 bg-white p-12 text-center shadow-sm max-w-lg mx-auto mt-8">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 mb-6 shadow-inner">
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-900">No activity yet</h3>
            <p className="mt-2 text-sm text-gray-500 leading-relaxed max-w-sm mx-auto">
              {typeFilter !== 'all'
                ? 'No events match the selected filter. Try a different filter or create an invoice to get started.'
                : 'Your activity feed will show invoice creations, payments, reminders, and webhook events as they happen.'}
            </p>
            {typeFilter !== 'all' && (
              <div className="mt-6">
                <button
                  type="button"
                  onClick={clearFilter}
                  className="inline-flex items-center rounded-xl bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 transition-colors shadow-sm"
                >
                  Clear filter
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Event Count */}
            <div className="mb-4 text-sm text-gray-500">
              Showing <span className="font-semibold text-gray-900">{events.length}</span> of{' '}
              <span className="font-semibold text-gray-900">{totalEvents}</span> events
            </div>

            {/* Activity Feed List */}
            <div className="space-y-3">
              {events.map((event) => (
                <div
                  key={event.id}
                  className="group rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-all duration-200 hover:shadow-md hover:border-gray-300"
                >
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div
                      className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-lg ${getEventColor(
                        event.type,
                      )}`}
                    >
                      {getTypeIcon(event.type)}
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
                            event.type === 'invoice_paid' || event.type === 'payment_received'
                              ? 'bg-emerald-50 text-emerald-700'
                              : event.type.includes('overdue') || event.type === 'webhook_failed'
                                ? 'bg-rose-50 text-rose-700'
                                : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {getTypeLabel(event.type)}
                        </span>
                        <span className="text-xs text-gray-400">
                          {formatTimeAgo(event.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-gray-700 leading-relaxed">
                        {event.description}
                      </p>

                      {/* Link to invoice */}
                      {event.invoiceId && (
                        <div className="mt-2">
                          <Link
                            href={`/invoices/${event.invoiceId}`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 transition-colors"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                            View Invoice
                          </Link>
                        </div>
                      )}
                    </div>

                    {/* Timestamp (desktop tooltip) */}
                    <div className="hidden sm:block flex-shrink-0 text-right">
                      <time
                        dateTime={event.createdAt}
                        className="text-xs text-gray-400"
                        title={new Date(event.createdAt).toLocaleString()}
                      >
                        {new Date(event.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Load More */}
            {hasNextPage && (
              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                  aria-label={isFetchingNextPage ? 'Loading more events' : 'Load more events'}
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

export default function ActivityFeedPage() {
  return (
    <RequireAuth>
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-gray-50">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
          </div>
        }
      >
        <ActivityContent />
      </Suspense>
    </RequireAuth>
  );
}