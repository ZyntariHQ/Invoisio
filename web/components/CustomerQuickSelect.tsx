"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  Pencil,
  X,
  UserPlus,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { CustomerService, Customer } from "@/lib/customer-service";
import { extractApiErrorMessage } from "@/lib/api-client";

type Mode = "idle" | "create" | "edit";

interface ValidationErrors {
  name?: string;
  email?: string;
  notes?: string;
  form?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NOTES_MAX = 1000;
const NAME_MAX = 200;

function validate(
  name: string,
  email: string,
  notes: string,
): ValidationErrors {
  const errors: ValidationErrors = {};
  if (!name.trim()) {
    errors.name = "Customer name is required";
  } else if (name.length > NAME_MAX) {
    errors.name = `Customer name must be ${NAME_MAX} characters or less`;
  }
  if (email.trim() && !EMAIL_RE.test(email.trim())) {
    errors.email = "Invalid email address";
  }
  if (notes.length > NOTES_MAX) {
    errors.notes = `Notes must be ${NOTES_MAX} characters or less`;
  }
  return errors;
}

export interface CustomerQuickSelectProps {
  value?: Customer | null;
  onCustomerSelect: (customer: Customer | null) => void;
  label?: string;
  helperText?: string;
  searchPlaceholder?: string;
  searchLimit?: number;
}

export function CustomerQuickSelect({
  value,
  onCustomerSelect,
  label = "Client Profile",
  helperText = "search or create",
  searchPlaceholder = "Type to search saved clients...",
  searchLimit = 8,
}: CustomerQuickSelectProps) {
  const [query, setQuery] = useState(() =>
    value ? `${value.name}${value.email ? ` (${value.email})` : ""}` : "",
  );
  const [results, setResults] = useState<Customer[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    value || null,
  );
  const [isSearching, setIsSearching] = useState(false);

  const [mode, setMode] = useState<Mode>("idle");

  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formErrors, setFormErrors] = useState<ValidationErrors>({});
  const [formSubmitError, setFormSubmitError] = useState<string | null>(null);
  const [duplicateMatch, setDuplicateMatch] = useState<Customer | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (value) {
      setQuery(`${value.name}${value.email ? ` (${value.email})` : ""}`);
      setSelectedCustomer(value);
    }
  }

  const showSuccess = useCallback((msg: string) => {
    setSuccessMessage(msg);
    if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
    successTimeoutRef.current = setTimeout(() => setSuccessMessage(null), 2000);
  }, []);

  const closeForm = useCallback(() => {
    setMode("idle");
    setFormErrors({});
    setFormSubmitError(null);
    setDuplicateMatch(null);
  }, []);

  const resetFormFields = useCallback(() => {
    setFormName("");
    setFormEmail("");
    setFormNotes("");
  }, []);

  const openCreateForm = useCallback((prefillName = "") => {
    setFormName(prefillName);
    setFormEmail("");
    setFormNotes("");
    setFormErrors({});
    setFormSubmitError(null);
    setDuplicateMatch(null);
    setMode("create");
    setIsOpen(false);
    setTimeout(() => nameInputRef.current?.focus(), 0);
  }, []);

  const openEditForm = useCallback((customer: Customer) => {
    setFormName(customer.name);
    setFormEmail(customer.email || "");
    setFormNotes(customer.notes || "");
    setFormErrors({});
    setFormSubmitError(null);
    setDuplicateMatch(null);
    setMode("edit");
    setTimeout(() => nameInputRef.current?.focus(), 0);
  }, []);

  const selectCustomer = useCallback(
    (customer: Customer) => {
      setSelectedCustomer(customer);
      setQuery(
        `${customer.name}${customer.email ? ` (${customer.email})` : ""}`,
      );
      setIsOpen(false);
      closeForm();
      onCustomerSelect(customer);
    },
    [onCustomerSelect, closeForm],
  );

  const clearSelection = useCallback(() => {
    setSelectedCustomer(null);
    setQuery("");
    setResults([]);
    setIsOpen(false);
    closeForm();
    onCustomerSelect(null);
  }, [onCustomerSelect, closeForm]);

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

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (mode !== "idle") {
          e.preventDefault();
          closeForm();
        } else if (isOpen) {
          e.preventDefault();
          setIsOpen(false);
        }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [mode, isOpen, closeForm]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!query.trim()) {
        setResults([]);
        setIsOpen(false);
        setIsSearching(false);
        return;
      }
      setIsSearching(true);
      try {
        const customers = await CustomerService.search(query, searchLimit);
        setResults(customers);
        setIsOpen(customers.length > 0);
        setHighlightIndex(-1);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, searchLimit]);

  const possibleDuplicateHint = useMemo(() => {
    if (mode !== "create") return null;
    
    // Check for email duplicates
    if (formEmail.trim()) {
      const needle = formEmail.trim().toLowerCase();
      const emailMatch = results.find(
        (c) => c.email && c.email.toLowerCase() === needle,
      );
      if (emailMatch) return emailMatch;
    }
    
    // Check for name similarity (case-insensitive partial match)
    if (formName.trim()) {
      const needle = formName.trim().toLowerCase();
      const nameMatch = results.find(
        (c) => c.name.toLowerCase().includes(needle) || needle.includes(c.name.toLowerCase())
      );
      if (nameMatch) return nameMatch;
    }
    
    return null;
  }, [mode, formEmail, formName, results]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || isSearching) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, results.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (highlightIndex >= 0 && highlightIndex < results.length) {
        e.preventDefault();
        selectCustomer(results[highlightIndex]);
      } else if (highlightIndex === results.length && results.length > 0) {
        e.preventDefault();
        openCreateForm(query);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const errors = validate(formName, formEmail, formNotes);
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    setFormSubmitError(null);
    setDuplicateMatch(null);

    try {
      const payload = {
        name: formName.trim(),
        email: formEmail.trim() || undefined,
        notes: formNotes.trim() || undefined,
      };

      if (mode === "create") {
        const created = await CustomerService.create(payload);
        selectCustomer(created);
        resetFormFields();
        showSuccess("Client saved ✓");
      } else if (mode === "edit" && selectedCustomer) {
        const updated = await CustomerService.update(
          selectedCustomer.id,
          payload,
        );
        selectCustomer(updated);
        resetFormFields();
        showSuccess("Client updated ✓");
      }
    } catch (err) {
      const msg = extractApiErrorMessage(err) || "Failed to save client";
      const isConflict =
        typeof err === "object" &&
        err !== null &&
        "response" in err &&
        (err as { response?: { status?: number } }).response?.status ===
          409;

      setFormSubmitError(msg);

      if (isConflict && formEmail.trim()) {
        try {
          const matches = await CustomerService.search(formEmail.trim(), 5);
          const exact = matches.find(
            (c) =>
              c.email &&
              c.email.toLowerCase() === formEmail.trim().toLowerCase(),
          );
          if (exact) {
            setDuplicateMatch(exact);
          } else if (matches.length > 0) {
            setDuplicateMatch(matches[0]);
          }
        } catch {
          // ignore; error banner is enough
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const formHasErrors = Object.keys(formErrors).length > 0 || !!formSubmitError;

  return (
    <div ref={containerRef} className="relative">
      <label
        htmlFor="customer-quick-select-search"
        className="block text-sm font-medium text-gray-700"
      >
        {label}{" "}
        <span className="font-normal text-gray-400">({helperText})</span>
      </label>
      <div className="mt-1 relative">
        <input
          id="customer-quick-select-search"
          type="text"
          role="combobox"
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
          placeholder={searchPlaceholder}
          className="block w-full rounded-md border-0 py-3 px-4 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls="customer-quick-select-listbox"
          aria-activedescendant={
            isOpen && highlightIndex >= 0 && highlightIndex < results.length
              ? `customer-option-${highlightIndex}`
              : undefined
          }
        />
        {selectedCustomer && (
          <button
            type="button"
            onClick={clearSelection}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
            title="Clear selection"
            aria-label="Clear selected customer"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {isOpen && (results.length > 0 || query.trim() || isSearching) && (
        <ul
          id="customer-quick-select-listbox"
          role="listbox"
          className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white shadow-lg ring-1 ring-black/5 focus:outline-none"
        >
          {isSearching && (
            <li className="px-4 py-3 text-sm text-gray-500 flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Searching...
            </li>
          )}
          {!isSearching && results.map((customer, idx) => (
            <li
              key={customer.id}
              id={`customer-option-${idx}`}
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
          {!isSearching && (
            <li
              role="option"
              aria-selected={highlightIndex === results.length}
              onClick={() => openCreateForm(query)}
              className={`cursor-pointer border-t border-gray-100 px-4 py-3 text-sm font-medium transition-colors flex items-center gap-1.5 ${
                highlightIndex === results.length
                  ? "bg-blue-50 text-blue-900"
                  : "text-blue-600 hover:bg-blue-50"
              }`}
            >
              <UserPlus className="h-4 w-4" />
              + Create new client
              {query.trim() ? ` "${query.trim().slice(0, 30)}${query.trim().length > 30 ? "…" : ""}"` : ""}
            </li>
          )}
        </ul>
      )}

      {successMessage && (
        <div
          role="status"
          aria-live="polite"
          className="mt-2 flex items-center gap-1.5 rounded-md bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800"
        >
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          {successMessage}
        </div>
      )}

      {selectedCustomer && mode === "idle" && (
        <div className="mt-2 flex items-center justify-between gap-2 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">
          <div className="flex items-center gap-2 min-w-0">
            <svg
              className="h-4 w-4 text-blue-500 flex-shrink-0"
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
            <span className="font-medium truncate">{selectedCustomer.name}</span>
            {selectedCustomer.email && (
              <span className="text-blue-600 truncate">
                ({selectedCustomer.email})
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => openEditForm(selectedCustomer)}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors flex-shrink-0"
            aria-label="Edit selected customer"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
        </div>
      )}

      {mode === "create" && !selectedCustomer && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="Create new client"
          aria-busy={isSubmitting}
          className="mt-3 rounded-lg border border-blue-200 bg-blue-50/50 p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-700">
              Create new client profile
            </p>
            <button
              type="button"
              onClick={closeForm}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Close create form"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <CustomerFormBody
            mode="create"
            formName={formName}
            formEmail={formEmail}
            formNotes={formNotes}
            formErrors={formErrors}
            formSubmitError={formSubmitError}
            duplicateMatch={duplicateMatch}
            possibleDuplicateHint={possibleDuplicateHint}
            isSubmitting={isSubmitting}
            formHasErrors={formHasErrors}
            nameInputRef={nameInputRef}
            setFormName={setFormName}
            setFormEmail={setFormEmail}
            setFormNotes={setFormNotes}
            onSubmit={handleSubmit}
            onCancel={closeForm}
            onUseDuplicate={(c) => selectCustomer(c)}
          />
        </div>
      )}

      {mode === "edit" && selectedCustomer && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label={`Edit client ${selectedCustomer.name}`}
          aria-busy={isSubmitting}
          className="mt-3 rounded-lg border border-amber-200 bg-amber-50/50 p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-gray-700">
              Edit client profile
            </p>
            <button
              type="button"
              onClick={closeForm}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Close edit form"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <CustomerFormBody
            mode="edit"
            formName={formName}
            formEmail={formEmail}
            formNotes={formNotes}
            formErrors={formErrors}
            formSubmitError={formSubmitError}
            duplicateMatch={duplicateMatch}
            possibleDuplicateHint={null}
            isSubmitting={isSubmitting}
            formHasErrors={formHasErrors}
            nameInputRef={nameInputRef}
            setFormName={setFormName}
            setFormEmail={setFormEmail}
            setFormNotes={setFormNotes}
            onSubmit={handleSubmit}
            onCancel={closeForm}
            onUseDuplicate={(c) => selectCustomer(c)}
          />
        </div>
      )}
    </div>
  );
}

interface FormBodyProps {
  mode: "create" | "edit";
  formName: string;
  formEmail: string;
  formNotes: string;
  formErrors: ValidationErrors;
  formSubmitError: string | null;
  duplicateMatch: Customer | null;
  possibleDuplicateHint: Customer | null;
  isSubmitting: boolean;
  formHasErrors: boolean;
  nameInputRef: React.MutableRefObject<HTMLInputElement | null>;
  setFormName: (v: string) => void;
  setFormEmail: (v: string) => void;
  setFormNotes: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  onUseDuplicate: (c: Customer) => void;
}

function CustomerFormBody(props: FormBodyProps) {
  const {
    mode,
    formName,
    formEmail,
    formNotes,
    formErrors,
    formSubmitError,
    duplicateMatch,
    possibleDuplicateHint,
    isSubmitting,
    formHasErrors,
    nameInputRef,
    setFormName,
    setFormEmail,
    setFormNotes,
    onSubmit,
    onCancel,
    onUseDuplicate,
  } = props;

  const errorMsgFor = (field: keyof ValidationErrors): string | undefined =>
    formErrors[field];

  const submitLabel =
    mode === "create"
      ? isSubmitting
        ? "Creating..."
        : "Save Client"
      : isSubmitting
        ? "Saving..."
        : "Save Changes";

  return (
    <form onSubmit={onSubmit} className="space-y-3" noValidate>
      <div>
        <input
          ref={nameInputRef}
          type="text"
          value={formName}
          onChange={(e) => setFormName(e.target.value)}
          placeholder="Client name *"
          maxLength={NAME_MAX}
          required
          aria-invalid={!!errorMsgFor("name")}
          aria-describedby={
            errorMsgFor("name") ? "cqs-name-error" : undefined
          }
          className={`block w-full rounded-md border px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-1 ${
            errorMsgFor("name")
              ? "border-red-300 focus:border-red-500 focus:ring-red-500"
              : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
          }`}
        />
        {errorMsgFor("name") && (
          <p
            id="cqs-name-error"
            role="alert"
            className="mt-1 text-xs text-red-600"
          >
            {errorMsgFor("name")}
          </p>
        )}
      </div>

      <div>
        <input
          type="email"
          value={formEmail}
          onChange={(e) => setFormEmail(e.target.value)}
          placeholder="Email (optional)"
          aria-invalid={!!errorMsgFor("email")}
          aria-describedby={
            errorMsgFor("email") ? "cqs-email-error" : undefined
          }
          className={`block w-full rounded-md border px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-1 ${
            errorMsgFor("email")
              ? "border-red-300 focus:border-red-500 focus:ring-red-500"
              : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
          }`}
        />
        {errorMsgFor("email") && (
          <p
            id="cqs-email-error"
            role="alert"
            className="mt-1 text-xs text-red-600"
          >
            {errorMsgFor("email")}
          </p>
        )}
      </div>

      <div>
        <textarea
          value={formNotes}
          onChange={(e) => setFormNotes(e.target.value)}
          placeholder="Notes (optional)"
          rows={2}
          maxLength={NOTES_MAX}
          aria-invalid={!!errorMsgFor("notes")}
          aria-describedby={
            errorMsgFor("notes") ? "cqs-notes-error" : undefined
          }
          className={`block w-full rounded-md border px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-1 ${
            errorMsgFor("notes")
              ? "border-red-300 focus:border-red-500 focus:ring-red-500"
              : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
          }`}
        />
        {errorMsgFor("notes") && (
          <p
            id="cqs-notes-error"
            role="alert"
            className="mt-1 text-xs text-red-600"
          >
            {errorMsgFor("notes")}
          </p>
        )}
        <p className="mt-1 text-xs text-gray-400 text-right">
          {formNotes.length}/{NOTES_MAX}
        </p>
      </div>

      {possibleDuplicateHint && !duplicateMatch && (
        <div
          role="note"
          className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm"
        >
          <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="font-medium text-amber-900">
              Similar existing client found
            </p>
            <button
              type="button"
              onClick={() => onUseDuplicate(possibleDuplicateHint)}
              className="mt-0.5 inline-flex items-center gap-1 text-xs font-semibold text-amber-900 underline hover:no-underline"
            >
              Use existing: {possibleDuplicateHint.name}
              {possibleDuplicateHint.email
                ? ` (${possibleDuplicateHint.email})`
                : ""}
            </button>
          </div>
        </div>
      )}

      {duplicateMatch && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm"
        >
          <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="font-medium text-red-900">
              A customer with this email already exists
            </p>
            <button
              type="button"
              onClick={() => onUseDuplicate(duplicateMatch)}
              className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-red-900 underline hover:no-underline"
            >
              Use existing client: {duplicateMatch.name}
              {duplicateMatch.email ? ` (${duplicateMatch.email})` : ""}
            </button>
          </div>
        </div>
      )}

      {formSubmitError && !duplicateMatch && (
        <p
          role="alert"
          className="flex items-center gap-1.5 text-sm font-medium text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2"
        >
          <AlertCircle className="h-4 w-4" />
          {formSubmitError}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={isSubmitting || !formName.trim() || formHasErrors}
          aria-disabled={
            isSubmitting || !formName.trim() || formHasErrors
          }
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-60 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
