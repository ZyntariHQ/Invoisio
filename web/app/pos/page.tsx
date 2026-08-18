"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient, extractApiErrorMessage } from "@/lib/api-client";
import { generatePaymentUri } from "@/lib/sep0007";
import { RequireAuth } from "@/components/require-auth";
import { MerchantService } from "@/lib/merchant-service";
import { checklistQueryKey } from "@/hooks/use-merchant-checklist";
import { CustomerService, Customer } from "@/lib/customer-service";

// Stellar mainnet USDC issuer — override via NEXT_PUBLIC_USDC_ISSUER for testnet
const USDC_ISSUER =
  process.env.NEXT_PUBLIC_USDC_ISSUER ||
  "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

const RECENT_SALES_KEY = "pos_recent_sales";
const MAX_RECENT_SALES = 10;

interface Invoice {
  id: string;
  invoiceNumber?: string;
  amount: number;
  asset: string;
  asset_issuer?: string;
  memo: string;
  destination_address: string;
  status: string;
  clientName?: string;
  createdAt?: string;
}

interface RecentSale {
  id: string;
  invoiceNumber?: string;
  amount: number;
  asset: string;
  memo: string;
  clientName: string;
  createdAt: string;
}

type Asset = "XLM" | "USDC";

// ─────────────────────────────────────────────
// Recent-sales localStorage helpers
// ─────────────────────────────────────────────

function loadRecentSales(): RecentSale[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENT_SALES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRecentSale(invoice: Invoice): void {
  if (typeof window === "undefined") return;
  try {
    const existing = loadRecentSales();
    const entry: RecentSale = {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      amount: invoice.amount,
      asset: invoice.asset,
      memo: invoice.memo,
      clientName: invoice.clientName ?? "Walk-in Customer",
      createdAt: invoice.createdAt ?? new Date().toISOString(),
    };
    // Deduplicate by id and keep newest at the front
    const updated = [entry, ...existing.filter((s) => s.id !== invoice.id)].slice(
      0,
      MAX_RECENT_SALES,
    );
    localStorage.setItem(RECENT_SALES_KEY, JSON.stringify(updated));
  } catch {
    // localStorage write failure is non-fatal
  }
}

// ─────────────────────────────────────────────
// Keyboard-shortcuts legend panel
// ─────────────────────────────────────────────

function ShortcutsLegend() {
  return (
    <div
      className="rounded-md bg-gray-50 border border-gray-200 px-4 py-3 text-xs text-gray-500"
      aria-label="Keyboard shortcuts"
    >
      <p className="mb-1 font-semibold text-gray-600">Keyboard shortcuts</p>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        <li>
          <kbd className="rounded bg-gray-200 px-1 py-0.5 font-mono text-gray-700">Enter</kbd>{" "}
          Submit form
        </li>
        <li>
          <kbd className="rounded bg-gray-200 px-1 py-0.5 font-mono text-gray-700">N</kbd>{" "}
          New sale
        </li>
        <li>
          <kbd className="rounded bg-gray-200 px-1 py-0.5 font-mono text-gray-700">X</kbd>{" "}
          Toggle asset
        </li>
        <li>
          <kbd className="rounded bg-gray-200 px-1 py-0.5 font-mono text-gray-700">Esc</kbd>{" "}
          Clear form
        </li>
      </ul>
    </div>
  );
}

// ─────────────────────────────────────────────
// Customer search autocomplete
// ─────────────────────────────────────────────

function CustomerSearch({
  onCustomerSelect,
}: {
  onCustomerSelect: (customer: Customer | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const containerRef = useRef<HTMLDivElement>(null);

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
        return;
      }
      try {
        const customers = await CustomerService.search(query, 6);
        setResults(customers);
        setIsOpen(customers.length > 0);
      } catch {
        setResults([]);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const selectCustomer = (c: Customer) => {
    setSelected(c);
    setQuery(`${c.name}${c.email ? ` (${c.email})` : ""}`);
    setIsOpen(false);
    onCustomerSelect(c);
  };

  return (
    <div ref={containerRef} className="relative">
      <label
        htmlFor="pos-customer-search"
        className="block text-sm font-medium text-gray-700"
      >
        Saved Client{" "}
        <span className="font-normal text-gray-400">(optional)</span>
      </label>
      <div className="mt-1 relative">
        <input
          id="pos-customer-search"
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (selected) {
              setSelected(null);
              onCustomerSelect(null);
            }
          }}
          placeholder="Search saved clients..."
          className="block w-full rounded-md border-0 py-2 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600"
          autoComplete="off"
        />
        {selected && (
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setQuery("");
              onCustomerSelect(null);
            }}
            aria-label="Clear selected client"
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
          >
            <svg
              className="h-4 w-4"
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
          </button>
        )}
      </div>
      {isOpen && results.length > 0 && (
        <ul
          role="listbox"
          aria-label="Client suggestions"
          className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md bg-white shadow-lg ring-1 ring-black/5"
        >
          {results.map((c) => (
            <li
              key={c.id}
              role="option"
              aria-selected={false}
              onClick={() => selectCustomer(c)}
              className="cursor-pointer px-4 py-2.5 text-sm text-gray-900 hover:bg-blue-50 transition-colors"
            >
              <div className="font-medium">{c.name}</div>
              {c.email && (
                <div className="text-xs text-gray-500">{c.email}</div>
              )}
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <p className="mt-1 text-xs text-blue-600 font-medium">
          Selected: {selected.name}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Recent sales panel
// ─────────────────────────────────────────────

interface RecentSalesPanelProps {
  sales: RecentSale[];
  onRepeat: (sale: RecentSale) => void;
}

function RecentSalesPanel({ sales, onRepeat }: RecentSalesPanelProps) {
  const router = useRouter();

  if (sales.length === 0) return null;

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffMin = Math.floor(diffMs / 60_000);
      if (diffMin < 1) return "just now";
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHr = Math.floor(diffMin / 60);
      if (diffHr < 24) return `${diffHr}h ago`;
      return d.toLocaleDateString();
    } catch {
      return "";
    }
  };

  return (
    <section aria-labelledby="recent-sales-heading" className="mt-6">
      <h2
        id="recent-sales-heading"
        className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2"
      >
        Recent Sales
      </h2>
      <ul className="space-y-2" role="list">
        {sales.map((sale) => (
          <li
            key={sale.id}
            className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="font-semibold text-gray-900">
                  {sale.amount.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 7,
                  })}{" "}
                  {sale.asset}
                </span>
                <span className="text-xs text-gray-400">
                  {formatTime(sale.createdAt)}
                </span>
              </div>
              <div className="truncate text-xs text-gray-500">
                {sale.clientName}
                {sale.memo ? ` · ${sale.memo}` : ""}
              </div>
            </div>
            <div className="ml-3 flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => onRepeat(sale)}
                aria-label={`Repeat sale of ${sale.amount} ${sale.asset}`}
                className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 border border-blue-200 transition-colors"
              >
                Repeat
              </button>
              <button
                type="button"
                onClick={() => router.push(`/invoices/${sale.id}`)}
                aria-label={`View invoice for ${sale.amount} ${sale.asset}`}
                className="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 border border-gray-200 transition-colors"
              >
                View
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─────────────────────────────────────────────
// Cashier-mode badge
// ─────────────────────────────────────────────

function CashierModeBadge() {
  return (
    <span
      aria-label="Cashier mode active"
      className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" aria-hidden="true" />
      Cashier Mode
    </span>
  );
}

// ─────────────────────────────────────────────
// FormView
// ─────────────────────────────────────────────

interface FormViewProps {
  onSuccess: (invoice: Invoice) => void;
  cashierMode: boolean;
  initialAmount?: string;
  initialAsset?: Asset;
  initialMemo?: string;
  initialCustomerName?: string;
  formResetKey: number;
}

function FormView({
  onSuccess,
  cashierMode,
  initialAmount = "",
  initialAsset = "XLM",
  initialMemo = "",
  initialCustomerName = "",
  formResetKey,
}: FormViewProps) {
  const [amount, setAmount] = useState(initialAmount);
  const [asset, setAsset] = useState<Asset>(initialAsset);
  const [memo, setMemo] = useState(initialMemo);
  const [customerName, setCustomerName] = useState(initialCustomerName);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Re-populate when repeat-sale fills in values
  useEffect(() => {
    setAmount(initialAmount);
    setAsset(initialAsset);
    setMemo(initialMemo);
    setCustomerName(initialCustomerName);
    setSelectedCustomer(null);
    setError(null);
    // Focus the amount field so cashier can confirm or change it immediately
    amountRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formResetKey]);

  const amountNum = parseFloat(amount);
  const isAmountValid = !isNaN(amountNum) && amountNum > 0;

  const clearForm = useCallback(() => {
    setAmount("");
    setAsset("XLM");
    setMemo("");
    setCustomerName("");
    setSelectedCustomer(null);
    setError(null);
    amountRef.current?.focus();
  }, []);

  const toggleAsset = useCallback(() => {
    setAsset((a) => (a === "XLM" ? "USDC" : "XLM"));
  }, []);

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!isAmountValid || isSubmitting) return;

      setIsSubmitting(true);
      setError(null);

      try {
        const ts = Date.now();
        const body: Record<string, unknown> = {
          invoiceNumber: `POS-${ts}`,
          clientName:
            selectedCustomer?.name || customerName.trim() || "Walk-in Customer",
          clientEmail: selectedCustomer?.email || `pos-${ts}@noreply.local`,
          amount: amountNum,
          asset_code: asset,
        };

        if (selectedCustomer) {
          body.customer_id = selectedCustomer.id;
        }

        if (asset === "USDC") {
          body.asset_issuer = USDC_ISSUER;
        }

        if (memo.trim()) {
          body.description = memo.trim();
        }

        const response = await apiClient.post<Invoice>("/invoices", body);
        onSuccess(response.data);

        // In cashier mode, pre-clear amount for next sale but keep other fields
        if (cashierMode) {
          setAmount("");
          setError(null);
        }
      } catch (err) {
        setError(extractApiErrorMessage(err));
      } finally {
        setIsSubmitting(false);
      }
    },
    [
      isAmountValid,
      isSubmitting,
      amountNum,
      asset,
      customerName,
      selectedCustomer,
      memo,
      cashierMode,
      onSuccess,
    ],
  );

  // ── Keyboard shortcuts (only when no modal/input is focused except amount) ──
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      const isInInput =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      // Enter on the amount field submits
      if (e.key === "Enter" && tag === "INPUT" && !e.shiftKey) {
        const activeId = (document.activeElement as HTMLElement)?.id;
        if (activeId === "pos-amount" && isAmountValid && !isSubmitting) {
          e.preventDefault();
          void handleSubmit();
        }
        return;
      }

      // Global shortcuts only when not typing in any input
      if (isInInput) return;

      switch (e.key.toLowerCase()) {
        case "x":
          e.preventDefault();
          toggleAsset();
          break;
        case "escape":
          e.preventDefault();
          clearForm();
          break;
        default:
          break;
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [handleSubmit, clearForm, toggleAsset, isAmountValid, isSubmitting]);

  return (
    <div className="overflow-hidden rounded-lg bg-white shadow">
      <div className="px-6 py-8 sm:px-8">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Point of Sale</h1>
            <p className="mt-1 text-sm text-gray-500">
              Create a quick payment request
            </p>
          </div>
          {cashierMode && <CashierModeBadge />}
        </div>

        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="mt-8 space-y-6"
          noValidate
        >
          {/* Amount */}
          <div>
            <label
              htmlFor="pos-amount"
              className="block text-sm font-medium text-gray-700"
            >
              Amount <span className="text-red-500">*</span>
            </label>
            <div className="mt-1">
              <input
                ref={amountRef}
                id="pos-amount"
                type="number"
                inputMode="decimal"
                min="0.0000001"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                required
                aria-invalid={!isAmountValid && amount.length > 0}
                aria-describedby={
                  !isAmountValid && amount.length > 0
                    ? "amount-error"
                    : undefined
                }
                className="block w-full rounded-md border-0 py-3 px-4 text-2xl font-bold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-300 focus:ring-2 focus:ring-inset focus:ring-blue-600"
              />
              {!isAmountValid && amount.length > 0 && (
                <p
                  id="amount-error"
                  className="mt-1 text-sm text-red-600"
                  role="alert"
                >
                  Amount must be greater than 0
                </p>
              )}
            </div>
          </div>

          {/* Asset Toggle */}
          <div>
            <span className="block text-sm font-medium text-gray-700">
              Asset{" "}
              <span className="font-normal text-gray-400 text-xs">
                (press <kbd className="rounded bg-gray-100 px-1 font-mono">X</kbd> to switch)
              </span>
            </span>
            <div
              className="mt-1 flex rounded-md shadow-sm"
              role="group"
              aria-label="Select payment asset"
            >
              <button
                type="button"
                onClick={() => setAsset("XLM")}
                aria-pressed={asset === "XLM"}
                className={`flex-1 rounded-l-md border px-4 py-3 text-sm font-semibold transition-colors ${
                  asset === "XLM"
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
              >
                XLM (Native)
              </button>
              <button
                type="button"
                onClick={() => setAsset("USDC")}
                aria-pressed={asset === "USDC"}
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

          {/* Memo / Note */}
          <div>
            <label
              htmlFor="pos-memo"
              className="block text-sm font-medium text-gray-700"
            >
              Note <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <div className="mt-1">
              <input
                id="pos-memo"
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="e.g. Table 5, Order #42"
                maxLength={200}
                className="block w-full rounded-md border-0 py-2 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600"
              />
            </div>
          </div>

          {/* Customer Name */}
          <div>
            <label
              htmlFor="pos-customer"
              className="block text-sm font-medium text-gray-700"
            >
              Customer Name{" "}
              <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <div className="mt-1">
              <input
                id="pos-customer"
                type="text"
                value={selectedCustomer ? selectedCustomer.name : customerName}
                onChange={(e) => {
                  setCustomerName(e.target.value);
                  if (selectedCustomer) setSelectedCustomer(null);
                }}
                placeholder="Walk-in Customer"
                className="block w-full rounded-md border-0 py-2 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-600"
              />
            </div>
          </div>

          {/* Saved Client Search */}
          <CustomerSearch onCustomerSelect={setSelectedCustomer} />

          {error && (
            <div
              className="rounded-md bg-red-50 p-4"
              role="alert"
              aria-live="assertive"
            >
              <p className="text-sm font-medium text-red-900">{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={!isAmountValid || isSubmitting}
              aria-label="Generate payment QR code (Enter)"
              className="flex-1 rounded-md bg-blue-600 px-4 py-4 text-center text-lg font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400 transition-colors"
            >
              {isSubmitting ? "Generating…" : "Generate QR Code"}
            </button>
            {cashierMode && (
              <button
                type="button"
                onClick={clearForm}
                aria-label="Clear form (Escape)"
                className="rounded-md border border-gray-300 px-4 py-4 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                title="Clear form (Esc)"
              >
                Clear
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PaymentView
// ─────────────────────────────────────────────

function PaymentView({
  invoice,
  onNewSale,
  cashierMode,
}: {
  invoice: Invoice;
  onNewSale: () => void;
  cashierMode: boolean;
}) {
  const router = useRouter();
  const newSaleRef = useRef<HTMLButtonElement>(null);

  const paymentUri = generatePaymentUri({
    destination: invoice.destination_address,
    amount: invoice.amount.toString(),
    assetCode: invoice.asset,
    assetIssuer: invoice.asset_issuer,
    memo: invoice.memo,
    memoType: "id",
  });

  // Auto-focus "New Sale" in cashier mode for fastest keyboard navigation
  useEffect(() => {
    if (cashierMode) {
      newSaleRef.current?.focus();
    }
  }, [cashierMode]);

  // Keyboard shortcut: N = new sale
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      const isInInput =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (isInInput) return;

      if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        onNewSale();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onNewSale]);

  return (
    <div className="overflow-hidden rounded-lg bg-white shadow">
      <div className="px-6 py-8 sm:px-8">
        {cashierMode && (
          <div className="mb-4 flex justify-end">
            <CashierModeBadge />
          </div>
        )}

        <div className="text-center">
          <p className="text-sm font-medium uppercase tracking-wide text-green-600">
            Payment Request Ready
          </p>
          <p className="mt-2 text-4xl font-bold text-gray-900">
            {invoice.amount.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 7,
            })}{" "}
            <span className="text-xl text-gray-600">{invoice.asset}</span>
          </p>
          {invoice.memo && (
            <p className="mt-1 text-sm text-gray-500">
              Memo: <span className="font-mono">{invoice.memo}</span>
            </p>
          )}
          {invoice.clientName && invoice.clientName !== "Walk-in Customer" && (
            <p className="mt-0.5 text-sm text-gray-500">{invoice.clientName}</p>
          )}
        </div>

        {/* QR Code */}
        <div className="mt-8 flex justify-center">
          <div className="rounded-xl border-4 border-gray-900 bg-white p-3">
            <QRCodeSVG
              value={paymentUri}
              size={240}
              level="M"
              aria-label={`QR code for Stellar payment of ${invoice.amount} ${invoice.asset}`}
            />
          </div>
        </div>

        <p className="mt-4 text-center text-sm text-gray-500">
          Scan with a Stellar wallet app to pay
        </p>

        {/* Payment URI (collapsed for power users) */}
        <details className="mt-4">
          <summary className="cursor-pointer text-center text-xs text-gray-400 hover:text-gray-600">
            Show payment URI
          </summary>
          <p className="mt-2 break-all rounded bg-gray-50 p-2 font-mono text-xs text-gray-600">
            {paymentUri}
          </p>
        </details>

        <div className="mt-8 flex flex-col gap-3">
          <button
            ref={newSaleRef}
            type="button"
            onClick={onNewSale}
            aria-label="Start a new sale (N)"
            className="w-full rounded-md bg-blue-600 px-4 py-3 text-center font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            {cashierMode ? "New Sale (N)" : "New Sale"}
          </button>
          <button
            type="button"
            onClick={() => router.push(`/invoices/${invoice.id}`)}
            className="w-full rounded-md border border-gray-300 px-4 py-3 text-center font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            View Invoice
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// POSContent (top-level orchestrator)
// ─────────────────────────────────────────────

function POSContent() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [cashierMode, setCashierMode] = useState(false);
  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);

  // Repeat-sale pre-fill state
  const [prefill, setPrefill] = useState<{
    amount: string;
    asset: Asset;
    memo: string;
    customerName: string;
    key: number;
  }>({ amount: "", asset: "XLM", memo: "", customerName: "", key: 0 });

  // Load recent sales from localStorage on mount
  useEffect(() => {
    setRecentSales(loadRecentSales());
  }, []);

  const handleSuccess = useCallback(
    (created: Invoice) => {
      setInvoice(created);
      // Persist to recent sales
      saveRecentSale(created);
      setRecentSales(loadRecentSales());
      // Sync activation checklist
      void MerchantService.syncChecklist()
        .then(() => {
          void queryClient.invalidateQueries({ queryKey: checklistQueryKey });
        })
        .catch(() => undefined);
    },
    [queryClient],
  );

  const handleNewSale = useCallback(() => {
    setInvoice(null);
    // Reset prefill (increment key forces re-mount of form state)
    setPrefill((p) => ({
      amount: "",
      asset: "XLM",
      memo: "",
      customerName: "",
      key: p.key + 1,
    }));
  }, []);

  const handleRepeat = useCallback((sale: RecentSale) => {
    // Navigate back to form (dismiss QR if shown) and pre-fill with sale values
    setInvoice(null);
    setPrefill({
      amount: sale.amount.toString(),
      asset: sale.asset as Asset,
      memo: sale.memo ?? "",
      customerName: sale.clientName === "Walk-in Customer" ? "" : sale.clientName,
      key: Date.now(),
    });
  }, []);

  // Global "N" shortcut for new sale when form is visible and an invoice exists
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      const isInInput =
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (isInInput) return;
      // "N" shortcut handled in PaymentView when invoice is shown;
      // here we handle it when on the form screen (no invoice)
      if (!invoice && e.key.toLowerCase() === "n") {
        e.preventDefault();
        handleNewSale();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [invoice, handleNewSale]);

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-md">
        {/* Nav + header */}
        <div className="mb-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push("/invoices")}
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            ← Back to Invoices
          </button>

          {/* Cashier mode toggle */}
          <label className="flex cursor-pointer items-center gap-2 select-none">
            <span className="text-sm font-medium text-gray-600">
              Cashier Mode
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={cashierMode}
              aria-label="Toggle cashier mode"
              onClick={() => setCashierMode((m) => !m)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
                cashierMode ? "bg-blue-600" : "bg-gray-300"
              }`}
            >
              <span
                aria-hidden="true"
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  cashierMode ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </label>
        </div>

        {/* Keyboard shortcuts legend in cashier mode */}
        {cashierMode && !invoice && <ShortcutsLegend />}

        {/* Main panel */}
        <div className={cashierMode && !invoice ? "mt-4" : ""}>
          {invoice ? (
            <PaymentView
              invoice={invoice}
              onNewSale={handleNewSale}
              cashierMode={cashierMode}
            />
          ) : (
            <FormView
              key={prefill.key}
              onSuccess={handleSuccess}
              cashierMode={cashierMode}
              initialAmount={prefill.amount}
              initialAsset={prefill.asset}
              initialMemo={prefill.memo}
              initialCustomerName={prefill.customerName}
              formResetKey={prefill.key}
            />
          )}
        </div>

        {/* Recent sales (always visible below the active panel) */}
        {!invoice && (
          <RecentSalesPanel sales={recentSales} onRepeat={handleRepeat} />
        )}
      </div>
    </div>
  );
}

export default function POSPage() {
  return (
    <RequireAuth>
      <POSContent />
    </RequireAuth>
  );
}
