"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Search,
  UserPlus,
  Edit2,
  Trash2,
  Loader2,
  Mail,
  FileText,
  X,
  Plus,
  RefreshCw,
} from "lucide-react";
import { RequireAuth } from "@/components/require-auth";
import { WalletAuthControls } from "@/components/wallet-auth-controls";
import { CustomerService, Customer, CreateCustomerPayload } from "@/lib/customer-service";
import { extractApiErrorMessage } from "@/lib/api-client";

function CustomersContent() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Fetch customer list
  const {
    data: customers = [],
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["customers", debouncedSearch],
    queryFn: () => CustomerService.list(debouncedSearch),
  });

  // Create customer mutation
  const createMutation = useMutation({
    mutationFn: (payload: CreateCustomerPayload) => CustomerService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setIsAddModalOpen(false);
      resetForm();
    },
    onError: (err) => {
      setFormError(extractApiErrorMessage(err));
    },
  });

  // Update customer mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<CreateCustomerPayload> }) =>
      CustomerService.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setIsEditModalOpen(false);
      resetForm();
    },
    onError: (err) => {
      setFormError(extractApiErrorMessage(err));
    },
  });

  // Delete customer mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => CustomerService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setDeletingId(null);
    },
    onError: (err) => {
      alert(`Failed to delete customer: ${extractApiErrorMessage(err)}`);
      setDeletingId(null);
    },
  });

  const resetForm = () => {
    setName("");
    setEmail("");
    setNotes("");
    setFormError(null);
    setSelectedCustomer(null);
  };

  const handleOpenAddModal = () => {
    resetForm();
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (customer: Customer) => {
    resetForm();
    setSelectedCustomer(customer);
    setName(customer.name);
    setEmail(customer.email || "");
    setNotes(customer.notes || "");
    setIsEditModalOpen(true);
  };

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate({
      name: name.trim(),
      email: email.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !name.trim()) return;
    updateMutation.mutate({
      id: selectedCustomer.id,
      payload: {
        name: name.trim(),
        email: email.trim() || undefined,
        notes: notes.trim() || undefined,
      },
    });
  };

  const handleDeleteClick = (id: string) => {
    setDeletingId(id);
  };

  const confirmDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="mx-auto max-w-5xl">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href="/dashboard"
            className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Customer Directory
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            Browse and manage repeat clients, view invoice summaries, and issue new billing.
          </p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-center">
          <WalletAuthControls />
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="inline-flex items-center gap-2 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-60 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Customer
          </button>
        </div>
      </div>

      {/* Directory Content */}
      <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        {/* Search Bar */}
        <div className="border-b border-gray-200 bg-gray-50/50 p-4">
          <div className="relative max-w-md">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search customers by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-3 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-gray-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* List / Table */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-12 text-gray-500">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <p className="mt-4 text-sm font-medium">Loading customers directory...</p>
          </div>
        ) : isError ? (
          <div className="p-8 text-center bg-red-50 text-red-700">
            <p className="font-semibold">Failed to fetch customer list</p>
            <p className="text-sm mt-1">{error instanceof Error ? error.message : "Unknown error"}</p>
            <button
              onClick={() => refetch()}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 transition-colors"
            >
              Try again
            </button>
          </div>
        ) : customers.length === 0 ? (
          searchQuery ? (
            /* Search Empty State */
            <div className="p-16 text-center">
              <Search className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-4 text-lg font-bold text-gray-900">No matching clients found</h3>
              <p className="mt-2 text-sm text-gray-500 max-w-sm mx-auto leading-relaxed">
                We couldn&apos;t find any customers matching &ldquo;{searchQuery}&rdquo;. Check the spelling or add a new customer.
              </p>
              <div className="mt-6 flex justify-center gap-3">
                <button
                  onClick={() => setSearchQuery("")}
                  className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-colors"
                >
                  Clear search
                </button>
                <button
                  onClick={handleOpenAddModal}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
                >
                  Create new client
                </button>
              </div>
            </div>
          ) : (
            /* General Empty State */
            <div className="p-16 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 mb-6">
                <UserPlus className="h-8 w-8" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">No customers saved yet</h3>
              <p className="mt-2 text-sm text-gray-500 max-w-md mx-auto leading-relaxed">
                Add profiles for repeat clients to streamline your invoicing workflow, pre-fill invoices, and keep track of account metrics.
              </p>
              <button
                type="button"
                onClick={handleOpenAddModal}
                className="mt-8 inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add your first customer
              </button>
            </div>
          )
        ) : (
          /* Table Layout */
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <th className="px-6 py-3.5">Client</th>
                  <th className="px-6 py-3.5">Notes</th>
                  <th className="px-6 py-3.5">Added On</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {customers.map((customer) => {
                  const isDeletingConfirm = deletingId === customer.id;
                  return (
                    <tr
                      key={customer.id}
                      className="hover:bg-gray-50/70 transition-colors group"
                    >
                      <td className="px-6 py-4">
                        <div className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                          <Link href={`/customers/${customer.id}`}>{customer.name}</Link>
                        </div>
                        {customer.email ? (
                          <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                            <Mail className="h-3.5 w-3.5 text-gray-400" />
                            {customer.email}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400 italic">No email saved</span>
                        )}
                      </td>
                      <td className="px-6 py-4 max-w-xs">
                        {customer.notes ? (
                          <div className="flex items-start gap-1 text-xs text-gray-600">
                            <FileText className="h-3.5 w-3.5 text-gray-400 flex-shrink-0 mt-0.5" />
                            <span className="truncate">{customer.notes}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {formatDate(customer.createdAt)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {isDeletingConfirm ? (
                          <div className="flex items-center justify-end gap-2" role="alert">
                            <span className="text-xs font-medium text-rose-700">Delete customer?</span>
                            <button
                              onClick={() => confirmDelete(customer.id)}
                              disabled={deleteMutation.isPending}
                              className="rounded bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-700 transition-colors disabled:bg-rose-300"
                            >
                              {deleteMutation.isPending ? "..." : "Yes"}
                            </button>
                            <button
                              onClick={() => setDeletingId(null)}
                              disabled={deleteMutation.isPending}
                              className="rounded bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                            <Link
                              href={`/customers/${customer.id}`}
                              className="rounded px-2.5 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 transition-colors"
                            >
                              View Detail
                            </Link>
                            <button
                              onClick={() => handleOpenEditModal(customer)}
                              className="rounded p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors"
                              title="Edit profile"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteClick(customer.id)}
                              className="rounded p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                              title="Delete customer"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Customer Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div
            className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Add Customer</h2>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label htmlFor="add-name" className="block text-sm font-medium text-gray-700">
                  Client Name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="add-name"
                  type="text"
                  required
                  placeholder="e.g. John Doe, Acme Corp"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label htmlFor="add-email" className="block text-sm font-medium text-gray-700">
                  Email Address
                </label>
                <input
                  id="add-email"
                  type="email"
                  placeholder="e.g. john@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label htmlFor="add-notes" className="block text-sm font-medium text-gray-700">
                  Internal Notes
                </label>
                <textarea
                  id="add-notes"
                  rows={3}
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
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || !name.trim()}
                  className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {createMutation.isPending ? "Saving..." : "Save Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Customer Modal */}
      {isEditModalOpen && selectedCustomer && (
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
                  rows={3}
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

export default function CustomersPage() {
  return (
    <RequireAuth>
      <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
        <CustomersContent />
      </div>
    </RequireAuth>
  );
}
