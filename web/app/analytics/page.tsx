'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle,
  AlertCircle,
  Clock,
  FileText,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react';
import {
  AnalyticsService,
  type MerchantAnalyticsOverview,
} from '@/lib/analytics-service';
import { RequireAuth } from '@/components/require-auth';
import { WalletAuthControls } from '@/components/wallet-auth-controls';

function formatAmount(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

interface MetricCardProps {
  label: string;
  description: string;
  count: number;
  totalAmount: number;
  icon: React.ReactNode;
  accent: string;
}

function MetricCard({
  label,
  description,
  count,
  totalAmount,
  icon,
  accent,
}: MetricCardProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">{label}</p>
          <p className="mt-0.5 text-xs text-gray-500">{description}</p>
        </div>
        <div
          className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${accent}`}
        >
          {icon}
        </div>
      </div>
      <p className="mt-5 text-3xl font-bold tracking-tight text-gray-900">
        {formatAmount(totalAmount)}
      </p>
      <p className="mt-1 text-sm text-gray-500">
        {count} {count === 1 ? 'invoice' : 'invoices'}
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className="h-44 animate-pulse rounded-2xl border border-gray-100 bg-white shadow-sm"
        />
      ))}
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
  isRefetching,
}: {
  message: string;
  onRetry: () => void;
  isRefetching: boolean;
}) {
  return (
    <div
      className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center"
      role="alert"
      aria-live="assertive"
    >
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
        <AlertCircle className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-lg font-bold text-rose-950">
        Couldn’t load your analytics
      </h3>
      <p className="mt-2 text-sm text-rose-800">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        disabled={isRefetching}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-rose-300"
      >
        <RefreshCw
          className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`}
        />
        {isRefetching ? 'Retrying…' : 'Try again'}
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border-2 border-dashed border-gray-300 bg-white p-12 text-center shadow-sm">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
        <FileText className="h-8 w-8" />
      </div>
      <h3 className="mt-6 text-lg font-bold text-gray-900">
        No analytics yet
      </h3>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-gray-500">
        Once you create and send your first invoice, we’ll show your collected,
        outstanding, and overdue totals here.
      </p>
      <div className="mt-8 flex justify-center gap-4">
        <Link
          href="/invoices/new"
          className="inline-flex items-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
        >
          Create your first invoice
        </Link>
        <Link
          href="/pos"
          className="inline-flex items-center rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-colors"
        >
          Quick Sale
        </Link>
      </div>
    </div>
  );
}

function AnalyticsContent() {
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['merchant-analytics-overview'],
    queryFn: AnalyticsService.getOverview,
  });

  const isEmpty =
    !!data &&
    [data.paid, data.overdue, data.draft, data.outstanding].every(
      (metric) => metric.count === 0,
    );

  const cards: Array<{
    label: string;
    description: string;
    metric: MerchantAnalyticsOverview['paid'];
    icon: React.ReactNode;
    accent: string;
  }> = data
    ? [
        {
          label: 'Collected',
          description: 'Fully paid invoices',
          metric: data.paid,
          icon: <CheckCircle className="h-5 w-5" />,
          accent: 'bg-emerald-50 text-emerald-600',
        },
        {
          label: 'Outstanding',
          description: 'Awaiting payment',
          metric: data.outstanding,
          icon: <Clock className="h-5 w-5" />,
          accent: 'bg-blue-50 text-blue-600',
        },
        {
          label: 'Overdue',
          description: 'Past due invoices',
          metric: data.overdue,
          icon: <AlertCircle className="h-5 w-5" />,
          accent: 'bg-rose-50 text-rose-600',
        },
        {
          label: 'Drafts',
          description: 'Not yet issued',
          metric: data.draft,
          icon: <FileText className="h-5 w-5" />,
          accent: 'bg-slate-100 text-slate-600',
        },
      ]
    : [];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/dashboard"
            className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Analytics
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            An overview of your collected, outstanding, and overdue invoice
            totals.
          </p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-center">
          <WalletAuthControls />
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isRefetching}
            aria-label="Refresh analytics"
            className="inline-flex items-center gap-2 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-60 transition-colors"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`}
            />
            Refresh
          </button>
        </div>
      </div>

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState
          message={error instanceof Error ? error.message : 'Unknown error'}
          onRetry={() => refetch()}
          isRefetching={isRefetching}
        />
      ) : isEmpty ? (
        <EmptyState />
      ) : (
        <>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((card) => (
              <MetricCard
                key={card.label}
                label={card.label}
                description={card.description}
                count={card.metric.count}
                totalAmount={card.metric.totalAmount}
                icon={card.icon}
                accent={card.accent}
              />
            ))}
          </div>
          <p className="mt-6 text-xs text-gray-400">
            Totals are summed across all assets and reflect your current
            invoice data.
          </p>
        </>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <RequireAuth>
      <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
        <AnalyticsContent />
      </div>
    </RequireAuth>
  );
}
