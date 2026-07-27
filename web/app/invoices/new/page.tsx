
'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiClient, extractApiErrorMessage } from '@/lib/api-client';

const USDC_ISSUER =
  process.env.NEXT_PUBLIC_USDC_ISSUER ||
  'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';

export default function NewInvoice() {
  const router = useRouter();

  const [invoiceNumber, setInvoiceNumber] = useState(() => `INV-${Date.now().toString().slice(-6)}`);
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [asset, setAsset] = useState<'XLM' | 'USDC'>('USDC');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const numAmount = parseFloat(amount);
      if (!clientName.trim() || isNaN(numAmount) || numAmount <= 0) {
        setError('Please enter a valid client name and amount greater than 0.');
        return;
      }

      setIsSubmitting(true);
      setError(null);

      try {
        const body: Record<string, unknown> = {
          invoiceNumber: invoiceNumber.trim() || `INV-${Date.now().toString().slice(-6)}`,
          clientName: clientName.trim(),
          clientEmail: clientEmail.trim() || undefined,
          description: description.trim() || undefined,
          amount: numAmount,
          asset_code: asset,
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        };

        if (asset === 'USDC') {
          body.asset_issuer = USDC_ISSUER;
        }

        const res = await apiClient.post('/invoices', body);
        const createdId = res.data?.id || res.data?.invoiceNumber;
        if (createdId) {
          router.push(`/invoices/${createdId}`);
        } else {
          router.push('/invoices');
        }
      } catch (err) {
        setError(extractApiErrorMessage(err));
      } finally {
        setIsSubmitting(false);
      }
    },
    [invoiceNumber, clientName, clientEmail, amount, asset, description, dueDate, router],
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Create New Invoice</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Issue a Stellar crypto payment invoice for your client.
            </p>
          </div>
          <Link
            href="/invoices"
            className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            &larr; Back to Invoices
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="bg-white dark:bg-zinc-950 p-6 sm:p-8 rounded-xl border border-gray-200 dark:border-zinc-800 shadow-sm space-y-6">
          {error && (
            <div className="p-4 rounded-md bg-red-50 dark:bg-red-900/30 text-red-800 dark:text-red-300 text-sm font-medium">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="invoiceNumber" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Invoice Number
              </label>
              <input
                id="invoiceNumber"
                type="text"
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-600 outline-none"
              />
            </div>

            <div>
              <label htmlFor="dueDate" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Due Date
              </label>
              <input
                id="dueDate"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full rounded-md border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-600 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="clientName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Client Name <span className="text-red-500">*</span>
              </label>
              <input
                id="clientName"
                type="text"
                placeholder="Acme Corp"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-600 outline-none"
              />
            </div>

            <div>
              <label htmlFor="clientEmail" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Client Email
              </label>
              <input
                id="clientEmail"
                type="email"
                placeholder="billing@acme.com"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                className="w-full rounded-md border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-600 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="amount" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Amount <span className="text-red-500">*</span>
              </label>
              <input
                id="amount"
                type="number"
                step="any"
                min="0.000001"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                className="w-full rounded-md border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-600 outline-none"
              />
            </div>

            <div>
              <label htmlFor="asset" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Payment Asset
              </label>
              <select
                id="asset"
                value={asset}
                onChange={(e) => setAsset(e.target.value as 'XLM' | 'USDC')}
                className="w-full rounded-md border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-600 outline-none"
              >
                <option value="USDC">USDC (USD Stablecoin)</option>
                <option value="XLM">XLM (Stellar Lumens)</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description / Notes
            </label>
            <textarea
              id="description"
              rows={3}
              placeholder="Services rendered, project milestone, etc."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-md border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-600 outline-none"
            />
          </div>

          <div className="pt-4 flex items-center justify-end gap-3">
            <Link
              href="/invoices"
              className="px-4 py-2 rounded-md border border-gray-300 dark:border-zinc-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-900"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:bg-gray-400 transition-colors"
            >
              {isSubmitting ? 'Creating Invoice...' : 'Create Invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}