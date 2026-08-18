"use client";

import { useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { extractApiErrorMessage } from "@/lib/api-client";
import { RequireAuth } from "@/components/require-auth";
import { Customer } from "@/lib/customer-service";
import { CustomerAutocomplete } from "@/components/CustomerAutocomplete";
import { useDraftAutosave } from "@/hooks/use-draft-autosave";
import { DraftList } from "@/components/DraftList";
import type { DraftInvoice } from "@/lib/types/draft.types";

const USDC_ISSUER =
  process.env.NEXT_PUBLIC_USDC_ISSUER ||
  "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

type Asset = "XLM" | "USDC";

/** Minimal shape we rely on from the invoice returned by convertToInvoice() */
interface ConvertedInvoiceResult {
  id: string;
}

function NewInvoiceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const draftIdFromUrl = searchParams.get("draftId") || undefined;

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
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [showDraftList, setShowDraftList] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const amountNum = parseFloat(amount);
  const isAmountValid = !isNaN(amountNum) && amountNum > 0;
  const effectiveName = selectedCustomer?.name || clientName;
  const effectiveEmail = selectedCustomer?.email || clientEmail;
  const isFormValid =
    isAmountValid && effectiveName.trim() && effectiveEmail.trim();

  /**
   * Draft autosave hook integration
   * All form changes are automatically saved as drafts
   */
  const {
    draft,
    isLoading: isLoadingDraft,
    isSaving,
    error: draftError,
    lastSavedAt,
    updateDraft,
    saveDraft,
    convertToInvoice,
    discardDraft,
    completionPercentage,
  } = useDraftAutosave(draftIdFromUrl, {
    autosaveDelay: 3000,
    minAutosaveInterval: 5000,
    onSave: () => {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    },
    onError: (err) => {
      console.error("Draft autosave error:", err);
    },
  });

  const [prevDraft, setPrevDraft] = useState<DraftInvoice | null>(null);
  if (draft && draft !== prevDraft) {
    setPrevDraft(draft);
    setClientName(draft.clientName || "");
    setClientEmail(draft.clientEmail || "");
    setDescription(draft.description || "");
    setAmount(draft.amount ? String(draft.amount) : "");
    setAsset((draft.assetCode as Asset) || "XLM");
    setDueDate(
      draft.dueDate ? new Date(draft.dueDate).toISOString().split("T")[0] : "",
    );

    // If draft has customer ID, load customer
    if (draft.customerId) {
      // CustomerService.getCustomer(draft.customerId).then(setSelectedCustomer);
    }
  }

  // Handle form field changes with autosave
  const handleFieldChange = useCallback(
    (field: string, value: string) => {
      // Update local state
      switch (field) {
        case "clientName":
          setClientName(value);
          break;
        case "clientEmail":
          setClientEmail(value);
          break;
        case "description":
          setDescription(value);
          break;
        case "amount":
          setAmount(value);
          break;
        case "dueDate":
          setDueDate(value);
          break;
      }

      // Build update payload
      const updates: Record<string, unknown> = {};
      switch (field) {
        case "clientName":
          updates.clientName = value || undefined;
          break;
        case "clientEmail":
          updates.clientEmail = value || undefined;
          break;
        case "description":
          updates.description = value || undefined;
          break;
        case "amount":
          updates.amount = parseFloat(value) || undefined;
          break;
        case "dueDate":
          updates.due_date = value || undefined;
          break;
      }

      // Trigger autosave
      updateDraft(updates);
    },
    [updateDraft],
  );

  // Handle asset change. USDC needs its issuer sent alongside the asset
  // code so the draft (and eventual invoice) records a resolvable asset —
  // XLM has no issuer.
  const handleAssetChange = (newAsset: Asset) => {
    setAsset(newAsset);
    updateDraft({
      asset_code: newAsset,
      asset_issuer: newAsset === "USDC" ? USDC_ISSUER : undefined,
    });
  };

  // Handle customer selection
  const handleCustomerSelect = (customer: Customer | null) => {
    setSelectedCustomer(customer);
    if (customer) {
      setClientName(customer.name);
      setClientEmail(customer.email || "");
      updateDraft({
        clientName: customer.name,
        clientEmail: customer.email || undefined,
        customer_id: customer.id,
      });
    } else {
      updateDraft({
        customer_id: undefined,
      });
    }
  };

  // Handle form submission (create invoice)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid || isSubmitting) return;

    setIsSubmitting(true);
    setSubmissionError(null);

    try {
      // First, save all pending changes
      await saveDraft();

      // Convert draft to invoice
      const invoice = await convertToInvoice();

      // Navigate to the invoice detail page
      router.push(`/invoices/${(invoice as ConvertedInvoiceResult).id}`);
    } catch (err) {
      setSubmissionError(extractApiErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Discard current draft
  const handleDiscard = async () => {
    if (!draft?.id) return;
    if (!confirm("Are you sure you want to discard this draft?")) return;

    try {
      await discardDraft();
      router.push("/invoices");
    } catch (err) {
      setSubmissionError(extractApiErrorMessage(err));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        {/* Header with draft status */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => router.push("/invoices")}
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              &larr; Back to Invoices
            </button>
            {draftIdFromUrl && (
              <button
                type="button"
                onClick={() => setShowDraftList(!showDraftList)}
                className="text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                {showDraftList ? "Hide Drafts" : "Show Drafts"}
              </button>
            )}
          </div>

          {/* Draft status indicator */}
          <div className="flex items-center gap-3">
            {isSaving && (
              <span className="text-xs text-gray-400 animate-pulse">
                Saving...
              </span>
            )}
            {saveSuccess && (
              <span className="text-xs text-emerald-600">✓ Saved</span>
            )}
            {lastSavedAt && !isSaving && !saveSuccess && (
              <span className="text-xs text-gray-400">
                Saved {new Date(lastSavedAt).toLocaleTimeString()}
              </span>
            )}
            {draft && (
              <span className="text-xs font-medium text-gray-500">
                {completionPercentage}% complete
              </span>
            )}
          </div>
        </div>

        {/* Draft List */}
        {showDraftList && (
          <div className="mb-6">
            <DraftList
              onDraftSelected={(id) => {
                router.push(`/invoices/new?draftId=${id}`);
                setShowDraftList(false);
              }}
            />
          </div>
        )}

        {/* Main Form */}
        <div className="overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="px-6 py-8 sm:px-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {draftIdFromUrl ? "Resume Draft" : "New Invoice"}
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                  {draftIdFromUrl
                    ? "Continue working on your saved draft"
                    : "Create a payment request for your client."}
                </p>
              </div>
              {draft && (
                <button
                  type="button"
                  onClick={handleDiscard}
                  className="text-sm text-red-600 hover:text-red-700 font-medium"
                >
                  Discard Draft
                </button>
              )}
            </div>

            {/* Progress bar for draft completion */}
            {draft && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>Draft progress</span>
                  <span>{completionPercentage}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all duration-300"
                    style={{ width: `${completionPercentage}%` }}
                  />
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-8 space-y-6" noValidate>
              {/* Customer Autocomplete */}
              <CustomerAutocomplete
                onCustomerSelect={handleCustomerSelect}
                value={selectedCustomer}
              />

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
                      onChange={(e) => handleFieldChange("clientName", e.target.value)}
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
                      onChange={(e) => handleFieldChange("clientEmail", e.target.value)}
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
                    onChange={(e) => handleFieldChange("amount", e.target.value)}
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
                      onClick={() => handleAssetChange("XLM")}
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
                      onClick={() => handleAssetChange("USDC")}
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
                  onChange={(e) => handleFieldChange("description", e.target.value)}
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
                  onChange={(e) => handleFieldChange("dueDate", e.target.value)}
                  className="mt-1 block w-full rounded-md border-0 py-3 px-4 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-blue-600"
                />
              </div>

              {draftError && (
                <div className="rounded-md bg-amber-50 p-4" role="alert">
                  <p className="text-sm font-medium text-amber-900">
                    ⚠️ Autosave temporarily unavailable: {draftError}
                  </p>
                </div>
              )}

              {submissionError && (
                <div className="rounded-md bg-red-50 p-4" role="alert">
                  <p className="text-sm font-medium text-red-900">{submissionError}</p>
                </div>
              )}

              <div className="flex gap-4">
                <button
                  type="submit"
                  disabled={!isFormValid || isSubmitting || isLoadingDraft}
                  className="flex-1 rounded-md bg-blue-600 px-4 py-4 text-center text-lg font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400 transition-colors"
                >
                  {isSubmitting
                    ? "Creating Invoice..."
                    : draftIdFromUrl
                      ? "Send Invoice"
                      : "Create Invoice"}
                </button>
              </div>
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

