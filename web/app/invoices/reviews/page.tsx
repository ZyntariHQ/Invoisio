'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { WalletAuthControls } from '@/components/wallet-auth-controls';

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

export default function PaymentReviewsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<'pending' | 'resolved'>('pending');
  const [selectedReview, setSelectedReview] = useState<PaymentReview | null>(null);
  const [resolutionAction, setResolutionAction] = useState<'attach' | 'ignore' | 'manually_handled'>('manually_handled');
  const [invoiceIdToAttach, setInvoiceIdToAttach] = useState('');
  const [resolutionNote, setResolutionNote] = useState('');

  const { data: reviews, isLoading } = useQuery({
    queryKey: ['payment-reviews', statusFilter],
    queryFn: async () => {
      const { data } = await apiClient.get(`/invoices/reviews/queue?status=${statusFilter}`);
      return data as PaymentReview[];
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async (payload: { id: string, data: { action: 'attach' | 'ignore' | 'manually_handled', invoiceId?: string, resolutionNote?: string } }) => {
      await apiClient.post(`/invoices/reviews/${payload.id}/resolve`, payload.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-reviews'] });
      setSelectedReview(null);
      setInvoiceIdToAttach('');
      setResolutionNote('');
    },
  });

  const handleResolve = () => {
    if (!selectedReview) return;
    resolveMutation.mutate({
      id: selectedReview.id,
      data: {
        action: resolutionAction,
        invoiceId: resolutionAction === 'attach' ? invoiceIdToAttach : undefined,
        resolutionNote,
      }
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Payment Reviews</h1>
            <p className="mt-2 text-sm text-gray-500">Manage unmatched, underpaid, and overpaid transactions.</p>
          </div>
          <div className="flex items-center gap-3">
            <WalletAuthControls />
          </div>
        </div>

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
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">Loading...</td>
                </tr>
              ) : reviews?.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">No {statusFilter} reviews found.</td>
                </tr>
              ) : (
                reviews?.map((r) => (
                  <tr key={r.id}>
                    <td className="px-6 py-4 text-sm font-mono text-gray-900">{r.txHash.slice(0, 16)}...</td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900 capitalize">{r.issueType}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{r.amount} {r.assetCode}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(r.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => setSelectedReview(r)}
                        className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {selectedReview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Resolve Payment</h2>
              
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
                      onChange={(e) => setResolutionAction(e.target.value as 'attach' | 'ignore' | 'manually_handled')}
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
                </div>
              )}

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setSelectedReview(null)}
                  className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                >
                  Close
                </button>
                {selectedReview.status === 'pending' && (
                  <button
                    onClick={handleResolve}
                    disabled={resolveMutation.isPending}
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
    </div>
  );
}
