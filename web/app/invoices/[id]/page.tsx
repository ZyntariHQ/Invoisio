
'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useCallback, useMemo } from 'react';
import { Copy, Download, Printer } from 'lucide-react';
import { generatePaymentUri, openPaymentWallet, getWalletInfo } from '@/lib/sep0007';
import { usePollInvoiceStatus } from '@/hooks/use-poll-invoice-status';
import { apiClient, extractApiErrorMessage } from '@/lib/api-client';
import { RequireAuth } from '@/components/require-auth';

interface Invoice {
  id: string;
  invoiceNumber?: string;
  clientName: string;
  clientEmail?: string;
  description?: string;
  amount: number;
  asset: string;
  asset_issuer?: string;
  memo: string;
  destination_address: string;
  status: 'pending' | 'paid' | 'overdue' | 'cancelled';
  tx_hash?: string;
  createdAt: string;
  dueDate?: string;
}

interface WalletInfo {
  hasWallet: boolean;
  isMobile: boolean;
  isFreighter: boolean;
  message: string;
}

interface TimelineStep {
  label: string;
  description: string;
  datetime: string;
  status: 'completed' | 'failed' | 'pending';
  txHash?: string;
}

function InvoiceDetailContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const invoiceId = params?.id as string;

  const [walletInfo] = useState<WalletInfo | null>(getWalletInfo());
  const [paymentInProgress, setPaymentInProgress] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [downloadInProgress, setDownloadInProgress] = useState<'invoice' | 'receipt' | null>(null);

  const handleCopyToClipboard = useCallback(async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Copy failed', err);
    }
  }, []);

  const formatDateTime = useCallback((value: string | Date | null) => {
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
  }, []);

  // Fetch invoice function for polling
  const fetchInvoice = useCallback(async (id: string) => {
    const response = await apiClient.get<Invoice>(`/invoices/${id}`);
    return response.data;
  }, []);

  // Use polling hook for status updates
  const { invoice, isLoading, error: pollError, lastUpdated, refreshStatus } = usePollInvoiceStatus(
    invoiceId,
    fetchInvoice,
  );

  const statusTimeline = useMemo<TimelineStep[]>(() => {
    if (!invoice) return [] as TimelineStep[];

    const timeline: TimelineStep[] = [
      {
        label: 'Invoice Created',
        description: 'Invoice was issued and is waiting for payment.',
        datetime: invoice.createdAt,
        status: 'completed',
      },
    ];

    if (invoice.dueDate) {
      timeline.push({
        label: 'Due Date',
        description: 'Payment is expected by this date.',
        datetime: invoice.dueDate,
        status: invoice.status === 'overdue' || invoice.status === 'cancelled' ? 'failed' : 'pending',
      });
    }

    if (invoice.status === 'paid') {
      timeline.push({
        label: 'Payment Received',
        description: 'The payment was confirmed on the network.',
        datetime: lastUpdated ? lastUpdated.toISOString() : invoice.createdAt,
        status: 'completed',
        txHash: invoice.tx_hash,
      });
    } else if (invoice.status === 'overdue' || invoice.status === 'cancelled') {
      timeline.push({
        label: 'Invoice Expired',
        description: 'This invoice is no longer payable.',
        datetime: invoice.dueDate ?? (lastUpdated ? lastUpdated.toISOString() : invoice.createdAt),
        status: 'failed',
      });
    } else {
      timeline.push({
        label: 'Awaiting Payment',
        description: 'The invoice is open and ready to be paid.',
        datetime: lastUpdated ? lastUpdated.toISOString() : invoice.createdAt,
        status: 'pending',
      });
    }

    return timeline;
  }, [invoice, lastUpdated]);

  const handlePayClick = useCallback(async () => {
    if (!invoice || paymentInProgress) return;

    try {
      setPaymentInProgress(true);
      setPaymentError(null);

      // Generate SEP-0007 payment URI
      const paymentUri = generatePaymentUri({
        destination: invoice.destination_address,
        amount: invoice.amount.toString(),
        assetCode: invoice.asset,
        assetIssuer: invoice.asset_issuer,
        memo: invoice.memo,
        memoType: 'id',
      });

      // Open wallet
      await openPaymentWallet(paymentUri);

      // UI feedback that payment is in progress
      setPaymentInProgress(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setPaymentError(message);
      setPaymentInProgress(false);
    }
  }, [invoice, paymentInProgress]);

  const handleDuplicateInvoice = async () => {
    try {
      const response = await apiClient.post(`/invoices/${invoiceId}/duplicate`);
      // Navigate to the new invoice detail page
      router.push(`/invoices/${response.data.id}`);
    } catch (error) {
      console.error('Failed to duplicate invoice:', error);
      alert('Failed to duplicate invoice. Please try again.');
    }
  };

  const parseDownloadFilename = useCallback(
    (contentDisposition: string | undefined, fallback: string) => {
      if (!contentDisposition) return fallback;

      const match = contentDisposition.match(/filename="?([^";]+)"?/i);
      return match?.[1] ?? fallback;
    },
    [],
  );

  const downloadDocument = useCallback(
    async (variant: 'invoice' | 'receipt') => {
      if (!invoice) return;

      const endpoint =
        variant === 'receipt'
          ? `/invoices/${invoice.id}/receipt`
          : `/invoices/${invoice.id}/pdf`;

      const fallbackName =
        variant === 'receipt'
          ? `receipt-${invoice.invoiceNumber ?? invoice.id}.pdf`
          : `invoice-${invoice.invoiceNumber ?? invoice.id}.pdf`;

      try {
        setDownloadInProgress(variant);
        const response = await apiClient.get(endpoint, {
          responseType: 'blob',
        });

        const filename = parseDownloadFilename(
          response.headers['content-disposition'],
          fallbackName,
        );

        const blob = new Blob([response.data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      } catch (error) {
        alert(extractApiErrorMessage(error));
      } finally {
        setDownloadInProgress(null);
      }
    },
    [invoice, parseDownloadFilename],
  );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'text-green-600 bg-green-50';
      case 'pending':
        return 'text-yellow-600 bg-yellow-50';
      case 'overdue':
        return 'text-red-600 bg-red-50';
      case 'cancelled':
        return 'text-gray-600 bg-gray-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return 'Success';
      case 'pending':
        return 'Pending';
      case 'overdue':
        return 'Overdue';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status;
    }
  };

  if (isLoading && !invoice) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <div className="animate-pulse space-y-4">
            <div className="h-8 w-64 rounded bg-gray-200" />
            <div className="h-4 w-40 rounded bg-gray-200" />
            <div className="space-y-3">
              <div className="h-12 rounded bg-gray-200" />
              <div className="h-12 rounded bg-gray-200" />
              <div className="h-12 rounded bg-gray-200" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-2xl font-bold text-gray-900">Invoice Not Found</h1>
          <p className="mt-4 text-gray-600">
            {pollError || 'The invoice you are looking for does not exist.'}
          </p>
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Go back to previous page"
            className="mt-6 inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const isPaid = invoice.status === 'paid';
  const isPending = invoice.status === 'pending';

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Go back to invoices list"
          className="mb-8 text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          ← Back to Invoices
        </button>

        {/* Main Card */}
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <div className="px-6 py-8 sm:px-8">
            {/* Invoice Header */}
            <div className="mb-8 flex flex-col items-start gap-3 border-b border-gray-200 pb-6 sm:flex-row sm:justify-between">
              <div>
                <p className="text-sm text-gray-500">Invoice</p>
                <h1 className="text-3xl font-bold text-gray-900">
                  {invoice.invoiceNumber || `#${invoice.id.slice(0, 8)}`}
                </h1>
                <p className="mt-2 text-sm text-gray-600">{invoice.clientName}</p>
              </div>
              <div className={`rounded-full px-4 py-2 ${getStatusColor(invoice.status)}`}>
                <span className="text-sm font-semibold">{getStatusBadge(invoice.status)}</span>
              </div>
            </div>

            {/* Payment Status Message */}
            {paymentInProgress && (
              <div 
                className="mb-6 rounded-md bg-blue-50 p-4"
                role="status"
                aria-live="polite"
              >
                <p className="text-sm font-medium text-blue-900">
                  ⏳ Waiting for payment... Check your wallet for confirmation.
                </p>
              </div>
            )}

            {isPaid && (
              <div 
                className="mb-6 rounded-md bg-green-50 p-4"
                role="status"
                aria-live="polite"
              >
                <p className="text-sm font-medium text-green-900">
                  ✓ Payment received successfully!
                </p>
                {invoice.tx_hash && (
                  <p className="mt-2 break-all text-xs text-green-800">
                    Transaction: <code className="font-mono">{invoice.tx_hash}</code>
                  </p>
                )}
              </div>
            )}

            {paymentError && (
              <div 
                className="mb-6 rounded-md bg-red-50 p-4"
                role="alert"
                aria-live="assertive"
              >
                <p className="text-sm font-medium text-red-900">
                  Error: {paymentError}
                </p>
              </div>
            )}

            {pollError && !invoice && (
              <div 
                className="mb-6 rounded-md bg-red-50 p-4"
                role="alert"
                aria-live="assertive"
              >
                <p className="text-sm font-medium text-red-900">
                  Error loading invoice: {pollError}
                </p>
              </div>
            )}

            {!walletInfo?.hasWallet && isPending && (
              <div 
                className="mb-6 rounded-md bg-amber-50 p-4"
                role="status"
                aria-live="polite"
              >
                <p className="text-sm font-medium text-amber-900">
                  ⚠️ {walletInfo?.message || 'No wallet detected'}
                </p>
              </div>
            )}

            {/* Invoice Details Grid */}
            <div className="mb-8 grid grid-cols-2 gap-6 sm:grid-cols-3">
              <div>
                <p className="text-xs font-medium uppercase text-gray-500">Amount Due</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">
                  {invoice.amount.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 7,
                  })}{' '}
                  <span className="text-sm text-gray-600">{invoice.asset}</span>
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase text-gray-500">Status</p>
                <p className="mt-2 text-lg font-semibold text-gray-900">
                  {getStatusBadge(invoice.status)}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium uppercase text-gray-500">Created</p>
                <p className="mt-2 text-lg font-semibold text-gray-900">
                  {formatDate(invoice.createdAt)}
                </p>
              </div>

              {invoice.dueDate && (
                <div>
                  <p className="text-xs font-medium uppercase text-gray-500">Due Date</p>
                  <p className="mt-2 text-lg font-semibold text-gray-900">
                    {formatDate(invoice.dueDate)}
                  </p>
                </div>
              )}

              {invoice.clientEmail && (
                <div>
                  <p className="text-xs font-medium uppercase text-gray-500">Bill To</p>
                  <p className="mt-2 text-sm text-gray-900">{invoice.clientEmail}</p>
                </div>
              )}
            </div>

            {/* Description */}
            {invoice.description && (
              <div className="mb-8">
                <p className="text-xs font-medium uppercase text-gray-500">Description</p>
                <p className="mt-2 text-gray-700">{invoice.description}</p>
              </div>
            )}

            {/* Payment Instructions */}
            {isPending && (
              <div className="mb-8 rounded-md border border-blue-200 bg-blue-50 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase text-blue-900">Payment Instructions</p>
                  <span className="text-xs text-slate-500">Copy destination and memo to pay</span>
                </div>
                <div className="space-y-3 text-sm text-gray-700">
                  <div className="flex items-start justify-between gap-3 rounded-md border border-blue-100 bg-white p-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase text-blue-700">Destination</p>
                      <code className="font-mono break-all text-sm text-slate-700">{invoice.destination_address}</code>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyToClipboard(invoice.destination_address, 'destination')}
                      className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      {copiedField === 'destination' ? 'Copied' : 'Copy'}
                    </button>
                  </div>

                  <div className="flex items-start justify-between gap-3 rounded-md border border-blue-100 bg-white p-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase text-blue-700">Memo</p>
                      <code className="font-mono break-all text-sm text-slate-700">{invoice.memo}</code>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyToClipboard(invoice.memo, 'memo')}
                      className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    >
                      {copiedField === 'memo' ? 'Copied' : 'Copy'}
                    </button>
                  </div>

                  <div className="rounded-md border border-blue-100 bg-white p-3">
                    <p className="text-xs font-semibold uppercase text-blue-700">Asset</p>
                    <p className="mt-1 text-sm text-slate-900">
                      {invoice.asset}
                      {invoice.asset_issuer && (
                        <> (Issuer: <code className="font-mono break-all">{invoice.asset_issuer}</code>)</>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Status Timeline */}
            <div className="mb-8 rounded-lg border border-slate-200 bg-slate-50 p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-700">Status Timeline</p>
                <span className="text-xs text-slate-500">
                  {lastUpdated ? `Last refreshed ${formatDateTime(lastUpdated)}` : 'No status timestamp available'}
                </span>
              </div>
              <div className="space-y-4">
                {statusTimeline.map((step) => (
                  <div key={step.label} className="grid gap-3 sm:grid-cols-[auto_1fr]">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border text-xs font-semibold text-white" style={{ backgroundColor: step.status === 'completed' ? '#10b981' : step.status === 'failed' ? '#ef4444' : '#f59e0b' }}>
                      {step.status === 'completed' ? '✓' : step.status === 'failed' ? '✕' : '…'}
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-900">{step.label}</p>
                        <p className="text-xs text-slate-500">{formatDateTime(step.datetime)}</p>
                      </div>
                      <p className="mt-2 text-sm text-slate-600">{step.description}</p>
                      {step.txHash && (
                        <p className="mt-2 truncate text-xs font-mono text-slate-800">Transaction: {step.txHash}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Status Info */}
            {lastUpdated && (
              <div className="mb-6 text-xs text-gray-500">
                Last updated: {new Date(lastUpdated).toLocaleTimeString()}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {isPending && walletInfo?.hasWallet && (
                <button
                  type="button"
                  onClick={handlePayClick}
                  disabled={paymentInProgress || isLoading}
                  aria-label={paymentInProgress ? 'Waiting for payment confirmation' : 'Pay invoice via Stellar wallet'}
                  className="flex-1 rounded-md bg-green-600 px-4 py-3 text-center font-medium text-white hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {paymentInProgress ? '⏳ Waiting for Payment...' : '💳 Pay Invoice'}
                </button>
              )}

              <button
                type="button"
                onClick={refreshStatus}
                disabled={isLoading}
                aria-label="Refresh invoice payment status"
                className="rounded-md border border-gray-300 px-4 py-3 text-center font-medium text-gray-700 hover:bg-gray-50 disabled:bg-gray-100"
              >
                🔄 Refresh Status
              </button>

              <button
                type="button"
                onClick={handleDuplicateInvoice}
                aria-label="Duplicate this invoice"
                className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 px-4 py-3 font-medium text-gray-700 hover:bg-gray-50"
              >
                <Copy className="h-4 w-4" />
                Duplicate
              </button>

              <button
                type="button"
                onClick={() => downloadDocument('invoice')}
                disabled={downloadInProgress !== null}
                aria-label="Download invoice PDF"
                className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 px-4 py-3 text-center font-medium text-gray-700 hover:bg-gray-50 disabled:bg-gray-100"
              >
                <Download className="h-4 w-4" />
                {downloadInProgress === 'invoice' ? 'Preparing...' : 'Invoice PDF'}
              </button>

              {isPaid && (
                <>
                  <button
                    type="button"
                    onClick={() => downloadDocument('receipt')}
                    disabled={downloadInProgress !== null}
                    aria-label="Download paid receipt PDF"
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 px-4 py-3 text-center font-medium text-gray-700 hover:bg-gray-50 disabled:bg-gray-100"
                  >
                    <Download className="h-4 w-4" />
                    {downloadInProgress === 'receipt'
                      ? 'Preparing...'
                      : 'Receipt PDF'}
                  </button>

                  <button
                    type="button"
                    onClick={() => window.print()}
                    aria-label="Print invoice"
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 px-4 py-3 text-center font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Printer className="h-4 w-4" />
                    Print
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer Help Text */}
        <div className="mt-8 rounded-md bg-gray-100 p-4 text-center text-sm text-gray-600">
          <p>
            {isPending && walletInfo?.hasWallet
              ? 'Click "Pay Invoice" to open your Stellar wallet and send payment.'
              : isPaid
                ? 'Thank you! Your payment has been received.'
                : 'Unable to process payment at this time.'}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function InvoiceDetailPage() {
  return (
    <RequireAuth>
      <InvoiceDetailContent />
    </RequireAuth>
  );
}
