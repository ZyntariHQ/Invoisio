import type { Invoice } from "@prisma/client";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function buildPaymentRequestEmail(invoice: Invoice, appBaseUrl: string) {
  const invoiceUrl = `${trimTrailingSlash(appBaseUrl)}/invoices/${invoice.id}`;
  const amount = invoice.amount.toString();
  const assetCode = invoice.assetCode;
  const destinationAddress = invoice.destinationAddress;
  const subject = `Payment request for invoice ${invoice.invoiceNumber}`;

  const text = [
    `Hello ${invoice.clientName},`,
    "",
    "You have received a payment request from Invoisio.",
    "",
    `Invoice: ${invoice.invoiceNumber}`,
    `Amount: ${amount} ${assetCode}`,
    `Memo: ${invoice.memo}`,
    `Payment link: ${invoiceUrl}`,
    destinationAddress ? `Destination address: ${destinationAddress}` : "",
    "",
    "Please use the invoice link to view the full payment instructions.",
  ]
    .filter(Boolean)
    .join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827; max-width: 640px; margin: 0 auto;">
      <h2 style="color: #111827; margin-bottom: 8px;">Invoisio payment request</h2>
      <p>Hello ${escapeHtml(invoice.clientName)},</p>
      <p>You have received a payment request. Use the details below to complete payment.</p>

      <div style="border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin: 20px 0; background: #f9fafb;">
        <p style="margin: 6px 0;"><strong>Invoice:</strong> ${escapeHtml(invoice.invoiceNumber)}</p>
        <p style="margin: 6px 0;"><strong>Amount:</strong> ${escapeHtml(amount)} ${escapeHtml(assetCode)}</p>
        <p style="margin: 6px 0;"><strong>Memo:</strong> ${escapeHtml(invoice.memo)}</p>
        <p style="margin: 6px 0;"><strong>Destination:</strong> ${escapeHtml(destinationAddress)}</p>
      </div>

      <p>
        <a href="${escapeHtml(invoiceUrl)}"
           style="display: inline-block; background: #111827; color: #ffffff; padding: 12px 18px; border-radius: 8px; text-decoration: none; font-weight: 600;">
          View and pay invoice
        </a>
      </p>

      <p style="font-size: 13px; color: #6b7280;">
        If the button does not work, open this link: ${escapeHtml(invoiceUrl)}
      </p>
    </div>
  `;

  return {
    subject,
    html,
    text,
  };
}
