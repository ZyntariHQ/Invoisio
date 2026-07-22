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

interface Invoice {
  id: string;
  invoiceNumber?: string;
  amount: number;
  asset: string;
  asset_issuer?: string;
  memo: string;
  destination_address: string;
  status: string;
}

type Asset = "XLM" | "USDC";

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

function FormView({ onSuccess }: { onSuccess: (invoice: Invoice) => void }) {
  const [amount, setAmount] = useState("");
  const [asset, setAsset] = useState<Asset>("XLM");
  const [memo, setMemo] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountNum = parseFloat(amount);
  const isAmountValid = !isNaN(amountNum) && amountNum > 0;

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

          <button
            type="submit"
            disabled={!isAmountValid || isSubmitting}
            aria-label="Generate payment QR code"
            className="w-full rounded-md bg-blue-600 px-4 py-4 text-center text-lg font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-400 transition-colors"
          >
            {isSubmitting ? "Generating..." : "Generate QR Code"}
          </button>
        </form>
      </div>
    </div>
  );
}

function PaymentView({
  invoice,
  onNewSale,
}: {
  invoice: Invoice;
  onNewSale: () => void;
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

  return (
    <div className="overflow-hidden rounded-lg bg-white shadow">
      <div className="px-6 py-8 sm:px-8">
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
      </div>
    </div>
  );
}

function POSContent() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [invoice, setInvoice] = useState<Invoice | null>(null);

  const handleSuccess = useCallback(
    (created: Invoice) => {
      setInvoice(created);
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

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-md">
        {/* Nav */}
        <button
          type="button"
          onClick={() => router.push("/invoices")}
          className="mb-8 text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          ← Back to Invoices
        </button>

        {invoice ? (
          <PaymentView invoice={invoice} onNewSale={handleNewSale} />
        ) : (
          <FormView onSuccess={handleSuccess} />
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
