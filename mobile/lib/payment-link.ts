import type { Invoice } from "./invoices";

type PaymentLinkParams = {
  amount?: string;
  assetCode?: string;
  assetIssuer?: string;
  destination: string;
  memo?: string;
  memoType?: "text" | "id" | "hash" | "return";
};

export function getInvoiceAsset(invoice: Invoice): string {
  return invoice.asset_code ?? invoice.asset ?? "XLM";
}

export function getInvoiceDestination(invoice: Invoice): string | undefined {
  return invoice.destination_address ?? invoice.destination;
}

export function getInvoiceMemoType(
  invoice: Invoice,
): "text" | "id" | "hash" | "return" {
  const memoType = invoice.memo_type?.toLowerCase();

  if (
    memoType === "text" ||
    memoType === "id" ||
    memoType === "hash" ||
    memoType === "return"
  ) {
    return memoType;
  }

  return "id";
}

export function generatePaymentUri({
  amount,
  assetCode,
  assetIssuer,
  destination,
  memo,
  memoType = "id",
}: PaymentLinkParams): string {
  const queryParts = [`destination=${encodeURIComponent(destination)}`];

  if (amount) {
    queryParts.push(`amount=${encodeURIComponent(amount)}`);
  }

  if (assetCode) {
    queryParts.push(`asset_code=${encodeURIComponent(assetCode)}`);
  }

  if (assetIssuer) {
    queryParts.push(`asset_issuer=${encodeURIComponent(assetIssuer)}`);
  }

  if (memo) {
    queryParts.push(`memo=${encodeURIComponent(memo)}`);
    queryParts.push(`memo_type=${memoType}`);
  }

  return `web+stellar:pay?${queryParts.join("&")}`;
}

function formatAmount(amount: number): string {
  return amount.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
}

export function buildInvoiceShareMessage(invoice: Invoice): string {
  const assetCode = getInvoiceAsset(invoice);
  const destination = getInvoiceDestination(invoice);
  const paymentUri = destination
    ? generatePaymentUri({
        amount: String(invoice.amount),
        assetCode,
        assetIssuer: invoice.asset_issuer,
        destination,
        memo: invoice.memo,
        memoType: getInvoiceMemoType(invoice),
      })
    : undefined;

  const lines = [
    `Invoice ${invoice.invoiceNumber ?? invoice.id}`,
    invoice.clientName ?? "Payment request",
    "",
    `Amount: ${formatAmount(invoice.amount)} ${assetCode}`,
    `Destination: ${destination ?? "Unavailable"}`,
    `Memo: ${invoice.memo ?? "Unavailable"}`,
  ];

  if (invoice.description) {
    lines.push(`Context: ${invoice.description}`);
  }

  if (paymentUri) {
    lines.push("", `Payment link: ${paymentUri}`);
  }

  return lines.join("\n");
}
