'use client';

import { AlertCircle, CheckCircle2, Copy, Link2, RefreshCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { PublicInvoiceService } from '@/lib/public-invoice-service';
import { usePollInvoiceStatus } from '@/hooks/use-poll-invoice-status';
import { isReceiptEligibleForDisplay } from '@/lib/receipt-status';
import type { PublicInvoice } from '@/lib/public-invoice-service';

function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return 'Unavailable';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return 'Unavailable';
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatAmount(value: number | string | undefined, assetCode: string) {
  const amount = Number(value ?? 0);
  if (Number.isNaN(amount)) {
    return `0.00 ${assetCode}`;
  }

  return `${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 7,
  })} ${assetCode}`;
}

export default function ReceiptPage({
  invoiceId,
  initialInvoice,
}: {
  invoiceId: string;
  initialInvoice: PublicInvoice | null;
}) {
  const router = useRouter();
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');

  const fetchInvoice = useCallback(async (id: string) => {
    return await PublicInvoiceService.getInvoice(id);
  }, []);

  const { invoice, isLoading, error: pollError, lastUpdated, refreshStatus } =
    usePollInvoiceStatus(invoiceId, fetchInvoice, { stopOnPaid: true }, initialInvoice);

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/receipt/${invoiceId}`;
  }, [invoiceId]);

  const handleCopyLink = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 2000);
    } catch (error) {
      console.error('Failed to copy receipt URL', error);
    }
  }, [shareUrl]);

  if (isLoading && !invoice) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl animate-pulse">
          <div className="mb-6 h-8 w-52 rounded bg-slate-200" />
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-6 h-5 w-40 rounded bg-slate-200" />
            <div className="mb-5 h-16 w-full rounded bg-slate-200" />
            <div className="space-y-4">
              <div className="h-4 w-full rounded bg-slate-200" />
              <div className="h-4 w-3/4 rounded bg-slate-200" />
              <div className="h-4 w-2/3 rounded bg-slate-200" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto h-16 w-16 text-red-500" />
          <h1 className="mt-4 text-3xl font-bold text-slate-900">Receipt not found</h1>
          <p className="mt-3 text-slate-600">
            {pollError || 'The payment receipt you are looking for is unavailable or no longer exists.'}
          </p>
          <button
            type="button"
            onClick={() => router.push('/invoices')}
            className="mt-6 inline-flex items-center rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            Return to invoices
          </button>
        </div>
      </div>
    );
  }

  if (!isReceiptEligibleForDisplay(invoice.status)) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-white p-8 text-center shadow-sm">
          <AlertCircle className="mx-auto h-16 w-16 text-amber-500" />
          <h1 className="mt-4 text-3xl font-bold text-slate-900">Receipt unavailable</h1>
          <p className="mt-3 text-slate-600">
            This receipt is only available for completed payments. The invoice is currently{' '}
            <span className="font-semibold capitalize">{invoice.status}</span>.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => router.push(`/pay/${invoice.id}`)}
              className="rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700"
            >
              View payment page
            </button>
            <button
              type="button"
              onClick={refreshStatus}
              className="rounded-md border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Refresh status
            </button>
          </div>
        </div>
      </div>
    );
  }

  const receiptTitle = invoice.invoiceNumber || `Invoice ${invoice.id.slice(0, 8)}`;
  const paymentDate = invoice.updatedAt || invoice.createdAt || lastUpdated?.toISOString();

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.push(`/pay/${invoice.id}`)}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <Link2 className="h-4 w-4" />
            Back to payment page
          </button>
          <button
            type="button"
            onClick={refreshStatus}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-gradient-to-r from-emerald-600 to-emerald-500 px-6 py-8 text-white sm:px-8">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-7 w-7" />
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-emerald-100">
                  Payment completed successfully
                </p>
                <h1 className="mt-2 text-3xl font-bold">Receipt</h1>
              </div>
            </div>
          </div>

          <div className="px-6 py-8 sm:px-8">
            <div className="mb-8 rounded-xl border border-emerald-100 bg-emerald-50 p-5">
              <p className="text-sm font-medium uppercase tracking-[0.22em] text-emerald-700">
                Amount paid
              </p>
              <p className="mt-3 text-4xl font-bold text-slate-900 sm:text-5xl">
                {formatAmount(invoice.amount, invoice.asset_code || 'XLM')}
              </p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                    Invoice
                  </p>
                  <p className="mt-2 text-xl font-semibold text-slate-900">{receiptTitle}</p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                    Status
                  </p>
                  <p className="mt-2 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800">
                    Paid
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                    Merchant
                  </p>
                  <p className="mt-2 text-base text-slate-900">{invoice.merchantName}</p>
                </div>

                {invoice.description && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                      Description
                    </p>
                    <p className="mt-2 text-base text-slate-700">{invoice.description}</p>
                  </div>
                )}
              </div>

              <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-5">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                    Payment date
                  </p>
                  <p className="mt-2 text-base text-slate-900">
                    {formatDateTime(paymentDate)}
                  </p>
                </div>

                {invoice.tx_hash && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                      Payment reference
                    </p>
                    <p className="mt-2 break-all font-mono text-sm text-slate-900">{invoice.tx_hash}</p>
                  </div>
                )}

                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                    Asset
                  </p>
                  <p className="mt-2 text-base text-slate-900">
                    {invoice.asset_code}
                    {invoice.asset_issuer ? ` (${invoice.asset_issuer})` : ''}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                    Memo
                  </p>
                  <p className="mt-2 break-all font-mono text-sm text-slate-900">{invoice.memo}</p>
                </div>
              </div>
            </div>

            <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-slate-500">
                Receipt details
              </p>
              <dl className="mt-4 space-y-3 text-sm text-slate-700">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
                  <dt>Invoice number</dt>
                  <dd className="font-medium text-slate-900">{receiptTitle}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
                  <dt>Amount</dt>
                  <dd className="font-medium text-slate-900">{formatAmount(invoice.amount, invoice.asset_code || 'XLM')}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
                  <dt>Payment status</dt>
                  <dd className="font-medium text-emerald-700">Paid</dd>
                </div>
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
                  <dt>Issued</dt>
                  <dd className="font-medium text-slate-900">{formatDateTime(invoice.createdAt)}</dd>
                </div>
                {invoice.dueDate && (
                  <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3">
                    <dt>Due date</dt>
                    <dd className="font-medium text-slate-900">{formatDateTime(invoice.dueDate)}</dd>
                  </div>
                )}
                {invoice.tx_hash && (
                  <div className="flex items-start justify-between gap-3">
                    <dt>Reference</dt>
                    <dd className="max-w-[60%] break-all font-mono text-xs text-slate-900">
                      {invoice.tx_hash}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleCopyLink}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-700"
              >
                <Copy className="h-4 w-4" />
                {copyState === 'copied' ? 'Copied receipt link' : 'Share receipt'}
              </button>

              <button
                type="button"
                onClick={() => router.push(`/pay/${invoice.id}`)}
                className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                View payment page
              </button>
            </div>

            <p className="mt-5 text-xs text-slate-500">
              Last updated: {formatDateTime(lastUpdated ?? invoice.updatedAt ?? invoice.createdAt)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
