"use client";

/**
 * CustomerAutocomplete
 *
 * A shared, fully self-contained customer search + quick-create + inline-edit
 * widget for use inside Invoice and POS forms.
 *
 * Features:
 *  - Debounced search with keyboard navigation (↑ ↓ Enter Escape)
 *  - Quick-create form with name, email, notes validation
 *  - Duplicate-name hint shown before creating a new customer
 *  - Inline edit form for the currently selected customer
 *  - Clear / deselect selection
 *  - Fully accessible (aria labels, roles, live regions)
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useId,
} from "react";
import {
  CustomerService,
  Customer,
  CreateCustomerPayload,
} from "@/lib/customer-service";
import { extractApiErrorMessage } from "@/lib/api-client";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CustomerAutocompleteProps {
  /** Called whenever the selected customer changes (null = cleared). */
  onCustomerSelect: (customer: Customer | null) => void;
  /** Currently selected customer (controlled). */
  value?: Customer | null;
  /** Optional label text override. Defaults to "Client Profile". */
  label?: string;
  /** Optional helper text shown next to the label. Defaults to "search or create". */
  helperText?: string;
  /** Extra Tailwind classes applied to the outermost wrapper. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Small UI helpers
// ---------------------------------------------------------------------------

function UserIcon() {
  return (
    <svg
      className="h-4 w-4 text-blue-500 shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
      />
    </svg>
  );
}

function XIcon({ size = 5 }: { size?: number }) {
  return (
    <svg
      className={`h-${size} w-${size}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M6 18L18 6M6 6l12 12"
      />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M15.232 5.232l3.536 3.536M9 13l6.536-6.536a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H8v-2.414a2 2 0 01.586-1.414z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Inline field component (shared by both create and edit forms)
// ---------------------------------------------------------------------------

function InlineField({
  id,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  required,
  maxLength,
  rows,
  error,
}: {
  id: string;
  label: string;
  type?: "text" | "email" | "textarea";
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  rows?: number;
  error?: string;
}) {
  const base =
    "block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";
  const errClass = error ? "border-red-400 focus:border-red-500 focus:ring-red-500" : "";
  const cls = `${base} ${errClass}`.trim();

  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-gray-600 mb-1">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>
      {type === "textarea" ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows ?? 2}
          maxLength={maxLength}
          className={cls}
        />
      ) : (
        <input
          id={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
          maxLength={maxLength}
          className={cls}
        />
      )}
      {error && (
        <p className="mt-0.5 text-xs text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CustomerAutocomplete({
  onCustomerSelect,
  value,
  label = "Client Profile",
  helperText = "search or create",
  className = "",
}: CustomerAutocompleteProps) {
  const uid = useId();
  const inputId = `${uid}-customer-search`;
  const listId = `${uid}-customer-list`;
  const statusId = `${uid}-status`;

  // ── Search state ──────────────────────────────────────────────────────────
  const [query, setQuery] = useState(() =>
    value ? `${value.name}${value.email ? ` (${value.email})` : ""}` : "",
  );
  const [results, setResults] = useState<Customer[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);

  // ── Selection state ───────────────────────────────────────────────────────
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    value ?? null,
  );

  // ── Create form state ─────────────────────────────────────────────────────
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createNotes, setCreateNotes] = useState("");
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [createApiError, setCreateApiError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [duplicates, setDuplicates] = useState<Customer[]>([]);

  // ── Edit form state ───────────────────────────────────────────────────────
  const [showEditForm, setShowEditForm] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [editApiError, setEditApiError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [editSuccess, setEditSuccess] = useState(false);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const firstCreateFieldRef = useRef<HTMLInputElement>(null);
  const firstEditFieldRef = useRef<HTMLInputElement>(null);

  // ── Sync controlled `value` prop ─────────────────────────────────────────
  const prevValueRef = useRef(value);
  if (value !== prevValueRef.current) {
    prevValueRef.current = value;
    const customer = value ?? null;
    setSelectedCustomer(customer);
    setQuery(
      customer
        ? `${customer.name}${customer.email ? ` (${customer.email})` : ""}`
        : "",
    );
    // Close any open panels when value is controlled externally
    setShowCreateForm(false);
    setShowEditForm(false);
  }

  // ── Close dropdown on outside click ───────────────────────────────────────
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

  // ── Debounced search ───────────────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const trimmed = query.trim();
      if (!trimmed) {
        setResults([]);
        setIsOpen(false);
        setIsSearching(false);
        return;
      }
      setIsSearching(true);
      try {
        const customers = await CustomerService.search(trimmed, 8);
        setResults(customers);
        setIsOpen(customers.length > 0 || trimmed.length > 0);
        setHighlightIndex(-1);
      } catch {
        setResults([]);
        setIsOpen(false);
      } finally {
        setIsSearching(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // ── Duplicate check (debounced on create name change) ────────────────────
  useEffect(() => {
    if (!createName.trim()) {
      setDuplicates([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const dups = await CustomerService.checkDuplicate(createName.trim());
        setDuplicates(dups);
      } catch {
        setDuplicates([]);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [createName]);

  // ── Focus first create field when form opens ───────────────────────────────
  useEffect(() => {
    if (showCreateForm) {
      // Small delay to allow render
      const t = setTimeout(() => firstCreateFieldRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [showCreateForm]);

  // ── Focus first edit field when edit form opens ───────────────────────────
  useEffect(() => {
    if (showEditForm) {
      const t = setTimeout(() => firstEditFieldRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [showEditForm]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const selectCustomer = useCallback(
    (customer: Customer) => {
      setSelectedCustomer(customer);
      setQuery(
        `${customer.name}${customer.email ? ` (${customer.email})` : ""}`,
      );
      setIsOpen(false);
      setShowCreateForm(false);
      setShowEditForm(false);
      onCustomerSelect(customer);
    },
    [onCustomerSelect],
  );

  const clearSelection = useCallback(() => {
    setSelectedCustomer(null);
    setQuery("");
    setResults([]);
    setIsOpen(false);
    setShowCreateForm(false);
    setShowEditForm(false);
    onCustomerSelect(null);
  }, [onCustomerSelect]);

  const openCreateForm = useCallback(() => {
    setIsOpen(false);
    setShowEditForm(false);
    setCreateName(query.trim());
    setCreateEmail("");
    setCreateNotes("");
    setCreateErrors({});
    setCreateApiError(null);
    setDuplicates([]);
    setShowCreateForm(true);
  }, [query]);

  const openEditForm = useCallback(() => {
    if (!selectedCustomer) return;
    setShowCreateForm(false);
    setEditName(selectedCustomer.name);
    setEditEmail(selectedCustomer.email ?? "");
    setEditNotes(selectedCustomer.notes ?? "");
    setEditErrors({});
    setEditApiError(null);
    setEditSuccess(false);
    setShowEditForm(true);
  }, [selectedCustomer]);

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

  // ── Create customer ────────────────────────────────────────────────────────
  const validateCreate = (): boolean => {
    const errors: Record<string, string> = {};
    if (!createName.trim()) errors.name = "Name is required.";
    if (createEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(createEmail.trim()))
      errors.email = "Enter a valid email address.";
    setCreateErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateCreate()) return;
    setIsCreating(true);
    setCreateApiError(null);
    try {
      const payload: CreateCustomerPayload = {
        name: createName.trim(),
        email: createEmail.trim() || undefined,
        notes: createNotes.trim() || undefined,
      };
      const created = await CustomerService.create(payload);
      setShowCreateForm(false);
      setCreateName("");
      setCreateEmail("");
      setCreateNotes("");
      setDuplicates([]);
      selectCustomer(created);
    } catch (err) {
      setCreateApiError(extractApiErrorMessage(err));
    } finally {
      setIsCreating(false);
    }
  };

  // ── Save edits ─────────────────────────────────────────────────────────────
  const validateEdit = (): boolean => {
    const errors: Record<string, string> = {};
    if (!editName.trim()) errors.name = "Name is required.";
    if (editEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editEmail.trim()))
      errors.email = "Enter a valid email address.";
    setEditErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || !validateEdit()) return;
    setIsSaving(true);
    setEditApiError(null);
    try {
      const updated = await CustomerService.update(selectedCustomer.id, {
        name: editName.trim(),
        email: editEmail.trim() || undefined,
        notes: editNotes.trim() || undefined,
      });
      setShowEditForm(false);
      setEditSuccess(true);
      setTimeout(() => setEditSuccess(false), 3000);
      selectCustomer(updated);
    } catch (err) {
      setEditApiError(extractApiErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Label */}
      <label
        htmlFor={inputId}
        className="block text-sm font-medium text-gray-700"
      >
        {label}{" "}
        <span className="font-normal text-gray-400">({helperText})</span>
      </label>

      {/* Search input */}
      <div className="mt-1 relative">
        <input
          id={inputId}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            // Deselect customer when user types again
            if (selectedCustomer) {
              setSelectedCustomer(null);
              setShowEditForm(false);
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
          aria-autocomplete="list"
          aria-controls={isOpen ? listId : undefined}
          aria-expanded={isOpen}
          aria-activedescendant={
            highlightIndex >= 0
              ? `${listId}-option-${highlightIndex}`
              : undefined
          }
          aria-describedby={statusId}
          role="combobox"
        />
        {/* Clear button */}
        {selectedCustomer && (
          <button
            type="button"
            onClick={clearSelection}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
            title="Clear selection"
            aria-label="Clear selected client"
          >
            <XIcon size={5} />
          </button>
        )}
        {/* Search spinner */}
        {isSearching && !selectedCustomer && (
          <span className="absolute inset-y-0 right-3 flex items-center pointer-events-none">
            <svg
              className="animate-spin h-4 w-4 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8H4z"
              />
            </svg>
          </span>
        )}
      </div>

      {/* Accessible live status (screen readers) */}
      <div id={statusId} className="sr-only" aria-live="polite" aria-atomic="true">
        {isSearching
          ? "Searching…"
          : results.length > 0
          ? `${results.length} client${results.length !== 1 ? "s" : ""} found`
          : query.trim()
          ? "No clients found"
          : ""}
      </div>

      {/* Dropdown results */}
      {isOpen && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Client search results"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white shadow-lg ring-1 ring-black/5 focus:outline-none"
        >
          {results.map((customer, idx) => (
            <li
              key={customer.id}
              id={`${listId}-option-${idx}`}
              role="option"
              aria-selected={idx === highlightIndex}
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
          {/* Create new option */}
          {query.trim() && (
            <li
              role="option"
              aria-selected={false}
              onClick={openCreateForm}
              className="cursor-pointer border-t border-gray-100 px-4 py-3 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors"
            >
              + Create new client &quot;{query.trim()}&quot;
            </li>
          )}
        </ul>
      )}

      {/* Show "create" button when no results */}
      {!isOpen && query.trim() && !selectedCustomer && !showCreateForm && (
        <button
          type="button"
          onClick={openCreateForm}
          className="mt-1 text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          + Create &quot;{query.trim()}&quot; as a new client
        </button>
      )}

      {/* ── Selected customer badge ─────────────────────────────────────────── */}
      {selectedCustomer && !showEditForm && (
        <div className="mt-2 flex items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">
          <UserIcon />
          <span className="font-medium flex-1">{selectedCustomer.name}</span>
          {selectedCustomer.email && (
            <span className="text-blue-600 text-xs truncate max-w-[160px]">
              {selectedCustomer.email}
            </span>
          )}
          <button
            type="button"
            onClick={openEditForm}
            className="ml-auto flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
            aria-label={`Edit ${selectedCustomer.name}`}
          >
            <PencilIcon />
            Edit
          </button>
          {editSuccess && (
            <span className="text-xs text-emerald-600 font-medium">✓ Saved</span>
          )}
        </div>
      )}

      {/* ── Inline create form ─────────────────────────────────────────────── */}
      {showCreateForm && (
        <div
          role="region"
          aria-label="Create new client"
          className="mt-3 rounded-lg border border-blue-200 bg-blue-50/50 p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-800">
              Create new client profile
            </p>
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Close create form"
            >
              <XIcon size={4} />
            </button>
          </div>

          {/* Duplicate warning */}
          {duplicates.length > 0 && (
            <div
              role="alert"
              className="mb-3 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800"
            >
              <span className="font-medium">Possible duplicate{duplicates.length > 1 ? "s" : ""}:</span>{" "}
              {duplicates.map((d, i) => (
                <span key={d.id}>
                  <button
                    type="button"
                    onClick={() => selectCustomer(d)}
                    className="underline hover:text-amber-900 font-medium"
                  >
                    {d.name}
                    {d.email ? ` (${d.email})` : ""}
                  </button>
                  {i < duplicates.length - 1 ? ", " : ""}
                </span>
              ))}.{" "}
              Select an existing one or continue to create new.
            </div>
          )}

          <form onSubmit={handleCreate} className="space-y-3" noValidate>
            <InlineField
              id={`${uid}-create-name`}
              label="Name"
              value={createName}
              onChange={setCreateName}
              placeholder="Client or company name"
              required
              maxLength={200}
              error={createErrors.name}
            />
            <InlineField
              id={`${uid}-create-email`}
              label="Email"
              type="email"
              value={createEmail}
              onChange={setCreateEmail}
              placeholder="client@example.com (optional)"
              error={createErrors.email}
            />
            <InlineField
              id={`${uid}-create-notes`}
              label="Notes"
              type="textarea"
              value={createNotes}
              onChange={setCreateNotes}
              placeholder="Any additional notes (optional)"
              maxLength={1000}
            />

            {createApiError && (
              <p className="text-sm text-red-600" role="alert">
                {createApiError}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={isCreating || !createName.trim()}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
              >
                {isCreating ? "Saving…" : "Save Client"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setCreateErrors({});
                  setCreateApiError(null);
                }}
                className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Inline edit form ───────────────────────────────────────────────── */}
      {showEditForm && selectedCustomer && (
        <div
          role="region"
          aria-label={`Edit ${selectedCustomer.name}`}
          className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-800">
              Edit client — {selectedCustomer.name}
            </p>
            <button
              type="button"
              onClick={() => setShowEditForm(false)}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Close edit form"
            >
              <XIcon size={4} />
            </button>
          </div>

          <form onSubmit={handleSaveEdit} className="space-y-3" noValidate>
            <InlineField
              id={`${uid}-edit-name`}
              label="Name"
              value={editName}
              onChange={setEditName}
              placeholder="Client or company name"
              required
              maxLength={200}
              error={editErrors.name}
            />
            <InlineField
              id={`${uid}-edit-email`}
              label="Email"
              type="email"
              value={editEmail}
              onChange={setEditEmail}
              placeholder="client@example.com (optional)"
              error={editErrors.email}
            />
            <InlineField
              id={`${uid}-edit-notes`}
              label="Notes"
              type="textarea"
              value={editNotes}
              onChange={setEditNotes}
              placeholder="Any additional notes (optional)"
              maxLength={1000}
            />

            {editApiError && (
              <p className="text-sm text-red-600" role="alert">
                {editApiError}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                type="submit"
                disabled={isSaving || !editName.trim()}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:bg-gray-400 transition-colors"
              >
                {isSaving ? "Saving…" : "Save Changes"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowEditForm(false);
                  setEditErrors({});
                  setEditApiError(null);
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
