"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiClient, extractApiErrorMessage } from "@/lib/api-client";
import { RequireAuth } from "@/components/require-auth";
import { CustomerService, Customer } from "@/lib/customer-service";

const USDC_ISSUER =
  process.env.NEXT_PUBLIC_USDC_ISSUER ||
  "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

type Asset = "XLM" | "USDC";

function CustomerAutocomplete({
  onCustomerSelect,
}: {
  onCustomerSelect: (customer: Customer | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );
  const [isCreating, setIsCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!query.trim()) {
        setResults([]);
        setIsOpen(false);
        return;
      }
      try {
        const customers = await CustomerService.search(query, 8);
        setResults(customers);
        setIsOpen(customers.length > 0);
        setHighlightIndex(-1);
      } catch {
        setResults([]);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const selectCustomer = useCallback(
    (customer: Customer) => {
      setSelectedCustomer(customer);
      setQuery(
        `${customer.name}${customer.email ? ` (${customer.email})` : ""}`,
      );
      setIsOpen(false);
      setShowCreateForm(false);
      onCustomerSelect(customer);
    },
    [onCustomerSelect],
  );

  const clearSelection = () => {
    setSelectedCustomer(null);
    setQuery("");
    setResults([]);
    setIsOpen(false);
    onCustomerSelect(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && highlightIndex >= 0) {
      e.preventDefault();
      selectCustomer(results[highlightIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setIsCreating(true);
    setCreateError(null);
    try {
      const created = await CustomerService.create({
        name: newName.trim(),
        email: newEmail.trim() || undefined,
        notes: newNotes.trim() || undefined,
      });
      selectCustomer(created);
      setNewName("");
      setNewEmail("");
      setNewNotes("");
      setShowCreateForm(false);
    } catch (err) {
      setCreateError(extractApiErrorMessage(err));
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <label
        htmlFor="customer-search"
        className="block text-sm font-medium text-gray-700"
      >
        Client Profile{" "}
        <span className="font-normal text-gray-400">(search or create)</span>
      </label>
      <div className="mt-1 relative">
        <input
          id="customer-search"
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (selectedCustomer) {
              setSelectedCustomer(null);
              onCustomerSelect(null);
            }
          }}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Type to search saved clients..."
          className="block w-full rounded-md border-0 py-3 px-4 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600"
          autoComplete="off"
        />
        {selectedCustomer && (
          <button
            type="button"
            onClick={clearSelection}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
            title="Clear selection"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Dropdown results */}
      {isOpen && results.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white shadow-lg ring-1 ring-black/5 focus:outline-none">
          {results.map((customer, idx) => (
            <li
              key={customer.id}
              onClick={() => selectCustomer(customer)}
              className={`cursor-pointer px-4 py-3 text-sm transition-colors ${
                idx === highlightIndex
                  ? "bg-blue-50 text-blue-900"
                  : "text-gray-900 hover:bg-gray-50"
              }`}
            >
              <div className="font-medium">{customer.name}</div>
              {customer.email && (
                <div className="text-xs text-gray-500">{customer.email}</div>
              )}
              {customer.notes && (
                <div className="text-xs text-gray-400 truncate mt-0.5">
                  {customer.notes}
                </div>
              )}
            </li>
          ))}
          <li
            onClick={() => {
              setIsOpen(false);
              setShowCreateForm(true);
              setNewName(query);
            }}
            className="cursor-pointer border-t border-gray-100 px-4 py-3 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors"
          >
            + Create new client &quot;{query}&quot;
          </li>
        </ul>
      )}

      {/* Selected customer info */}
      {selectedCustomer && (
        <div className="mt-2 flex items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">
          <svg
            className="h-4 w-4 text-blue-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
          <span className="font-medium">{selectedCustomer.name}</span>
          {selectedCustomer.email && (
            <span className="text-blue-600">({selectedCustomer.email})</span>
          )}
        </div>
      )}

      {/* Inline create form */}
      {showCreateForm && !selectedCustomer && (
        <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/50 p-4">
          <p className="text-sm font-medium text-gray-700 mb-3">
            Create new client profile
          </p>
          <form onSubmit={handleCreateCustomer} className="space-y-3">
            <div>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Client name *"
                required
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                autoFocus
              />
            </div>
            <div>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Email (optional)"
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <textarea
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Notes (optional)"
                rows={2}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            {createError && (
              <p className="text-sm text-red-600">{createError}</p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isCreating || !newName.trim()}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
              >
                {isCreating ? "Creating..." : "Save Client"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setCreateError(null);
                }}
                className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function NewInvoiceContent() {
  const router = useRouter();
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [asset, setAsset] = useState<Asset>("XLM");
  const [dueDate, setDueDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountNum = parseFloat(amount);
  const isAmountValid = !isNaN(amountNum) && amountNum > 0;
  const effectiveName = selectedCustomer?.name || clientName;
  const effectiveEmail = selectedCustomer?.email || clientEmail;
  const isFormValid =
    isAmountValid && effectiveName.trim() && effectiveEmail.trim();

  // When a customer is selected, auto-fill name and email
  const handleCustomerSelect = (customer: Customer | null) => {
    setSelectedCustomer(customer);
    if (customer) {
      setClientName(customer.name);
      setClientEmail(customer.email || "");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const ts = Date.now();
      const body: Record<string, unknown> = {
        invoiceNumber: `INV-${ts}`,
        clientName: effectiveName.trim(),
        clientEmail: effectiveEmail.trim(),
        amount: amountNum,
        asset_code: asset,
      };

      if (asset === "USDC") {
        body.asset_issuer = USDC_ISSUER;
      }

      if (description.trim()) {
        body.description = description.trim();
      }

      if (selectedCustomer) {
        body.customer_id = selectedCustomer.id;
      }

      if (dueDate) {
        body.dueDate = new Date(dueDate).toISOString();
      }

      const response = await apiClient.post("/invoices", body);
      router.push(`/invoices/${response.data.id}`);
    } catch (err) {
      setError(extractApiErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <button
          type="button"
          onClick={() => router.push("/invoices")}
          className="mb-8 text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          &larr; Back to Invoices
        </button>

        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="px-6 py-8 sm:px-8">
            <h1 className="text-2xl font-bold text-gray-900">New Invoice</h1>
            <p className="mt-1 text-sm text-gray-500">
              Create a payment request for your client.
            </p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-6" noValidate>
              {/* Customer Autocomplete */}
              <CustomerAutocomplete onCustomerSelect={handleCustomerSelect} />

              {/* Client Name (editable even if no customer selected) */}
              {!selectedCustomer && (
                <>
                  <div>
                    <label
                      htmlFor="client-name"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Client Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="client-name"
                      type="text"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="Client or company name"
                      required
                      className="mt-1 block w-full rounded-md border-0 py-3 px-4 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="client-email"
                      className="block text-sm font-medium text-gray-700"
                    >
                      Client Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      id="client-email"
                      type="email"
                      value={clientEmail}
                      onChange={(e) => setClientEmail(e.target.value)}
                      placeholder="client@example.com"
                      required
                      className="mt-1 block w-full rounded-md border-0 py-3 px-4 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600"
                    />
                  </div>
                </>
              )}

              {/* Amount + Asset */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="amount"
                    className="block text-sm font-medium text-gray-700"
                  >
                    Amount <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="amount"
                    type="number"
                    inputMode="decimal"
                    min="0.0000001"
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    required
                    className="mt-1 block w-full rounded-md border-0 py-3 px-4 text-lg font-bold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-300 focus:ring-2 focus:ring-inset focus:ring-blue-600"
                  />
                </div>
                <div>
                  <span className="block text-sm font-medium text-gray-700">
                    Asset
                  </span>
                  <div className="mt-1 flex rounded-md shadow-sm" role="group">
                    <button
                      type="button"
                      onClick={() => setAsset("XLM")}
                      className={`flex-1 rounded-l-md border px-4 py-3 text-sm font-semibold transition-colors ${
                        asset === "XLM"
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      XLM
                    </button>
                    <button
                      type="button"
                      onClick={() => setAsset("USDC")}
                      className={`flex-1 rounded-r-md border-t border-b border-r px-4 py-3 text-sm font-semibold transition-colors ${
                        asset === "USDC"
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      USDC
                    </button>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <label
                  htmlFor="description"
                  className="block text-sm font-medium text-gray-700"
                >
                  Description{" "}
                  <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the goods or services..."
                  rows={3}
                  className="mt-1 block w-full rounded-md border-0 py-2 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600"
                />
              </div>

              {/* Due Date */}
              <div>
                <label
                  htmlFor="due-date"
                  className="block text-sm font-medium text-gray-700"
                >
                  Due Date{" "}
                  <span className="font-normal text-gray-400">(optional)</span>
                </label>
                <input
                  id="due-date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="mt-1 block w-full rounded-md border-0 py-3 px-4 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-blue-600"
                />
              </div>

              {error && (
                <div className="rounded-md bg-red-50 p-4" role="alert">
                  <p className="text-sm font-medium text-red-900">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={!isFormValid || isSubmitting}
                className="w-full rounded-md bg-blue-600 px-4 py-4 text-center text-lg font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400 transition-colors"
              >
                {isSubmitting ? "Creating Invoice..." : "Create Invoice"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function NewInvoicePage() {
  return (
    <RequireAuth>
      <NewInvoiceContent />
    </RequireAuth>
  );
}
