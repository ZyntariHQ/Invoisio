/**
 * Receipt export and share utilities.
 *
 * Provides two export modes:
 *   1. Text share  — uses React Native's built-in Share API. Works on every
 *      device without additional native modules. Ideal for messaging apps,
 *      email, or any share target that accepts plain text.
 *
 *   2. PDF export  — renders a styled HTML receipt via expo-print, then
 *      triggers the native share sheet via expo-sharing.  Requires
 *      `expo-print` and `expo-sharing` to be installed:
 *
 *        npx expo install expo-print expo-sharing
 *
 *      If those packages are not present the PDF path gracefully falls back
 *      to text share and resolves with `{ fallback: true }`.
 */

import { Share } from "react-native";
import type { Invoice, PaymentRecord } from "./invoices";
import { getInvoiceAsset, getInvoiceDestination } from "./payment-link";

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatAmount(value: number | undefined, assetCode: string): string {
  const n = (value ?? 0).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });
  return `${n} ${assetCode}`;
}

function formatDate(value: string | undefined): string {
  if (!value) return "Unavailable";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "Unavailable" : d.toLocaleString();
}

function statusLabel(status: Invoice["status"]): string {
  const map: Record<Invoice["status"], string> = {
    paid: "Paid ✓",
    partially_paid: "Partially paid",
    pending: "Pending",
    overdue: "Overdue",
    cancelled: "Cancelled",
    draft: "Draft",
  };
  return map[status] ?? status;
}

// ─── text receipt ─────────────────────────────────────────────────────────────

/**
 * Build a human-readable plain-text receipt suitable for sharing via
 * messaging apps, email, or any text-based share target.
 */
export function buildReceiptText(invoice: Invoice): string {
  const assetCode = getInvoiceAsset(invoice);
  const destination = getInvoiceDestination(invoice);
  const payments: PaymentRecord[] = invoice.payments ?? [];
  const txHash = invoice.tx_hash ?? payments[0]?.txHash;

  const divider = "─".repeat(40);

  const lines: string[] = [
    "🧾  PAYMENT RECEIPT",
    divider,
    `Invoice:       ${invoice.invoiceNumber ?? invoice.id}`,
    `Client:        ${invoice.clientName ?? "—"}`,
    `Status:        ${statusLabel(invoice.status)}`,
    divider,
    "SETTLEMENT",
    `Amount:        ${formatAmount(invoice.amount, assetCode)}`,
    `Amount paid:   ${formatAmount(
      invoice.amountPaid ??
        (invoice.status === "paid" ? invoice.amount : 0),
      assetCode,
    )}`,
    `Amount due:    ${formatAmount(invoice.amountDue ?? 0, assetCode)}`,
    `Asset:         ${
      invoice.asset_issuer
        ? `${assetCode} (issuer: ${invoice.asset_issuer})`
        : assetCode
    }`,
    `Destination:   ${destination ?? "—"}`,
    `Memo:          ${invoice.memo ?? "—"}`,
    `Created:       ${formatDate(invoice.createdAt)}`,
  ];

  if (invoice.dueDate) {
    lines.push(`Due date:      ${formatDate(invoice.dueDate)}`);
  }

  if (invoice.description) {
    lines.push(`Description:   ${invoice.description}`);
  }

  if (txHash || payments.length > 0) {
    lines.push(divider, "PROOF OF PAYMENT");
    if (txHash) {
      lines.push(`Tx hash:       ${txHash}`);
    }
    payments.forEach((p, i) => {
      lines.push(
        `Payment ${i + 1}:   ${formatAmount(p.amount, assetCode)}  ${
          p.txHash ? `(${p.txHash})` : ""
        }  ${formatDate(p.createdAt)}`,
      );
    });
    lines.push(
      "",
      "Verify this transaction on the Stellar network to confirm payment.",
    );
  }

  lines.push(divider, "Invoisio · Privacy-first invoicing on Stellar");

  return lines.join("\n");
}

// ─── HTML receipt template ────────────────────────────────────────────────────

/**
 * Build a styled HTML string for the receipt.  Used by the PDF export path.
 */
export function buildReceiptHtml(invoice: Invoice): string {
  const assetCode = getInvoiceAsset(invoice);
  const destination = getInvoiceDestination(invoice);
  const payments: PaymentRecord[] = invoice.payments ?? [];
  const txHash = invoice.tx_hash ?? payments[0]?.txHash;

  const statusColors: Record<string, string> = {
    paid: "#10b981",
    partially_paid: "#38bdf8",
    pending: "#fbbf24",
    overdue: "#f87171",
    cancelled: "#94a3b8",
    draft: "#94a3b8",
  };
  const statusColor = statusColors[invoice.status] ?? "#94a3b8";

  function row(label: string, value: string, mono = false): string {
    return `
      <tr>
        <td class="label">${label}</td>
        <td class="${mono ? "mono" : ""}">${value}</td>
      </tr>`;
  }

  const paymentsRows = payments
    .map(
      (p, i) => `
      <div class="payment-row">
        <span class="payment-index">#${i + 1}</span>
        <span>${formatAmount(p.amount, assetCode)}</span>
        ${p.txHash ? `<span class="mono small">${p.txHash}</span>` : ""}
        <span class="small muted">${formatDate(p.createdAt)}</span>
      </div>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Payment Receipt · ${invoice.invoiceNumber ?? invoice.id}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #050914;
      color: #e2e8f0;
      padding: 32px;
      max-width: 600px;
      margin: 0 auto;
    }
    .header {
      border-bottom: 1px solid rgba(255,255,255,0.1);
      padding-bottom: 20px;
      margin-bottom: 24px;
    }
    .badge {
      display: inline-block;
      font-size: 11px;
      letter-spacing: 0.25em;
      text-transform: uppercase;
      color: #7dd3fc;
      margin-bottom: 8px;
    }
    h1 { font-size: 24px; color: #fff; margin-bottom: 4px; }
    .client { color: #94a3b8; font-size: 14px; }
    .status-pill {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      background: rgba(255,255,255,0.08);
      color: ${statusColor};
      margin-top: 12px;
    }
    section { margin-bottom: 24px; }
    .section-title {
      font-size: 11px;
      letter-spacing: 0.25em;
      text-transform: uppercase;
      color: #7dd3fc;
      margin-bottom: 12px;
    }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 8px 0; vertical-align: top; }
    td.label {
      color: #64748b;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      width: 38%;
      padding-right: 8px;
    }
    .mono { font-family: 'Courier New', monospace; font-size: 13px; word-break: break-all; }
    .proof-box {
      background: rgba(16,185,129,0.07);
      border: 1px solid rgba(16,185,129,0.25);
      border-radius: 12px;
      padding: 16px;
    }
    .proof-title {
      font-size: 11px;
      letter-spacing: 0.25em;
      text-transform: uppercase;
      color: #34d399;
      margin-bottom: 12px;
    }
    .hash { font-family: 'Courier New', monospace; font-size: 12px; word-break: break-all; color: #a7f3d0; }
    .payment-row {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 8px 0;
      border-top: 1px solid rgba(255,255,255,0.06);
    }
    .payment-index { font-size: 11px; color: #64748b; }
    .small { font-size: 12px; }
    .muted { color: #64748b; }
    .verify-note {
      margin-top: 12px;
      font-size: 12px;
      color: #64748b;
    }
    .footer {
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid rgba(255,255,255,0.08);
      text-align: center;
      font-size: 12px;
      color: #475569;
    }
  </style>
</head>
<body>
  <div class="header">
    <span class="badge">Payment Receipt</span>
    <h1>${invoice.invoiceNumber ?? invoice.id}</h1>
    <div class="client">${invoice.clientName ?? ""}</div>
    <div class="status-pill">${statusLabel(invoice.status)}</div>
  </div>

  <section>
    <div class="section-title">Settlement</div>
    <table>
      ${row("Amount", formatAmount(invoice.amount, assetCode))}
      ${row(
        "Amount paid",
        formatAmount(
          invoice.amountPaid ??
            (invoice.status === "paid" ? invoice.amount : 0),
          assetCode,
        ),
      )}
      ${row("Amount due", formatAmount(invoice.amountDue ?? 0, assetCode))}
      ${row(
        "Asset",
        invoice.asset_issuer
          ? `${assetCode}<br/><span class="mono small">(issuer: ${invoice.asset_issuer})</span>`
          : assetCode,
      )}
      ${destination ? row("Destination", destination, true) : ""}
      ${row("Memo", invoice.memo ?? "—", true)}
      ${row("Created", formatDate(invoice.createdAt))}
      ${invoice.dueDate ? row("Due date", formatDate(invoice.dueDate)) : ""}
      ${invoice.description ? row("Description", invoice.description) : ""}
    </table>
  </section>

  ${
    txHash || payments.length > 0
      ? `<section>
    <div class="proof-box">
      <div class="proof-title">Proof of Payment</div>
      ${
        txHash
          ? `<div style="margin-bottom:8px;">
          <div class="small muted" style="margin-bottom:4px;">Transaction hash</div>
          <div class="hash">${txHash}</div>
        </div>`
          : ""
      }
      ${paymentsRows}
      <div class="verify-note">
        Verify this transaction on the Stellar network to confirm payment was received.
      </div>
    </div>
  </section>`
      : ""
  }

  <div class="footer">
    Invoisio · Privacy-first invoicing on Stellar
  </div>
</body>
</html>`;
}

// ─── export result type ───────────────────────────────────────────────────────

export type ExportResult =
  | { success: true; method: "text" | "pdf" }
  | { success: true; method: "text"; fallback: true } // pdf fell back to text
  | { success: false; error: ExportError };

export type ExportError =
  | "SHARE_DISMISSED"  // User dismissed the share sheet — not an error
  | "SHARE_UNAVAILABLE"
  | "PDF_RENDER_FAILED"
  | "UNKNOWN";

// ─── text share ───────────────────────────────────────────────────────────────

/**
 * Share the receipt as plain text using the native share sheet.
 * Works on every device without additional native modules.
 */
export async function shareReceiptAsText(
  invoice: Invoice,
): Promise<ExportResult> {
  try {
    const message = buildReceiptText(invoice);
    const title = `Receipt · ${invoice.invoiceNumber ?? invoice.id}`;

    const result = await Share.share({ message, title });

    if (result.action === Share.dismissedAction) {
      return { success: true, method: "text" }; // dismissed is not a failure
    }
    return { success: true, method: "text" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // iOS throws when the share sheet is not available (e.g. simulator)
    if (msg.includes("not available") || msg.includes("unsupported")) {
      return { success: false, error: "SHARE_UNAVAILABLE" };
    }
    return { success: false, error: "UNKNOWN" };
  }
}

// ─── PDF export ───────────────────────────────────────────────────────────────

/**
 * Export the receipt as a PDF via expo-print + expo-sharing.
 *
 * If the packages are not installed this function falls back gracefully to
 * `shareReceiptAsText` and resolves with `{ success: true, method: "text",
 * fallback: true }` so callers can optionally inform the user.
 *
 * Install the required packages with:
 *   npx expo install expo-print expo-sharing
 */
export async function exportReceiptAsPdf(
  invoice: Invoice,
): Promise<ExportResult> {
  // Dynamic import so the module is only required when actually called, and
  // the app does not crash if the packages haven't been installed yet.
  let Print: typeof import("expo-print") | undefined;
  let Sharing: typeof import("expo-sharing") | undefined;

  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    Print = await import("expo-print");
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    Sharing = await import("expo-sharing");
  } catch {
    // Packages not installed — fall back to text share
    return shareReceiptAsText(invoice).then((r) =>
      r.success ? { ...r, fallback: true as const } : r,
    );
  }

  try {
    const html = buildReceiptHtml(invoice);
    const { uri } = await Print.printToFileAsync({ html });

    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      // Device cannot share files — fall back to text share
      return shareReceiptAsText(invoice).then((r) =>
        r.success ? { ...r, fallback: true as const } : r,
      );
    }

    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: `Receipt · ${invoice.invoiceNumber ?? invoice.id}`,
      UTI: "com.adobe.pdf",
    });

    return { success: true, method: "pdf" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("render") || msg.includes("print")) {
      return { success: false, error: "PDF_RENDER_FAILED" };
    }
    return { success: false, error: "UNKNOWN" };
  }
}
