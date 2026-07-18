import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InvoicesService } from "./invoices.service";
import { PrismaService } from "../prisma/prisma.service";

type InvoicePdfVariant = "invoice" | "receipt";

interface GeneratedInvoicePdf {
  buffer: Buffer;
  filename: string;
}

interface PdfLine {
  text: string;
  x: number;
  y: number;
  size?: number;
  color?: [number, number, number];
}

@Injectable()
export class InvoicePdfService {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly prisma: PrismaService,
  ) {}

  async generateDocument(
    invoiceId: string,
    merchantId: string,
    variant: InvoicePdfVariant,
  ): Promise<GeneratedInvoicePdf> {
    const [invoice, merchant] = await Promise.all([
      this.invoicesService.findOne(invoiceId, merchantId),
      this.prisma.merchant.findUnique({
        where: { id: merchantId },
        select: { id: true, name: true, preferredAsset: true, stellarPublicKey: true },
      }),
    ]);

    if (!merchant) {
      throw new NotFoundException("Merchant not found");
    }

    if (variant === "receipt" && invoice.status !== "paid") {
      throw new BadRequestException(
        "A receipt PDF is only available for paid invoices",
      );
    }

    const filenameBase = this.slugify(
      invoice.invoiceNumber || `invoice-${invoice.id.slice(0, 8)}`,
    );
    const filename =
      variant === "receipt"
        ? `receipt-${filenameBase}.pdf`
        : `invoice-${filenameBase}.pdf`;

    const buffer = this.renderPdf({
      merchantName: merchant.name,
      merchantPreferredAsset: merchant.preferredAsset,
      documentTitle: variant === "receipt" ? "Paid Receipt" : "Invoice",
      documentSubtitle:
        variant === "receipt"
          ? "Payment confirmation for a settled invoice"
          : "Invoice ready for merchant delivery",
      invoice,
    });

    return { buffer, filename };
  }

  private renderPdf(input: {
    merchantName: string;
    merchantPreferredAsset: string;
    documentTitle: string;
    documentSubtitle: string;
    invoice: Awaited<ReturnType<InvoicesService["findOne"]>>;
  }): Buffer {
    const { merchantName, merchantPreferredAsset, documentTitle, documentSubtitle, invoice } = input;
    const issuedOn = this.formatDate(invoice.createdAt);
    const dueOn = this.formatDate(invoice.dueDate ?? undefined);
    const amount = this.formatAmount(invoice.amount);
    const status = this.toTitleCase(invoice.status);
    const documentNumber = invoice.invoiceNumber || invoice.id;
    const accent: [number, number, number] = [0.16, 0.36, 0.86];
    const muted: [number, number, number] = [0.35, 0.39, 0.47];
    const dark: [number, number, number] = [0.11, 0.13, 0.18];

    const lines: PdfLine[] = [
      {
        text: merchantName,
        x: 72,
        y: 742,
        size: 24,
        color: [1, 1, 1],
      },
      {
        text: "Invoisio merchant document",
        x: 72,
        y: 722,
        size: 11,
        color: [0.88, 0.92, 1],
      },
      {
        text: documentTitle,
        x: 72,
        y: 670,
        size: 22,
        color: dark,
      },
      {
        text: documentSubtitle,
        x: 72,
        y: 648,
        size: 11,
        color: muted,
      },
      {
        text: `Document No: ${documentNumber}`,
        x: 72,
        y: 612,
        size: 12,
      },
      {
        text: `Status: ${status}`,
        x: 72,
        y: 592,
        size: 12,
      },
      {
        text: `Memo: ${invoice.memo}`,
        x: 72,
        y: 572,
        size: 12,
      },
      {
        text: `Issued: ${issuedOn}`,
        x: 72,
        y: 552,
        size: 12,
      },
      {
        text: `Due: ${dueOn}`,
        x: 72,
        y: 532,
        size: 12,
      },
      {
        text: `Client: ${invoice.clientName}`,
        x: 72,
        y: 500,
        size: 12,
      },
    ];

    if (invoice.clientEmail) {
      lines.push({
        text: `Client Email: ${invoice.clientEmail}`,
        x: 72,
        y: 480,
        size: 12,
      });
    }

    const amountY = invoice.clientEmail ? 440 : 460;
    const asset = invoice.asset_code || merchantPreferredAsset;

    lines.push(
      {
        text: "Amount Due",
        x: 72,
        y: amountY,
        size: 11,
        color: muted,
      },
      {
        text: `${amount} ${asset}`,
        x: 72,
        y: amountY - 24,
        size: 20,
        color: accent,
      },
      {
        text: `Payment Asset: ${asset}`,
        x: 72,
        y: amountY - 52,
        size: 12,
      },
    );

    if (invoice.description) {
      let descriptionY = amountY - 96;
      lines.push({
        text: "Description",
        x: 72,
        y: descriptionY,
        size: 11,
        color: muted,
      });
      descriptionY -= 18;
      for (const line of this.wrapText(invoice.description, 70)) {
        lines.push({
          text: line,
          x: 72,
          y: descriptionY,
          size: 12,
          color: dark,
        });
        descriptionY -= 18;
      }
    }

    const footerLines = [
      `Destination: ${invoice.destination_address}`,
      invoice.tx_hash ? `Payment Tx Hash: ${invoice.tx_hash}` : null,
      `Generated for ${merchantName} with status ${status}`,
    ].filter((entry): entry is string => Boolean(entry));

    let footerY = 164;
    for (const entry of footerLines) {
      for (const line of this.wrapText(entry, 74)) {
        lines.push({
          text: line,
          x: 72,
          y: footerY,
          size: 10,
          color: muted,
        });
        footerY -= 16;
      }
    }

    const content = this.buildContentStream(lines, accent);
    return this.buildPdf(content);
  }

  private buildContentStream(
    lines: PdfLine[],
    accent: [number, number, number],
  ): string {
    const commands: string[] = [
      `${accent[0].toFixed(3)} ${accent[1].toFixed(3)} ${accent[2].toFixed(3)} rg`,
      "0 700 612 92 re f",
      "0.92 0.95 1 rg",
      "72 434 200 60 re f",
      "0.95 0.96 0.98 rg",
      "72 212 468 1 re f",
    ];

    for (const line of lines) {
      const size = line.size ?? 12;
      const [r, g, b] = line.color ?? [0.11, 0.13, 0.18];
      commands.push(
        "BT",
        `/F1 ${size} Tf`,
        `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`,
        `1 0 0 1 ${line.x} ${line.y} Tm`,
        `(${this.escapePdfText(line.text)}) Tj`,
        "ET",
      );
    }

    return commands.join("\n");
  }

  private buildPdf(content: string): Buffer {
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
      `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ];

    let pdf = "%PDF-1.4\n";
    const offsets: number[] = [0];

    for (let index = 0; index < objects.length; index++) {
      offsets.push(Buffer.byteLength(pdf, "utf8"));
      pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
    }

    const xrefOffset = Buffer.byteLength(pdf, "utf8");
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += "0000000000 65535 f \n";
    for (let index = 1; index < offsets.length; index++) {
      pdf += `${offsets[index].toString().padStart(10, "0")} 00000 n \n`;
    }
    pdf +=
      `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

    return Buffer.from(pdf, "utf8");
  }

  private escapePdfText(text: string): string {
    return text
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)")
      .replace(/\r?\n/g, " ");
  }

  private wrapText(text: string, maxCharsPerLine: number): string[] {
    const words = text.trim().split(/\s+/);
    const lines: string[] = [];
    let current = "";

    for (const word of words) {
      const candidate = current.length === 0 ? word : `${current} ${word}`;
      if (candidate.length <= maxCharsPerLine) {
        current = candidate;
      } else {
        if (current.length > 0) {
          lines.push(current);
        }
        current = word;
      }
    }

    if (current.length > 0) {
      lines.push(current);
    }

    return lines.length > 0 ? lines : [text];
  }

  private formatAmount(value: string | number): string {
    const numericValue =
      typeof value === "number" ? value : Number.parseFloat(String(value));
    if (Number.isNaN(numericValue)) {
      return String(value);
    }

    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numericValue);
  }

  private formatDate(value?: string | Date): string {
    if (!value) {
      return "Not specified";
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "Not specified";
    }

    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  private toTitleCase(value: string): string {
    return value
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  private slugify(value: string): string {
    const cleaned = value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return cleaned.length > 0 ? cleaned : "invoice";
  }
}
