/**
 * CSV export utilities for invoice data.
 *
 * Exports are built entirely client-side using native browser APIs — no
 * external library required.  The helpers follow RFC 4180 quoting rules so
 * the output is compatible with Excel, Google Sheets, and every standard
 * spreadsheet app.
 */

export interface InvoiceCsvRow {
  id: string;
  invoiceNumber?: string;
  clientName: string;
  clientEmail?: string;
  amount: number;
  asset: string;
  status: string;
  createdAt: string;
  dueDate?: string;
}

/** Maximum rows we will export in a single file without a user warning. */
export const CSV_EXPORT_SOFT_LIMIT = 500;

/**
 * Hard upper-bound for a single export.  Beyond this the file can become
 * unwieldy inside the browser and the user should be directed to a server-
 * side export instead.
 */
export const CSV_EXPORT_HARD_LIMIT = 5000;

/** Column headers in the order they appear in the CSV output. */
const HEADERS: readonly string[] = [
  "Invoice Number",
  "Client Name",
  "Client Email",
  "Amount",
  "Asset",
  "Status",
  "Created At",
  "Due Date",
  "Invoice ID",
];

/**
 * Escape a single cell value per RFC 4180:
 * - Wrap in double-quotes if the value contains a comma, double-quote, or
 *   newline character.
 * - Escape internal double-quotes by doubling them.
 */
function escapeCell(value: string | number | null | undefined): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert an array of invoice rows to a CSV string.
 *
 * The first line is a header row.  Dates are kept in ISO-8601 format so they
 * parse correctly in any locale.
 */
export function invoicesToCsv(invoices: InvoiceCsvRow[]): string {
  const lines: string[] = [];

  // Header row
  lines.push(HEADERS.map(escapeCell).join(","));

  // Data rows
  for (const inv of invoices) {
    const row: (string | number | null | undefined)[] = [
      inv.invoiceNumber || `#${inv.id.slice(0, 8)}`,
      inv.clientName,
      inv.clientEmail ?? "",
      inv.amount,
      inv.asset,
      inv.status,
      inv.createdAt,
      inv.dueDate ?? "",
      inv.id,
    ];
    lines.push(row.map(escapeCell).join(","));
  }

  // RFC 4180 requires CRLF line endings; many tools accept LF as well.
  return lines.join("\r\n");
}

/**
 * Trigger a browser file download for the given CSV content.
 *
 * @param csvContent   Raw CSV string to download.
 * @param filename     Suggested filename (should end in `.csv`).
 */
export function downloadCsv(csvContent: string, filename: string): void {
  // Prepend BOM (U+FEFF) so Excel opens UTF-8 files correctly.
  const bom = "\uFEFF";
  const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  // Append to the DOM briefly so Firefox triggers the download correctly.
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  // Release the object URL to free memory.
  URL.revokeObjectURL(url);
}

/**
 * Build a timestamped filename for the export.
 *
 * @param prefix   Short label, e.g. "invoices" or "invoices-pending".
 */
export function buildExportFilename(prefix = "invoices"): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${prefix}-${ts}.csv`;
}

/**
 * Result returned by {@link exportInvoicesToCsv}.
 */
export interface ExportResult {
  /** Number of rows written to the file. */
  exported: number;
  /** Total rows in the filtered set before any hard limit was applied. */
  total: number;
  /**
   * True when the total exceeded {@link CSV_EXPORT_HARD_LIMIT} and the file
   * was truncated.
   */
  truncated: boolean;
}

/**
 * Full pipeline: convert filtered invoices → CSV → download.
 *
 * Applies the hard limit and returns metadata so the UI can show an
 * appropriate notice when truncation occurred.
 *
 * @param invoices   The already-filtered invoice list.
 * @param filenamePrefix   Optional prefix for the downloaded file's name.
 */
export function exportInvoicesToCsv(
  invoices: InvoiceCsvRow[],
  filenamePrefix = "invoices",
): ExportResult {
  const total = invoices.length;
  const truncated = total > CSV_EXPORT_HARD_LIMIT;
  const rows = truncated ? invoices.slice(0, CSV_EXPORT_HARD_LIMIT) : invoices;

  const csv = invoicesToCsv(rows);
  downloadCsv(csv, buildExportFilename(filenamePrefix));

  return { exported: rows.length, total, truncated };
}
