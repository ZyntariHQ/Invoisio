import { Injectable } from "@nestjs/common";
import { Invoice } from "./entities/invoice.entity";

export type InvoicePdfKind = "invoice" | "receipt";

export interface InvoicePdfDocument {
  filename: string;
  buffer: Buffer;
}

@Injectable()
export class InvoicePdfService {
  createInvoiceExport(invoice: Invoice): InvoicePdfDocument {
    return this.createDocument(invoice, "invoice");
  }

  createReceipt(invoice: Invoice): InvoicePdfDocument {
    return this.createDocument(invoice, "receipt");
  }

  private createDocument(
    invoice: Invoice,
    kind: InvoicePdfKind,
  ): InvoicePdfDocument {
    const invoiceNumber = invoice.invoiceNumber || invoice.id;
    const filenamePrefix = kind === "invoice" ? "invoice" : "receipt";
    const title = kind === "invoice" ? "Invoice Export" : "Payment Receipt";
    const merchantName = invoice.merchant?.name || "Invoisio Merchant";
    const amount = this.formatMoney(invoice.amount, invoice.asset_code);
    const amountPaid = this.formatMoney(
      invoice.amountPaid ?? 0,
      invoice.asset_code,
    );
    const amountDue = this.formatMoney(
      invoice.amountDue ?? 0,
      invoice.asset_code,
    );

    const lines = [
      title,
      `Merchant: ${merchantName}`,
      `Invoice number: ${invoiceNumber}`,
      `Invoice ID: ${invoice.id}`,
      `Client: ${invoice.clientName}`,
      `Client email: ${invoice.clientEmail || "n/a"}`,
      `Status: ${invoice.status}`,
      `Amount: ${amount}`,
      `Amount paid: ${amountPaid}`,
      `Amount due: ${amountDue}`,
      `Asset: ${invoice.asset_code}`,
      `Memo: ${invoice.memo}`,
      `Destination: ${invoice.destination_address || "n/a"}`,
      `Merchant Stellar key: ${invoice.merchant?.stellarPublicKey || "n/a"}`,
      `Preferred merchant asset: ${invoice.merchant?.preferredAsset || "n/a"}`,
      `Due date: ${this.formatDate(invoice.dueDate)}`,
      `Created: ${this.formatDate(invoice.createdAt)}`,
      `Updated: ${this.formatDate(invoice.updatedAt)}`,
      `Transaction hash: ${invoice.tx_hash || "n/a"}`,
      `Soroban transaction: ${(invoice as any).sorobanTxHash || "n/a"}`,
      "",
      "Description",
      invoice.description || "n/a",
      "",
      "Payment status",
      this.paymentSummary(invoice),
      "",
      "Status history",
      ...this.statusHistoryLines(invoice),
      "",
      "Payments",
      ...this.paymentLines(invoice),
    ];

    return {
      filename: `${filenamePrefix}-${this.safeFilename(invoiceNumber)}.pdf`,
      buffer: this.renderPdf(lines),
    };
  }

  private formatMoney(
    value: string | number | undefined,
    asset: string,
  ): string {
    const numeric = Number(value ?? 0);
    if (Number.isFinite(numeric)) {
      return `${numeric.toFixed(7).replace(/\.?0+$/, "")} ${asset}`;
    }
    return `${String(value ?? 0)} ${asset}`;
  }

  private formatDate(value: Date | string | null | undefined): string {
    if (!value) return "n/a";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "n/a";
    return date.toISOString();
  }

  private paymentSummary(invoice: Invoice): string {
    if (invoice.status === "paid") {
      return "Paid in full";
    }
    if (invoice.status === "partially_paid" || invoice.status === "partial") {
      return "Partially paid";
    }
    return "Unpaid or pending";
  }

  private statusHistoryLines(invoice: Invoice): string[] {
    if (!invoice.statusHistory || invoice.statusHistory.length === 0) {
      return ["No status history recorded"];
    }
    return invoice.statusHistory.map(
      (entry) => `${this.formatDate(entry.createdAt)} - ${entry.status}`,
    );
  }

  private paymentLines(invoice: Invoice): string[] {
    if (!invoice.payments || invoice.payments.length === 0) {
      return ["No payments recorded"];
    }
    return invoice.payments.map((payment) => {
      const amount = this.formatMoney(payment.amount, invoice.asset_code);
      return `${this.formatDate(payment.createdAt)} - ${amount} - ${
        payment.txHash || "no tx hash"
      }`;
    });
  }

  private safeFilename(value: string): string {
    const safe = value
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
    return safe || "invoice";
  }

  private renderPdf(lines: string[]): Buffer {
    const wrappedLines = lines.flatMap((line) => this.wrapLine(line, 86));
    const content = this.buildPageContent(wrappedLines);
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      `<< /Length ${Buffer.byteLength(
        content,
        "utf8",
      )} >>\nstream\n${content}\nendstream`,
    ];

    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    for (let index = 0; index < objects.length; index++) {
      offsets.push(Buffer.byteLength(pdf, "utf8"));
      pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
    }

    const xrefOffset = Buffer.byteLength(pdf, "utf8");
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += "0000000000 65535 f \n";
    for (let index = 1; index < offsets.length; index++) {
      pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
    }
    pdf += `trailer\n<< /Size ${
      objects.length + 1
    } /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    return Buffer.from(pdf, "utf8");
  }

  private buildPageContent(lines: string[]): string {
    const printableLines = lines.slice(0, 48);
    const content = ["BT", "/F1 11 Tf", "72 740 Td", "14 TL"];
    printableLines.forEach((line, index) => {
      if (index > 0) {
        content.push("T*");
      }
      const safeLine = line.replace(/[^\x20-\x7E]/g, "?");
      content.push(`(${this.escapePdfText(safeLine)}) Tj`);
    });
    content.push("ET");
    return content.join("\n");
  }

  private wrapLine(line: string, width: number): string[] {
    if (line.length <= width) return [line];
    const result: string[] = [];
    let remaining = line;
    while (remaining.length > width) {
      let breakAt = remaining.lastIndexOf(" ", width);
      if (breakAt <= 0) breakAt = width;
      result.push(remaining.slice(0, breakAt));
      remaining = remaining.slice(breakAt).trimStart();
    }
    if (remaining.length > 0) result.push(remaining);
    return result;
  }

  private escapePdfText(value: string): string {
    return value
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");
  }
}
