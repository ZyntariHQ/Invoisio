
'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useCallback } from 'react';
import axios from 'axios';
import { generatePaymentUri, openPaymentWallet, getWalletInfo } from '@/lib/sep0007';
import { usePollInvoiceStatus } from '@/hooks/use-poll-invoice-status';

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

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const invoiceId = params?.id as string;

  const [walletInfo] = useState<WalletInfo | null>(getWalletInfo());
  const [paymentInProgress, setPaymentInProgress] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Fetch invoice function for polling
  const fetchInvoice = useCallback(async (id: string) => {
    const response = await axios.get<Invoice>(`${API_URL}/invoices/${id}`);
    return response.data;
  }, []);

  // Use polling hook for status updates
  const { invoice, isLoading, error: pollError, lastUpdated, refreshStatus } = usePollInvoiceStatus(
    invoiceId,
    fetchInvoice,
  );

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
            onClick={() => router.back()}
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
          onClick={() => router.back()}
          className="mb-8 text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          ← Back to Invoices
        </button>

        {/* Main Card */}
        <div className="overflow-hidden rounded-lg bg-white shadow">
          <div className="px-6 py-8 sm:px-8">
            {/* Invoice Header */}
            <div className="mb-8 flex items-start justify-between border-b border-gray-200 pb-6">
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
              <div className="mb-6 rounded-md bg-blue-50 p-4">
                <p className="text-sm font-medium text-blue-900">
                  ⏳ Waiting for payment... Check your wallet for confirmation.
                </p>
              </div>
            )}

            {isPaid && (
              <div className="mb-6 rounded-md bg-green-50 p-4">
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
              <div className="mb-6 rounded-md bg-red-50 p-4">
                <p className="text-sm font-medium text-red-900">
                  Error: {paymentError}
                </p>
              </div>
            )}

            {pollError && !invoice && (
              <div className="mb-6 rounded-md bg-red-50 p-4">
                <p className="text-sm font-medium text-red-900">
                  Error loading invoice: {pollError}
                </p>
              </div>
            )}

            {!walletInfo?.hasWallet && isPending && (
              <div className="mb-6 rounded-md bg-amber-50 p-4">
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
                <p className="text-xs font-medium uppercase text-blue-900 mb-2">Payment Instructions</p>
                <div className="space-y-2 text-sm text-gray-700">
                  <p>
                    <strong>Destination:</strong>{' '}
                    <code className="font-mono break-all">{invoice.destination_address}</code>
                  </p>
                  <p>
                    <strong>Memo:</strong> <code className="font-mono">{invoice.memo}</code>
                  </p>
                  <p>
                    <strong>Asset:</strong> {invoice.asset}
                    {invoice.asset_issuer && (
                      <>
                        {' '}
                        (Issuer: <code className="font-mono break-all">{invoice.asset_issuer}</code>)
                      </>
                    )}
                  </p>
                </div>
              </div>
            )}

            {/* Status Info */}
            {lastUpdated && (
              <div className="mb-6 text-xs text-gray-500">
                Last updated: {new Date(lastUpdated).toLocaleTimeString()}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col gap-3 sm:flex-row">
              {isPending && walletInfo?.hasWallet && (
                <button
                  onClick={handlePayClick}
                  disabled={paymentInProgress || isLoading}
                  className="flex-1 rounded-md bg-green-600 px-4 py-3 text-center font-medium text-white hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {paymentInProgress ? '⏳ Waiting for Payment...' : '💳 Pay Invoice'}
                </button>
              )}

              <button
                onClick={refreshStatus}
                disabled={isLoading}
                className="rounded-md border border-gray-300 px-4 py-3 text-center font-medium text-gray-700 hover:bg-gray-50 disabled:bg-gray-100"
              >
                🔄 Refresh Status
              </button>

              {isPaid && (
                <button
                  onClick={() => window.print()}
                  className="rounded-md border border-gray-300 px-4 py-3 text-center font-medium text-gray-700 hover:bg-gray-50"
                >
                  🖨️ Print
                </button>
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