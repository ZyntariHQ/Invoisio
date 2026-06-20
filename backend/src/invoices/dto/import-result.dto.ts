/**
 * Per-row error detail for a CSV import (validation failure or DB write failure)
 */
export interface ImportRowError {
  row: number;
  field?: string;
  message: string;
}

export interface ImportedRow {
  row: number;
  id: string;
  invoiceNumber: string;
}

/**
 * Summary returned from a CSV bulk invoice import
 */
export class ImportSummaryDto {
  totalRows: number;
  createdCount: number;
  failedCount: number;
  skippedCount: number;
  created: ImportedRow[];
  failed: ImportRowError[];
  skipped: ImportRowError[];
}
