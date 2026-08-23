"use client";

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useQueryClient } from "@tanstack/react-query";
import { apiClient, extractApiErrorMessage } from "@/lib/api-client";
import { generatePaymentUri } from "@/lib/sep0007";
import { RequireAuth } from "@/components/require-auth";
import { MerchantService } from "@/lib/merchant-service";
import { checklistQueryKey } from "@/hooks/use-merchant-checklist";
import { CustomerService, Customer } from "@/lib/customer-service";
import { formatTimeAgo } from "@/lib/format-time-ago";

// Stellar mainnet USDC issuer — override via NEXT_PUBLIC_USDC_ISSUER for testnet
const USDC_ISSUER =
  process.env.NEXT_PUBLIC_USDC_ISSUER ||
  "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";

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

type Asset = "XLM" | "USDC";

const CASHIER_MODE_STORAGE_KEY = "invoisio.pos.cashierMode";
const RECENT_SALES_LIMIT = 8;

/**
 * Cashier mode is a per-device preference for shared in-store terminals —
 * it never carries customer or sale data, so it's safe to persist in
 * localStorage across sessions on the same device. Backed by
 * useSyncExternalStore rather than useState+useEffect so the toggle stays
 * false during SSR/hydration (no window) and picks up the persisted value
 * in the same commit once mounted, with no extra render-then-patch step.
 */
let cashierModeListeners: Array<() => void> = [];

function getCashierModeSnapshot(): boolean {
  try {
    return window.localStorage.getItem(CASHIER_MODE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function getCashierModeServerSnapshot(): boolean {
  return false;
}

function subscribeCashierMode(onStoreChange: () => void): () => void {
  cashierModeListeners.push(onStoreChange);
  return () => {
    cashierModeListeners = cashierModeListeners.filter(
      (l) => l !== onStoreChange,
    );
  };
}

function persistCashierMode(next: boolean) {
  try {
    window.localStorage.setItem(CASHIER_MODE_STORAGE_KEY, next ? "1" : "0");
  } catch {
    // Best-effort persistence only.
  }
  for (const listener of cashierModeListeners) listener();
}

function useCashierMode(): [boolean, (next: boolean) => void] {
  const cashierMode = useSyncExternalStore(
    subscribeCashierMode,
    getCashierModeSnapshot,
    getCashierModeServerSnapshot,
  );
  return [cashierMode, persistCashierMode];
}

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
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
          >
            <svg
              className="h-4 w-4"
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
      {isOpen && results.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md bg-white shadow-lg ring-1 ring-black/5">
          {results.map((c) => (
            <li
              key={c.id}
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

const STATUS_STYLES: Record<string, string> = {
  paid: "bg-green-100 text-green-800",
  pending: "bg-amber-100 text-amber-800",
  overdue: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-600",
};

/**
 * Recent sales/payment requests for this merchant, visible on the same
 * screen as the POS form. Selecting one re-opens its QR code instead of
 * creating a duplicate invoice — handy when a customer's wallet missed the
 * first scan.
 */
function RecentSalesPanel({
  sales,
  isLoading,
  error,
  onRetry,
  onSelect,
  compact = false,
}: {
  sales: Invoice[];
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  onSelect: (invoice: Invoice) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "rounded-lg bg-white shadow"
          : "rounded-lg bg-white shadow lg:sticky lg:top-12"
      }
    >
      <div className="px-5 py-4">
        <h2 className="text-sm font-semibold text-gray-900">Recent sales</h2>
        <p className="mt-0.5 text-xs text-gray-500">
          Tap a sale to show its QR code again.
        </p>

        {isLoading && (
          <ul className="mt-3 space-y-2" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="h-12 animate-pulse rounded-md bg-gray-100" />
            ))}
          </ul>
        )}

        {!isLoading && error && (
          <div
            className="mt-3 flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-900"
            role="alert"
          >
            <span>{error}</span>
            <button
              type="button"
              onClick={onRetry}
              className="shrink-0 font-semibold underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}

        {!isLoading && !error && sales.length === 0 && (
          <p className="mt-3 text-sm text-gray-400">No sales yet.</p>
        )}

        {!isLoading && !error && sales.length > 0 && (
          <ul className="mt-3 divide-y divide-gray-100">
            {sales.map((sale) => (
              <li key={sale.id}>
                <button
                  type="button"
                  onClick={() => onSelect(sale)}
                  className="flex w-full items-center justify-between gap-2 py-2.5 text-left hover:bg-gray-50 rounded-md px-1.5 -mx-1.5 transition-colors"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-gray-900">
                      {sale.amount.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 7,
                      })}{" "}
                      {sale.asset}
                    </span>
                    <span className="block truncate text-xs text-gray-500">
                      {sale.clientName || "Walk-in Customer"}
                      {sale.createdAt
                        ? ` · ${formatTimeAgo(sale.createdAt)}`
                        : ""}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      STATUS_STYLES[sale.status] ?? "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {sale.status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CustomerNameField({
  selectedCustomer,
  customerName,
  setCustomerName,
  setSelectedCustomer,
}: {
  selectedCustomer: Customer | null;
  customerName: string;
  setCustomerName: (name: string) => void;
  setSelectedCustomer: (customer: Customer | null) => void;
}) {
  return (
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
  );
}

function FormView({
  onSuccess,
  cashierMode,
}: {
  onSuccess: (invoice: Invoice) => void;
  cashierMode: boolean;
}) {
  const [amount, setAmount] = useState("");
  const [asset, setAsset] = useState<Asset>("XLM");
  const [memo, setMemo] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);

  const amountNum = parseFloat(amount);
  const isAmountValid = !isNaN(amountNum) && amountNum > 0;

  // Cashier mode: land straight in the amount field so a cashier can type
  // the next sale's total without reaching for the mouse.
  useEffect(() => {
    if (cashierMode) amountInputRef.current?.focus();
  }, [cashierMode]);

  // Alt-modified shortcuts are safe to keep active everywhere — they never
  // collide with typing a digit into the amount field. Matched on e.code
  // (the physical key) rather than e.key: Alt/Option remaps e.key on macOS
  // (Alt+1 -> "¡", Alt+A -> "å"), which would otherwise silently break
  // these shortcuts for Mac cashiers.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.code === "KeyA") {
        e.preventDefault();
        amountInputRef.current?.focus();
      } else if (e.code === "Digit1") {
        e.preventDefault();
        setAsset("XLM");
      } else if (e.code === "Digit2") {
        e.preventDefault();
        setAsset("USDC");
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
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
      onSuccess,
    ],
  );

  return (
    <div className="overflow-hidden rounded-lg bg-white shadow">
      <div className="px-6 py-8 sm:px-8">
        <h1 className="text-2xl font-bold text-gray-900">Point of Sale</h1>
        <p className="mt-1 text-sm text-gray-500">
          Create a quick payment request
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6" noValidate>
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
                ref={amountInputRef}
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
              Asset
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
                aria-keyshortcuts="Alt+1"
                title="Shortcut: Alt+1"
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
                aria-keyshortcuts="Alt+2"
                title="Shortcut: Alt+2"
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

          {/* Customer Name + Saved Client Search. In cashier mode these are
              tucked behind a disclosure — most walk-in sales don't need
              them, and skipping straight to Generate is the common path. */}
          {cashierMode ? (
            <details className="group rounded-md border border-gray-200 open:border-gray-300">
              <summary className="cursor-pointer select-none list-none px-3 py-2.5 text-sm font-medium text-gray-700 marker:content-none">
                <span className="inline-flex items-center gap-1.5">
                  <span className="transition-transform group-open:rotate-90">
                    ▸
                  </span>
                  Add customer details (optional)
                </span>
              </summary>
              <div className="space-y-6 px-3 pb-3 pt-1">
                <CustomerNameField
                  selectedCustomer={selectedCustomer}
                  customerName={customerName}
                  setCustomerName={setCustomerName}
                  setSelectedCustomer={setSelectedCustomer}
                />
                <CustomerSearch onCustomerSelect={setSelectedCustomer} />
              </div>
            </details>
          ) : (
            <>
              <CustomerNameField
                selectedCustomer={selectedCustomer}
                customerName={customerName}
                setCustomerName={setCustomerName}
                setSelectedCustomer={setSelectedCustomer}
              />
              <CustomerSearch onCustomerSelect={setSelectedCustomer} />
            </>
          )}

          {error && (
            <div
              className="rounded-md bg-red-50 p-4"
              role="alert"
              aria-live="assertive"
            >
              <p className="text-sm font-medium text-red-900">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={!isAmountValid || isSubmitting}
            aria-label="Generate payment QR code"
            className="w-full rounded-md bg-blue-600 px-4 py-4 text-center text-lg font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400 transition-colors"
          >
            {isSubmitting ? "Generating..." : "Generate QR Code"}
          </button>
          <p className="text-center text-xs text-gray-400">
            Shortcuts: <kbd className="rounded border px-1">Alt+A</kbd> focus
            amount · <kbd className="rounded border px-1">Alt+1</kbd> XLM ·{" "}
            <kbd className="rounded border px-1">Alt+2</kbd> USDC
          </p>
        </form>
      </div>
    </div>
  );
}

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

  const paymentUri = generatePaymentUri({
    destination: invoice.destination_address,
    amount: invoice.amount.toString(),
    assetCode: invoice.asset,
    assetIssuer: invoice.asset_issuer,
    memo: invoice.memo,
    memoType: "id",
  });

  // This screen has no text inputs, so plain (unmodified) key accelerators
  // are safe here — a cashier can clear the QR and move on without
  // touching the mouse. The same actions stay available as regular buttons
  // below, so nothing on this screen is keyboard-only.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "n" || e.key === "N" || e.key === "Enter" || e.key === "Escape") {
        e.preventDefault();
        onNewSale();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onNewSale]);

  const isReopenedNonPending =
    invoice.status !== "pending" && invoice.status !== "draft";

  return (
    <div className="overflow-hidden rounded-lg bg-white shadow">
      <div className="px-6 py-8 sm:px-8">
        {isReopenedNonPending && (
          <div
            className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-3 text-center text-sm text-amber-900"
            role="alert"
          >
            This sale is already <strong>{invoice.status}</strong> — this QR
            is shown for reference only, not a new payment request.
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
            type="button"
            onClick={onNewSale}
            aria-keyshortcuts="N Enter Escape"
            title="Shortcut: N, Enter, or Escape"
            className="w-full rounded-md bg-blue-600 px-4 py-3 text-center font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            New Sale
          </button>
          <button
            type="button"
            onClick={() => router.push(`/invoices/${invoice.id}`)}
            className="w-full rounded-md border border-gray-300 px-4 py-3 text-center font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            View Invoice
          </button>
        </div>
        {cashierMode && (
          <p className="mt-4 text-center text-xs text-gray-400">
            Press <kbd className="rounded border px-1">N</kbd>,{" "}
            <kbd className="rounded border px-1">Enter</kbd>, or{" "}
            <kbd className="rounded border px-1">Esc</kbd> to start the next
            sale
          </p>
        )}
      </div>
    </div>
  );
}

function POSContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [cashierMode, setCashierMode] = useCashierMode();

  const [recentSales, setRecentSales] = useState<Invoice[]>([]);
  const [isLoadingSales, setIsLoadingSales] = useState(true);
  const [salesLoadError, setSalesLoadError] = useState<string | null>(null);
  // Tracks the cancel function for whichever fetch is currently in flight,
  // so a retry can supersede a still-pending mount fetch (or vice versa)
  // without a stale response's setState calls landing after the component
  // (or the request itself) has moved on.
  const cancelPendingFetchRef = useRef<() => void>(() => {});

  // Assumes the caller already put the panel into a loading state; only
  // sets state from the async response, so it's safe to call directly from
  // an effect body.
  const fetchRecentSales = useCallback(() => {
    cancelPendingFetchRef.current();
    let cancelled = false;
    cancelPendingFetchRef.current = () => {
      cancelled = true;
    };
    apiClient
      .get<Invoice[]>(`/invoices?page=1&limit=${RECENT_SALES_LIMIT}`)
      .then((response) => {
        if (!cancelled) setRecentSales(response.data);
      })
      .catch((err) => {
        if (!cancelled) setSalesLoadError(extractApiErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setIsLoadingSales(false);
      });
    return () => cancelPendingFetchRef.current();
  }, []);

  useEffect(() => fetchRecentSales(), [fetchRecentSales]);

  const retryLoadRecentSales = useCallback(() => {
    setIsLoadingSales(true);
    setSalesLoadError(null);
    fetchRecentSales();
  }, [fetchRecentSales]);

  const handleSuccess = useCallback(
    (created: Invoice) => {
      setInvoice(created);
      setRecentSales((prev) => [
        created,
        ...prev.filter((s) => s.id !== created.id),
      ].slice(0, RECENT_SALES_LIMIT));
      // Mark the first-invoice step and refresh the activation checklist
      // so the dashboard reflects completion after the user navigates back.
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
  }, []);

  const handleSelectRecentSale = useCallback((sale: Invoice) => {
    setInvoice(sale);
  }, []);

  const recentSalesPanel = (
    <RecentSalesPanel
      sales={recentSales}
      isLoading={isLoadingSales}
      error={salesLoadError}
      onRetry={retryLoadRecentSales}
      onSelect={handleSelectRecentSale}
      compact={!cashierMode}
    />
  );

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className={cashierMode ? "mx-auto max-w-5xl" : "mx-auto max-w-md"}>
        {/* Nav */}
        <div className="mb-8 flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => router.push("/invoices")}
            className="text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            ← Back to Invoices
          </button>

          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-700">
            Cashier mode
            <button
              type="button"
              role="switch"
              aria-checked={cashierMode}
              onClick={() => setCashierMode(!cashierMode)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                cashierMode ? "bg-blue-600" : "bg-gray-300"
              }`}
            >
              <span className="sr-only">Toggle cashier mode</span>
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  cashierMode ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </label>
        </div>

        {cashierMode ? (
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_320px]">
            <div>
              {invoice ? (
                <PaymentView
                  invoice={invoice}
                  onNewSale={handleNewSale}
                  cashierMode={cashierMode}
                />
              ) : (
                <FormView onSuccess={handleSuccess} cashierMode={cashierMode} />
              )}
            </div>
            {recentSalesPanel}
          </div>
        ) : (
          <div className="space-y-6">
            {invoice ? (
              <PaymentView
                invoice={invoice}
                onNewSale={handleNewSale}
                cashierMode={cashierMode}
              />
            ) : (
              <FormView onSuccess={handleSuccess} cashierMode={cashierMode} />
            )}
            {recentSalesPanel}
          </div>
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
