'use client';

import { useMerchant } from '@/hooks/use-merchant';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useWalletAuth } from '@/hooks/use-wallet-auth';
import { TrendingUp, FileText, DollarSign, Clock } from 'lucide-react';
import Link from 'next/link';

interface Invoice {
  id: string;
  number: string;
  clientName: string;
  amount: string;
  currency: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  createdAt: string;
}

export default function DashboardPage() {
  const { wallet, merchantId } = useMerchant();
  const { isAuthenticated } = useWalletAuth();

  // Fetch recent invoices
  const { data: invoices = [], isLoading: invoicesLoading } = useQuery<Invoice[]>({
    queryKey: ['invoices', merchantId],
    queryFn: async () => {
      if (!merchantId) return [];

      try {
        const response = await apiClient.request<Invoice[]>({
          method: 'GET',
          url: '/invoices',
          params: { limit: 5 },
        });

        return Array.isArray(response.data) ? response.data : [];
      } catch (err) {
        console.error('Failed to fetch invoices:', err);
        return [];
      }
    },
    enabled: !!merchantId && isAuthenticated,
  });

  // Calculate stats
  const stats = {
    totalInvoices: invoices.length,
    paidInvoices: invoices.filter((inv) => inv.status === 'paid').length,
    pendingAmount: invoices
      .filter((inv) => inv.status === 'sent' || inv.status === 'overdue')
      .reduce((sum, inv) => sum + parseFloat(inv.amount || '0'), 0)
      .toFixed(2),
    overdueCount: invoices.filter((inv) => inv.status === 'overdue').length,
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300',
      sent: 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300',
      paid: 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300',
      overdue: 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300',
    };
    return colors[status] || colors.draft;
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="space-y-8 pb-8">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 dark:from-blue-900 dark:to-blue-800 rounded-lg p-6 md:p-8 text-white shadow-lg">
        <h1 className="text-3xl md:text-4xl font-bold mb-2">
          Welcome back, {wallet?.name || 'Merchant'}!
        </h1>
        <p className="text-blue-100">
          Manage your invoices and monitor your merchant wallet activity
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Invoices */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 dark:text-gray-400 text-sm">Total Invoices</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
                {invoicesLoading ? '...' : stats.totalInvoices}
              </p>
            </div>
            <FileText
              size={32}
              className="text-blue-500 dark:text-blue-400 opacity-20"
            />
          </div>
        </div>

        {/* Paid Invoices */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 dark:text-gray-400 text-sm">Paid Invoices</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-2">
                {invoicesLoading ? '...' : stats.paidInvoices}
              </p>
            </div>
            <TrendingUp
              size={32}
              className="text-green-500 dark:text-green-400 opacity-20"
            />
          </div>
        </div>

        {/* Pending Amount */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 dark:text-gray-400 text-sm">Pending Amount</p>
              <p className="text-2xl font-bold text-orange-600 dark:text-orange-400 mt-2">
                {invoicesLoading ? '...' : `$${stats.pendingAmount}`}
              </p>
            </div>
            <DollarSign
              size={32}
              className="text-orange-500 dark:text-orange-400 opacity-20"
            />
          </div>
        </div>

        {/* Overdue */}
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600 dark:text-gray-400 text-sm">Overdue</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-2">
                {invoicesLoading ? '...' : stats.overdueCount}
              </p>
            </div>
            <Clock
              size={32}
              className="text-red-500 dark:text-red-400 opacity-20"
            />
          </div>
        </div>
      </div>

      {/* Wallet Balance Section */}
      {wallet && (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Wallet Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Wallet Address</p>
              <p className="text-sm font-mono text-gray-900 dark:text-white mt-1 break-all">
                {wallet.publicKey}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Balance</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white mt-1">
                {wallet.balance} {wallet.currency}
              </p>
              {wallet.balanceUSD && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  ≈ ${wallet.balanceUSD}
                </p>
              )}
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Merchant ID</p>
              <p className="text-sm font-mono text-gray-900 dark:text-white mt-1 break-all">
                {wallet.id}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Recent Invoices */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Recent Invoices
          </h2>
          <Link
            href="/dashboard/invoices"
            className="text-blue-600 dark:text-blue-400 hover:underline text-sm font-medium"
          >
            View All
          </Link>
        </div>

        {invoicesLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            ))}
          </div>
        ) : invoices.length === 0 ? (
          <div className="py-12 text-center">
            <FileText
              size={48}
              className="mx-auto text-gray-400 dark:text-gray-600 mb-4"
            />
            <p className="text-gray-600 dark:text-gray-400">No invoices yet</p>
            <Link
              href="/dashboard/invoices"
              className="mt-4 inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Create Invoice
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 dark:border-gray-800">
                <tr>
                  <th className="text-left py-3 text-gray-600 dark:text-gray-400 font-medium">
                    Invoice
                  </th>
                  <th className="text-left py-3 text-gray-600 dark:text-gray-400 font-medium">
                    Client
                  </th>
                  <th className="text-left py-3 text-gray-600 dark:text-gray-400 font-medium">
                    Amount
                  </th>
                  <th className="text-left py-3 text-gray-600 dark:text-gray-400 font-medium">
                    Status
                  </th>
                  <th className="text-left py-3 text-gray-600 dark:text-gray-400 font-medium">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="py-3">
                      <Link
                        href={`/dashboard/invoices/${invoice.id}`}
                        className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                      >
                        {invoice.number}
                      </Link>
                    </td>
                    <td className="py-3 text-gray-900 dark:text-white">
                      {invoice.clientName}
                    </td>
                    <td className="py-3 text-gray-900 dark:text-white">
                      {invoice.amount} {invoice.currency}
                    </td>
                    <td className="py-3">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                          invoice.status
                        )}`}
                      >
                        {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                      </span>
                    </td>
                    <td className="py-3 text-gray-600 dark:text-gray-400">
                      {formatDate(invoice.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
