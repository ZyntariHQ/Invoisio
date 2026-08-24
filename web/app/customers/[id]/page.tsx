"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter, notFound } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle,
  Clock,
  AlertCircle,
  FileText,
  Plus,
  Edit2,
  Mail,
  X,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { RequireAuth } from "@/components/require-auth";
import { WalletAuthControls } from "@/components/wallet-auth-controls";
import { CustomerService, CreateCustomerPayload } from "@/lib/customer-service";
import { extractApiErrorMessage } from "@/lib/api-client";

interface MetricCardProps {
  label: string;
  value: string | number;
  description: string;
  icon: React.ReactNode;
  accentClass: string;
}

function MetricCard({ label, value, description, icon, accentClass }: MetricCardProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-500">{label}</p>
          <p className="mt-0.5 text-xs text-gray-400">{description}</p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${accentClass}`}>
          {icon}
        </div>
      </div>
      <p className="mt-4 text-2xl font-bold tracking-tight text-gray-900">{value}</p>
    </div>
  );
}

function CustomerDetailContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const customerId = params?.id as string;

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Fetch customer summary
  const {
    data: summary,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["customer-summary", customerId],
    queryFn: () => CustomerService.getSummary(customerId),
    enabled: !!customerId,
  });

  // Update customer mutation
  const updateMutation = useMutation({
    mutationFn: (payload: Partial<CreateCustomerPayload>) =>
      CustomerService.update(customerId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-summary", customerId] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setIsEditModalOpen(false);
    },
    onError: (err) => {
      setFormError(extractApiErrorMessage(err));
    },
  });

  const handleOpenEditModal = () => {
    if (!summary) return;
    setName(summary.name);
    setEmail(summary.email || "");
    setNotes(summary.notes || "");
    setFormError(null);
    setIsEditModalOpen(true);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    updateMutation.mutate({
      name: name.trim(),
      email: email.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  };

  const formatAmount = (value: number) => {
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "paid":
        return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
      case "pending":
        return "bg-amber-50 text-amber-700 ring-amber-600/20";
      case "overdue":
        return "bg-rose-50 text-rose-700 ring-rose-600/20";
      case "cancelled":
        return "bg-slate-50 text-slate-600 ring-slate-500/10";
      default:
        return "bg-gray-50 text-gray-600 ring-gray-500/10";
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-24 text-gray-500">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <p className="mt-4 text-sm font-medium">Loading customer profile & metrics...</p>
      </div>
    );
  }

  if (isError || !summary) {
    const is404 =
      (error as any)?.status === 404 ||
      (error as any)?.response?.status === 404 ||
      error?.message?.includes("404");

    if (is404) {
      notFound();
    }

    return (
      <div className="mx-auto max-w-2xl text-center p-12">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-600">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-lg font-bold text-gray-900">Couldn&apos;t load profile</h3>
        <p className="mt-2 text-sm text-gray-500">
          {error instanceof Error ? error.message : "The requested customer profile could not be found."}
        </p>
        <button
          onClick={() => router.push("/customers")}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          Back to Directory
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/customers"
            className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to customers
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">{summary.name}</h1>
            <button
              onClick={handleOpenEditModal}
              className="rounded-lg p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              title="Edit profile settings"
            >
              <Edit2 className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
            {summary.email ? (
              <span className="flex items-center gap-1.5">
                <Mail className="h-4 w-4 text-gray-400" />
                {summary.email}
              </span>
            ) : (
              <span className="italic text-gray-400">No email saved</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-center">
          <WalletAuthControls />
          <Link
            href={`/invoices/new?customerId=${summary.id}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create Invoice
          </Link>
        </div>
      </div>

      {/* Metrics Cards Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <MetricCard
          label="Collected volume"
          value={formatAmount(summary.paidVolume)}
          description="Sum of fully paid invoices"
          icon={<CheckCircle className="h-5 w-5" />}
          accentClass="bg-emerald-50 text-emerald-600"
        />
        <MetricCard
          label="Outstanding balance"
          value={formatAmount(summary.outstandingBalance)}
          description="Awaiting settlement"
          icon={<Clock className="h-5 w-5" />}
          accentClass="bg-blue-50 text-blue-600"
        />
        <MetricCard
          label="Overdue balance"
          value={formatAmount(summary.overdueBalance)}
          description="Past due settlement"
          icon={<AlertCircle className="h-5 w-5" />}
          accentClass="bg-rose-50 text-rose-600"
        />
        <MetricCard
          label="Total invoices"
          value={summary.invoiceCount}
          description="All issues (excl. drafts)"
          icon={<FileText className="h-5 w-5" />}
          accentClass="bg-slate-100 text-slate-600"
        />
      </div>

      {/* Main Content Layout */}
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        {/* Recent Invoices Table */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Recent Invoices</h2>
          {summary.recentInvoices.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
              <FileText className="mx-auto h-10 w-10 text-gray-400" />
              <p className="mt-4 text-sm font-semibold text-gray-900">No invoices yet</p>
              <p className="mt-1 text-xs text-gray-500 max-w-xs mx-auto">
                Issue your first billing request to this client to start tracking activity.
              </p>
              <Link
                href={`/invoices/new?customerId=${summary.id}`}
                className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
              >
                Create invoice &rarr;
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-6">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/50 text-xs font-semibold uppercase text-gray-500">
                    <th className="px-6 py-3">Invoice Number</th>
                    <th className="px-6 py-3">Issued Date</th>
                    <th className="px-6 py-3">Amount</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {summary.recentInvoices.map((invoice) => (
                    <tr key={invoice.id} className="hover:bg-gray-50/50 transition-colors group">
                      <td className="px-6 py-3.5 font-medium text-gray-950">
                        <Link href={`/invoices/${invoice.id}`} className="hover:text-blue-600 transition-colors">
                          {invoice.invoiceNumber || `#${invoice.id.slice(0, 8)}`}
                        </Link>
                      </td>
                      <td className="px-6 py-3.5 text-sm text-gray-500">
                        {formatDate(invoice.createdAt)}
                      </td>
                      <td className="px-6 py-3.5 text-sm font-semibold text-gray-900">
                        {formatAmount(invoice.amount)}
                      </td>
                      <td className="px-6 py-3.5">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${getStatusColor(invoice.status)}`}>
                          {invoice.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <Link
                          href={`/invoices/${invoice.id}`}
                          className="inline-flex items-center gap-0.5 text-xs font-semibold text-blue-600 hover:text-blue-800"
                        >
                          Details
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Aside Account Meta Card */}
        <aside className="space-y-6">
          {summary.notes && (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-3">
                Internal Notes
              </h2>
              <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
                {summary.notes}
              </p>
            </div>
          )}

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm text-xs text-gray-400 space-y-2">
            <div className="flex justify-between">
              <span>Client ID</span>
              <span className="font-mono text-gray-600">{summary.id.slice(0, 8)}...</span>
            </div>
            <div className="flex justify-between">
              <span>Associated Merchant</span>
              <span>Active Scope</span>
            </div>
          </div>
        </aside>
      </div>

      {/* Edit Profile Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div
            className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Edit Customer Profile</h2>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label htmlFor="edit-name" className="block text-sm font-medium text-gray-700">
                  Client Name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="edit-name"
                  type="text"
                  required
                  placeholder="e.g. John Doe, Acme Corp"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label htmlFor="edit-email" className="block text-sm font-medium text-gray-700">
                  Email Address
                </label>
                <input
                  id="edit-email"
                  type="email"
                  placeholder="e.g. john@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label htmlFor="edit-notes" className="block text-sm font-medium text-gray-700">
                  Internal Notes
                </label>
                <textarea
                  id="edit-notes"
                  rows={4}
                  placeholder="Describe payment preferences, billing terms, etc..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {formError && (
                <p className="text-sm font-medium text-rose-600 bg-rose-50 border border-rose-100 rounded-md p-2" role="alert">
                  {formError}
                </p>
              )}

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending || !name.trim()}
                  className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CustomerDetailPage() {
  return (
    <RequireAuth>
      <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
        <CustomerDetailContent />
      </div>
    </RequireAuth>
  );
}
