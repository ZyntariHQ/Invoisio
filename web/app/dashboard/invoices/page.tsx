'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useMerchant } from '@/hooks/use-merchant';
import { useWalletAuth } from '@/hooks/use-wallet-auth';
import { Search, Plus, Filter } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

interface Invoice {
  id: string;
  number: string;
  clientName: string;
  clientEmail: string;
  amount: string;
  currency: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue';
  dueDate: string;
  createdAt: string;
}

export default function InvoicesPage() {
  const { merchantId } = useMerchant();
  const { isAuthenticated } = useWalletAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: invoices = [], isLoading } = useQuery<Invoice[]>({
    queryKey: ['invoices', merchantId, searchTerm, statusFilter],
    queryFn: async () => {
      if (!merchantId) return [];

      try {
        const params: { limit: number; q?: string } = { limit: 50 };
        if (searchTerm) params.q = searchTerm;

        const response = await apiClient.request<Invoice[]>({
          method: 'GET',
          url: '/invoices',
          params,
        });

        const rows = Array.isArray(response.data) ? response.data : [];
        if (statusFilter === 'all') {
          return rows;
        }

        return rows.filter((invoice) => invoice.status === statusFilter);
      } catch (err) {
        console.error('Failed to fetch invoices:', err);
        return [];
      }
    },
    enabled: !!merchantId && isAuthenticated,
  });

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

  // Calculate stats
  const stats = {
    total: invoices.length,
    paid: invoices.filter((inv) => inv.status === 'paid').length,
    pending: invoices.filter((inv) => inv.status === 'sent' || inv.status === 'overdue').length,
    draft: invoices.filter((inv) => inv.status === 'draft').length,
  };

  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Invoices</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Manage all your invoices in one place
          </p>
        </div>
        <Link
          href="/dashboard/invoices/create"
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} />
          <span>Create Invoice</span>
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">Total</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-2">
            {isLoading ? '...' : stats.total}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">Paid</p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-2">
            {isLoading ? '...' : stats.paid}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">Pending</p>
          <p className="text-2xl font-bold text-orange-600 dark:text-orange-400 mt-2">
            {isLoading ? '...' : stats.pending}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">Draft</p>
          <p className="text-2xl font-bold text-gray-600 dark:text-gray-400 mt-2">
            {isLoading ? '...' : stats.draft}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-3 top-3 text-gray-400" />
            <input
              type="text"
              placeholder="Search by invoice number, client name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>
        </div>
      </div>

      {/* Invoices Table */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
        {isLoading ? (
          <div className="p-8 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            ))}
          </div>
        ) : invoices.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-gray-600 dark:text-gray-400 mb-4">No invoices found</p>
            <Link
              href="/dashboard/invoices/create"
              className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Create Your First Invoice
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900 dark:text-white">
                    Invoice
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900 dark:text-white">
                    Client
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900 dark:text-white">
                    Amount
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900 dark:text-white">
                    Due Date
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900 dark:text-white">
                    Status
                  </th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-gray-900 dark:text-white">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                {invoices.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {invoice.number}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 dark:text-white">{invoice.clientName}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {invoice.clientEmail}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                      {invoice.amount} {invoice.currency}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                      {formatDate(invoice.dueDate)}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(
                          invoice.status
                        )}`}
                      >
                        {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <Link
                        href={`/dashboard/invoices/${invoice.id}`}
                        className="text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        View
                      </Link>
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
