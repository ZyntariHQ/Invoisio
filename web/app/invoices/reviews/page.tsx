'use client';

import { useState, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, CheckCircle2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { WalletAuthControls } from '@/components/wallet-auth-controls';
import { RequireAuth } from '@/components/require-auth';

interface PaymentReview {
  id: string;
  txHash: string;
  amount: number;
  assetCode: string;
  issueType: 'unmatched' | 'underpaid' | 'overpaid';
  status: 'pending' | 'resolved' | 'ignored';
  createdAt: string;
  originalMemo?: string;
}

type ResolutionAction = 'attach' | 'ignore' | 'manually_handled';

function PaymentReviewsContent() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<'pending' | 'resolved'>('pending');
  const [selectedReview, setSelectedReview] = useState<PaymentReview | null>(null);
  const [resolutionAction, setResolutionAction] = useState<ResolutionAction>('manually_handled');
  const [invoiceIdToAttach, setInvoiceIdToAttach] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');

  const { data: reviews, isLoading, error, refetch } = useQuery({
    queryKey: ['payment-reviews', statusFilter],
    queryFn: async () => {
      const { data } = await apiClient.get(`/invoices/reviews/queue?status=${statusFilter}`);
      return data as PaymentReview[];
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async (payload: { id: string, data: { action: ResolutionAction, invoiceId?: string, resolutionNote?: string } }) => {
      await apiClient.post(`/invoices/reviews/${payload.id}/resolve`, payload.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-reviews'] });
      setSelectedReview(null);
      setInvoiceIdToAttach('');
      setResolutionNote('');
    },
  });

  const openReview = (review: PaymentReview) => {
    resolveMutation.reset();
    setResolutionAction('manually_handled');
    setInvoiceIdToAttach('');
    setResolutionNote('');
    setSelectedReview(review);
  };

  const closeReview = () => {
    resolveMutation.reset();
    setSelectedReview(null);
  };

  const canResolve =
    resolutionAction !== 'attach' || invoiceIdToAttach.trim().length > 0;

  const handleResolve = () => {
    if (!selectedReview || !canResolve) return;
    resolveMutation.mutate({
      id: selectedReview.id,
      data: {
        action: resolutionAction,
        invoiceId: resolutionAction === 'attach' ? invoiceIdToAttach : undefined,
        resolutionNote,
      },
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Payment Reviews</h1>
            <p className="mt-2 text-sm text-gray-500">
              Manage unmatched, underpaid, and overpaid transactions.
            </p>
          </div>
          <div className="flex items-center gap-3 self-start sm:self-center">
            <WalletAuthControls />
            <button
              type="button"
              onClick={() => refetch()}
              aria-label="Refresh payment reviews"
              className="inline-flex items-center rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-colors"
            >
              <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="mb-6 flex gap-4">
          <button
            onClick={() => setStatusFilter('pending')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold ${statusFilter === 'pending' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-200'}`}
          >
            Pending
          </button>
          <button
            onClick={() => setStatusFilter('resolved')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold ${statusFilter === 'resolved' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-200'}`}
          >
            Resolved
          </button>
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
                  Error loading payment reviews: {error instanceof Error ? error.message : 'Unknown error'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Loading State */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-white border border-gray-100 shadow-sm" />
            ))}
          </div>
        ) : !reviews || reviews.length === 0 ? (
          /* Empty State */
          <div className="rounded-2xl border-2 border-dashed border-gray-300 bg-white p-12 text-center shadow-sm max-w-lg mx-auto mt-8">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 mb-6 shadow-inner">
              {statusFilter === 'pending' ? (
                <ShieldCheck className="h-8 w-8" />
              ) : (
                <CheckCircle2 className="h-8 w-8" />
              )}
            </div>
            <h3 className="text-lg font-bold text-gray-900">
              {statusFilter === 'pending'
                ? 'No pending payment reviews'
                : 'No resolved reviews'}
            </h3>
            <p className="mt-2 text-sm text-gray-500 leading-relaxed max-w-sm mx-auto">
              {statusFilter === 'pending'
                ? 'Unmatched, underpaid, and overpaid transactions will appear here for your review.'
                : 'Reviews you have resolved will appear here once you act on them.'}
            </p>
          </div>
        ) : (
          <>
            {/* Review Count */}
            <div className="mb-4 text-sm text-gray-500">
              Showing <span className="font-semibold text-gray-900">{reviews.length}</span>{' '}
              {statusFilter} review{reviews.length === 1 ? '' : 's'}
            </div>

            {/* Reviews Table */}
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="px-6 py-4 text-xs font-semibold uppercase text-gray-500">Transaction Hash</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase text-gray-500">Type</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase text-gray-500">Amount</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase text-gray-500">Date</th>
                    <th className="px-6 py-4 text-xs font-semibold uppercase text-gray-500 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {reviews.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50/75 transition-colors">
                      <td className="px-6 py-4 text-sm font-mono text-gray-900">{r.txHash.slice(0, 16)}...</td>
                      <td className="px-6 py-4 text-sm font-semibold text-gray-900 capitalize">{r.issueType}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{r.amount} {r.assetCode}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {new Date(r.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {r.status === 'pending' ? (
                          <button
                            onClick={() => openReview(r)}
                            className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                          >
                            Review
                          </button>
                        ) : (
                          <span className="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium ring-1 ring-inset bg-emerald-50 text-emerald-700 ring-emerald-600/20 capitalize">
                            {r.status}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Resolve Modal */}
      {selectedReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Resolve Payment</h2>
              <button
                type="button"
                onClick={closeReview}
                aria-label="Close review"
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Issue Type</p>
                <p className="text-sm font-medium text-gray-900 capitalize">{selectedReview.issueType}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Amount</p>
                <p className="text-sm font-medium text-gray-900">{selectedReview.amount} {selectedReview.assetCode}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider">Original Memo</p>
                <p className="text-sm font-mono text-gray-900">{selectedReview.originalMemo || 'N/A'}</p>
              </div>
            </div>

            {selectedReview.status === 'pending' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
                  <select
                    value={resolutionAction}
                    onChange={(e) => setResolutionAction(e.target.value as ResolutionAction)}
                    className="block w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    {selectedReview.issueType === 'unmatched' && <option value="attach">Attach to Invoice</option>}
                    <option value="manually_handled">Mark Manually Handled</option>
                    <option value="ignore">Ignore</option>
                  </select>
                </div>

                {resolutionAction === 'attach' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Target Invoice ID</label>
                    <input
                      type="text"
                      value={invoiceIdToAttach}
                      onChange={(e) => setInvoiceIdToAttach(e.target.value)}
                      className="block w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                      placeholder="Enter invoice UUID..."
                    />
                    {!canResolve && (
                      <p className="mt-1 text-xs text-amber-600">Enter the invoice ID to attach this payment to.</p>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Resolution Note</label>
                  <textarea
                    value={resolutionNote}
                    onChange={(e) => setResolutionNote(e.target.value)}
                    className="block w-full rounded-lg border border-gray-300 p-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                    rows={3}
                    placeholder="Add a note for the audit log..."
                  />
                </div>

                {resolveMutation.isError && (
                  <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-950" role="alert" aria-live="assertive">
                    Failed to resolve review:{' '}
                    {resolveMutation.error instanceof Error ? resolveMutation.error.message : 'Unknown error'}
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={closeReview}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
              >
                Close
              </button>
              {selectedReview.status === 'pending' && (
                <button
                  onClick={handleResolve}
                  disabled={resolveMutation.isPending || !canResolve}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {resolveMutation.isPending ? 'Saving...' : 'Resolve'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PaymentReviewsPage() {
  return (
    <RequireAuth>
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center bg-gray-50">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-blue-600" />
          </div>
        }
      >
        <PaymentReviewsContent />
      </Suspense>
    </RequireAuth>
  );
}
