"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { CustomerService, Customer, CreateCustomerPayload } from "@/lib/customer-service";
import {
  validateCustomerForm,
  hasErrors,
  getVisibleErrors,
  detectDuplicateCandidates,
  initialCustomerFormTouched,
  type CustomerFormErrors,
  type CustomerFormTouched,
} from "@/lib/validate-customer-form";
import { useToast } from "@/hooks/use-toast";
import { extractApiErrorMessage } from "@/lib/api-client";
import {
  X,
  UserPlus,
  Edit2,
  Loader2,
  User,
  Check,
  AlertTriangle,
  Phone,
  Mail,
  FileText,
  ChevronDown,
} from "lucide-react";

interface CustomerSelectProps {
  onCustomerSelect: (customer: Customer | null) => void;
  value?: Customer | null;
  label?: string;
  labelHint?: string;
  placeholder?: string;
  searchLimit?: number;
  searchDebounceMs?: number;
  size?: "sm" | "md";
  allowQuickCreate?: boolean;
  allowEdit?: boolean;
}

interface FormState {
  name: string;
  phone: string;
  email: string;
  notes: string;
}

const initialFormState: FormState = {
  name: "",
  phone: "",
  email: "",
  notes: "",
};

function formatCustomerDisplay(c: Customer | null | undefined): string {
  if (!c) return "";
  const parts: string[] = [c.name];
  if (c.email) parts.push(`(${c.email})`);
  else if (c.phone) parts.push(`(${c.phone})`);
  return parts.join(" ");
}

function CustomerFormBody({
  state,
  setState,
  touched,
  setTouched,
  errors,
  submitLabel,
  cancelLabel,
  onSubmit,
  onCancel,
  isSubmitting,
  globalError,
  duplicates,
  onPickDuplicate,
}: {
  state: FormState;
  setState: (s: FormState) => void;
  touched: CustomerFormTouched;
  setTouched: (t: CustomerFormTouched) => void;
  errors: CustomerFormErrors;
  submitLabel: string;
  cancelLabel: string;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  isSubmitting: boolean;
  globalError?: string | null;
  duplicates?: Array<{ id: string; name: string; phone: string | null; email: string | null; matchReason: string }>;
  onPickDuplicate?: (c: Customer) => void;
}) {
  const visibleErrors = getVisibleErrors(errors, touched);
  const isFormValid = !hasErrors(errors) && state.name.trim().length > 0;

  const onChange = (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setState({ ...state, [field]: e.target.value });
  };

  const onBlur = (field: keyof FormState) => () => {
    setTouched({ ...touched, [field]: true });
  };

  const markAllTouched = () => {
    setTouched({ name: true, phone: true, email: true, notes: true });
  };

  return (
    <form
      onSubmit={(e) => {
        markAllTouched();
        if (!isFormValid) {
          e.preventDefault();
          return;
        }
        onSubmit(e);
      }}
      className="space-y-4"
      noValidate
    >
      {duplicates && duplicates.length > 0 && (
        <div
          className="rounded-lg border border-amber-200 bg-amber-50 p-3"
          role="alert"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-amber-600" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-900">
                Possible duplicates found
              </p>
              <p className="mt-1 text-xs text-amber-800">
                {onPickDuplicate
                  ? "We found similar existing customers. You may select one instead of creating a new profile."
                  : "We found similar existing customers — review these before saving to avoid creating a duplicate record."}
              </p>
              <ul className="mt-2 space-y-1.5">
                {duplicates.map((d) => (
                  <li key={d.id}>
                    {onPickDuplicate ? (
                      <button
                        type="button"
                        onClick={() => {
                          const existing: Customer = {
                            id: d.id,
                            merchantId: "",
                            name: d.name,
                            phone: d.phone,
                            email: d.email,
                            notes: null,
                            createdAt: "",
                            updatedAt: "",
                          };
                          onPickDuplicate(existing);
                        }}
                        className="w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-left text-xs hover:bg-amber-100/40 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium text-amber-900">{d.name}</div>
                          <span className="rounded bg-amber-200/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                            {d.matchReason}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-amber-700">
                          {d.email ? (
                            <span className="inline-flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {d.email}
                            </span>
                          ) : null}
                          {d.phone ? (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {d.phone}
                            </span>
                          ) : null}
                        </div>
                      </button>
                    ) : (
                      <div
                        className="w-full rounded-md border border-amber-200 bg-white px-3 py-2 text-left text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium text-amber-900">{d.name}</div>
                          <span className="rounded bg-amber-200/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                            {d.matchReason}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-amber-700">
                          {d.email ? (
                            <span className="inline-flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              {d.email}
                            </span>
                          ) : null}
                          {d.phone ? (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {d.phone}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div>
        <label
          htmlFor="cs-name"
          className="block text-sm font-medium text-gray-700"
        >
          Client Name <span className="text-rose-500">*</span>
        </label>
        <input
          id="cs-name"
          type="text"
          value={state.name}
          onChange={onChange("name")}
          onBlur={onBlur("name")}
          placeholder="e.g. John Doe, Acme Corp"
          required
          autoFocus
          aria-invalid={Boolean(visibleErrors.name)}
          aria-describedby={visibleErrors.name ? "cs-name-error" : undefined}
          className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 aria-invalid:border-rose-400 aria-invalid:ring-rose-200"
        />
        {visibleErrors.name ? (
          <p id="cs-name-error" className="mt-1 text-xs font-medium text-rose-600" role="alert">
            {visibleErrors.name}
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label
            htmlFor="cs-phone"
            className="block text-sm font-medium text-gray-700"
          >
            Phone
            <span className="font-normal text-gray-400 ml-1">(optional)</span>
          </label>
          <div className="relative mt-1">
            <Phone className="pointer-events-none absolute inset-y-0 left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              id="cs-phone"
              type="tel"
              value={state.phone}
              onChange={onChange("phone")}
              onBlur={onBlur("phone")}
              placeholder="+1 (555) 123-4567"
              aria-invalid={Boolean(visibleErrors.phone)}
              aria-describedby={visibleErrors.phone ? "cs-phone-error" : undefined}
              className="block w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3.5 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 aria-invalid:border-rose-400 aria-invalid:ring-rose-200"
            />
          </div>
          {visibleErrors.phone ? (
            <p id="cs-phone-error" className="mt-1 text-xs font-medium text-rose-600" role="alert">
              {visibleErrors.phone}
            </p>
          ) : null}
        </div>

        <div>
          <label
            htmlFor="cs-email"
            className="block text-sm font-medium text-gray-700"
          >
            Email
            <span className="font-normal text-gray-400 ml-1">(optional)</span>
          </label>
          <div className="relative mt-1">
            <Mail className="pointer-events-none absolute inset-y-0 left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              id="cs-email"
              type="email"
              value={state.email}
              onChange={onChange("email")}
              onBlur={onBlur("email")}
              placeholder="client@example.com"
              aria-invalid={Boolean(visibleErrors.email)}
              aria-describedby={visibleErrors.email ? "cs-email-error" : undefined}
              className="block w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3.5 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 aria-invalid:border-rose-400 aria-invalid:ring-rose-200"
            />
          </div>
          {visibleErrors.email ? (
            <p id="cs-email-error" className="mt-1 text-xs font-medium text-rose-600" role="alert">
              {visibleErrors.email}
            </p>
          ) : null}
        </div>
      </div>

      <div>
        <label
          htmlFor="cs-notes"
          className="block text-sm font-medium text-gray-700"
        >
          Internal Notes
          <span className="font-normal text-gray-400 ml-1">(optional)</span>
        </label>
        <div className="relative mt-1">
          <FileText className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-gray-400" />
          <textarea
            id="cs-notes"
            rows={2}
            value={state.notes}
            onChange={onChange("notes")}
            onBlur={onBlur("notes")}
            placeholder="Payment preferences, billing terms, etc."
            aria-invalid={Boolean(visibleErrors.notes)}
            aria-describedby={visibleErrors.notes ? "cs-notes-error" : undefined}
            className="block w-full resize-none rounded-lg border border-gray-300 bg-white pl-9 pr-3.5 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 aria-invalid:border-rose-400 aria-invalid:ring-rose-200"
          />
        </div>
        {visibleErrors.notes ? (
          <p id="cs-notes-error" className="mt-1 text-xs font-medium text-rose-600" role="alert">
            {visibleErrors.notes}
          </p>
        ) : null}
      </div>

      {globalError ? (
        <p
          className="rounded-md bg-rose-50 border border-rose-200 p-2 text-xs font-medium text-rose-700"
          role="alert"
        >
          {globalError}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-60 transition-colors"
        >
          {cancelLabel}
        </button>
        <button
          type="submit"
          disabled={isSubmitting || !isFormValid}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400 transition-colors"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Saving...</span>
            </>
          ) : (
            <>
              <Check className="h-4 w-4" />
              <span>{submitLabel}</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div
        className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-md transition-colors"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function CustomerSelect({
  onCustomerSelect,
  value,
  label = "Client Profile",
  labelHint = "search or create",
  placeholder = "Type to search saved clients...",
  searchLimit = 8,
  searchDebounceMs = 350,
  size = "md",
  allowQuickCreate = true,
  allowEdit = true,
}: CustomerSelectProps) {
  const toast = useToast();

  const [query, setQuery] = useState(() => formatCustomerDisplay(value));
  const [results, setResults] = useState<Customer[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    value ?? null,
  );
  const [hasSearchedOnce, setHasSearchedOnce] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const duplicateSearchRef = useRef<{ cancel: () => void } | null>(null);

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formState, setFormState] = useState<FormState>(initialFormState);
  const [touched, setTouched] = useState<CustomerFormTouched>(initialCustomerFormTouched);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<
    Array<{ id: string; name: string; phone: string | null; email: string | null; matchReason: string }>
  >([]);

  const [prevValue, setPrevValue] = useState<Customer | null | undefined>(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setSelectedCustomer(value ?? null);
    setQuery(formatCustomerDisplay(value));
  }

  const validationErrors = useMemo(
    () =>
      validateCustomerForm({
        name: formState.name,
        phone: formState.phone || undefined,
        email: formState.email || undefined,
        notes: formState.notes || undefined,
      }),
    [formState],
  );

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
        setIsOpen(true);
        setHighlightIndex(-1);
        setHasSearchedOnce(true);
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, searchDebounceMs);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, searchLimit, searchDebounceMs]);

  useEffect(() => {
    if (!isCreateModalOpen && !isEditModalOpen) return;

    const draftName = formState.name.trim();
    const draftPhone = formState.phone.trim();
    const draftEmail = formState.email.trim();

    if (draftName.length < 2 && !draftPhone && !draftEmail) {
      setDuplicates([]);
      return;
    }

    if (duplicateSearchRef.current) {
      duplicateSearchRef.current.cancel();
    }
    let cancelled = false;
    duplicateSearchRef.current = { cancel: () => (cancelled = true) };

    const searchQ = draftName || draftPhone || draftEmail;
    CustomerService.search(searchQ, 10)
      .then((list) => {
        if (cancelled) return;
        const found = detectDuplicateCandidates(list, {
          name: formState.name,
          phone: formState.phone,
          email: formState.email,
        });
        if (isEditModalOpen && selectedCustomer) {
          setDuplicates(found.filter((d) => d.id !== selectedCustomer.id));
        } else {
          setDuplicates(found);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setDuplicates([]);
      });

    return () => {
      cancelled = true;
    };
  }, [formState.name, formState.phone, formState.email, isCreateModalOpen, isEditModalOpen, selectedCustomer]);

  const selectCustomer = useCallback(
    (customer: Customer) => {
      setSelectedCustomer(customer);
      setQuery(formatCustomerDisplay(customer));
      setIsOpen(false);
      setIsCreateModalOpen(false);
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

  const openCreateModal = (prefillName?: string) => {
    setFormState({
      ...initialFormState,
      name: prefillName?.trim() ?? query.trim(),
    });
    setTouched(initialCustomerFormTouched);
    setGlobalError(null);
    setDuplicates([]);
    setIsSubmitting(false);
    setIsOpen(false);
    setIsCreateModalOpen(true);
  };

  const openEditModal = () => {
    if (!selectedCustomer) return;
    setFormState({
      name: selectedCustomer.name,
      phone: selectedCustomer.phone ?? "",
      email: selectedCustomer.email ?? "",
      notes: selectedCustomer.notes ?? "",
    });
    setTouched(initialCustomerFormTouched);
    setGlobalError(null);
    setDuplicates([]);
    setIsSubmitting(false);
    setIsEditModalOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const payload: CreateCustomerPayload = {
      name: formState.name.trim(),
    };
    if (formState.phone.trim()) payload.phone = formState.phone.trim();
    if (formState.email.trim()) payload.email = formState.email.trim();
    if (formState.notes.trim()) payload.notes = formState.notes.trim();

    setIsSubmitting(true);
    setGlobalError(null);
    try {
      const created = await CustomerService.create(payload);
      selectCustomer(created);
      toast.success("Customer created", `${created.name} has been added and selected.`);
    } catch (err) {
      const msg = extractApiErrorMessage(err);
      setGlobalError(msg);
      toast.error("Failed to create customer", msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || !selectedCustomer) return;

    const payload: Partial<CreateCustomerPayload> = {
      name: formState.name.trim(),
    };
    payload.phone = formState.phone.trim() || undefined;
    payload.email = formState.email.trim() || undefined;
    payload.notes = formState.notes.trim() || undefined;

    setIsSubmitting(true);
    setGlobalError(null);
    try {
      const updated = await CustomerService.update(selectedCustomer.id, payload);
      setSelectedCustomer(updated);
      setQuery(formatCustomerDisplay(updated));
      onCustomerSelect(updated);
      setIsEditModalOpen(false);
      toast.success("Customer updated", `${updated.name}'s profile has been saved.`);
    } catch (err) {
      const msg = extractApiErrorMessage(err);
      setGlobalError(msg);
      toast.error("Failed to update customer", msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isCreateModalOpen || isEditModalOpen) return;

    const showCreateOption = allowQuickCreate && query.trim().length > 0 && hasSearchedOnce;
    const effectiveLength = results.length + (showCreateOption ? 1 : 0);

    if (!isOpen || effectiveLength === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, effectiveLength - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (highlightIndex >= 0 && highlightIndex < results.length) {
        e.preventDefault();
        selectCustomer(results[highlightIndex]);
      } else if (highlightIndex === results.length && showCreateOption) {
        e.preventDefault();
        openCreateModal();
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const py = size === "sm" ? "py-2" : "py-3";
  const pxInput = size === "sm" ? "px-3" : "px-4";
  const resultPy = size === "sm" ? "py-2" : "py-3";
  const showCreateOption =
    allowQuickCreate && query.trim().length > 0 && (results.length === 0 || hasSearchedOnce);

  return (
    <div ref={containerRef} className="relative">
      <label
        htmlFor="cs-search"
        className="block text-sm font-medium text-gray-700"
      >
        {label}{" "}
        {labelHint ? (
          <span className="font-normal text-gray-400">({labelHint})</span>
        ) : null}
      </label>
      <div className="mt-1 relative">
        <div className="relative">
          <User className="pointer-events-none absolute inset-y-0 left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            id="cs-search"
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
              if (results.length > 0 || (query.trim() && hasSearchedOnce)) {
                setIsOpen(true);
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className={`block w-full rounded-md border-0 ${py} ${pxInput} pl-10 pr-10 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600`}
            autoComplete="off"
            aria-expanded={isOpen}
            aria-haspopup="listbox"
            role="combobox"
          />
          <div className="absolute inset-y-0 right-0 flex items-center pr-2">
            {isSearching ? (
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            ) : selectedCustomer ? (
              <button
                type="button"
                onClick={clearSelection}
                className="rounded p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                title="Clear selection"
                aria-label="Clear customer selection"
              >
                <X className="h-4 w-4" />
              </button>
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" aria-hidden="true" />
            )}
          </div>
        </div>
      </div>

      {isOpen && (results.length > 0 || showCreateOption) ? (
        <ul
          className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md bg-white shadow-lg ring-1 ring-black/5 focus:outline-none"
          role="listbox"
        >
          {results.map((customer, idx) => (
            <li
              key={customer.id}
              role="option"
              aria-selected={idx === highlightIndex}
              onClick={() => selectCustomer(customer)}
              className={`cursor-pointer px-4 ${resultPy} text-sm transition-colors ${
                idx === highlightIndex
                  ? "bg-blue-50 text-blue-900"
                  : "text-gray-900 hover:bg-gray-50"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{customer.name}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
                    {customer.email ? (
                      <span className="inline-flex items-center gap-1 truncate max-w-full">
                        <Mail className="h-3 w-3 flex-none" />
                        <span className="truncate">{customer.email}</span>
                      </span>
                    ) : null}
                    {customer.phone ? (
                      <span className="inline-flex items-center gap-1 truncate max-w-full">
                        <Phone className="h-3 w-3 flex-none" />
                        <span className="truncate">{customer.phone}</span>
                      </span>
                    ) : null}
                  </div>
                  {customer.notes ? (
                    <div className="text-xs text-gray-400 truncate mt-0.5">
                      {customer.notes}
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
          {showCreateOption ? (
            <li
              role="option"
              aria-selected={highlightIndex === results.length}
              onClick={() => openCreateModal()}
              className={`cursor-pointer border-t border-gray-100 px-4 ${resultPy} text-sm font-medium transition-colors ${
                highlightIndex === results.length
                  ? "bg-blue-50 text-blue-700"
                  : "text-blue-600 hover:bg-blue-50"
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <UserPlus className="h-4 w-4" />
                Create new client
                {query.trim() ? (
                  <span className="text-blue-400">
                    &quot;{query.trim().length > 40 ? query.trim().slice(0, 40) + "…" : query.trim()}&quot;
                  </span>
                ) : null}
              </span>
            </li>
          ) : null}
        </ul>
      ) : null}

      {selectedCustomer ? (
        <div className="mt-2 flex items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-800">
          <User className="h-4 w-4 flex-none text-blue-500" />
          <div className="min-w-0 flex-1">
            <span className="font-medium truncate block">{selectedCustomer.name}</span>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-blue-600/80">
              {selectedCustomer.email ? (
                <span className="inline-flex items-center gap-1 truncate max-w-full">
                  <Mail className="h-3 w-3 flex-none" />
                  <span className="truncate">{selectedCustomer.email}</span>
                </span>
              ) : null}
              {selectedCustomer.phone ? (
                <span className="inline-flex items-center gap-1 truncate max-w-full">
                  <Phone className="h-3 w-3 flex-none" />
                  <span className="truncate">{selectedCustomer.phone}</span>
                </span>
              ) : null}
              {!selectedCustomer.email && !selectedCustomer.phone ? (
                <span className="text-blue-500/70 italic">No contact info</span>
              ) : null}
            </div>
          </div>
          {allowEdit ? (
            <button
              type="button"
              onClick={openEditModal}
              className="flex-none rounded p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-100 transition-colors"
              title={`Edit ${selectedCustomer.name}`}
              aria-label="Edit selected customer"
            >
              <Edit2 className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      ) : null}

      {isCreateModalOpen ? (
        <Modal title="Create New Client" onClose={() => setIsCreateModalOpen(false)}>
          <CustomerFormBody
            state={formState}
            setState={setFormState}
            touched={touched}
            setTouched={setTouched}
            errors={validationErrors}
            submitLabel="Save Client"
            cancelLabel="Cancel"
            onSubmit={handleCreateSubmit}
            onCancel={() => setIsCreateModalOpen(false)}
            isSubmitting={isSubmitting}
            globalError={globalError}
            duplicates={duplicates}
            onPickDuplicate={(c) => {
              CustomerService.get(c.id)
                .then((full) => selectCustomer(full))
                .catch(() => selectCustomer(c));
            }}
          />
        </Modal>
      ) : null}

      {isEditModalOpen && selectedCustomer ? (
        <Modal
          title="Edit Client Profile"
          onClose={() => setIsEditModalOpen(false)}
        >
          <CustomerFormBody
            state={formState}
            setState={setFormState}
            touched={touched}
            setTouched={setTouched}
            errors={validationErrors}
            submitLabel="Save Changes"
            cancelLabel="Cancel"
            onSubmit={handleEditSubmit}
            onCancel={() => setIsEditModalOpen(false)}
            isSubmitting={isSubmitting}
            globalError={globalError}
            duplicates={duplicates}
          />
        </Modal>
      ) : null}
    </div>
  );
}
