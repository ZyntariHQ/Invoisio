/**
 * Response DTO for customer detail summary.
 *
 * Provides business metrics that power customer detail pages
 * without requiring expensive client-side aggregation.
 */
export class CustomerSummaryDto {
  /** Unique customer identifier. */
  id: string;

  /** Customer display name. */
  name: string;

  /** Customer email (null if not set). */
  email: string | null;

  /** Total number of invoices for this customer. */
  invoiceCount: number;

  /** Total amount of fully paid invoices. */
  paidVolume: number;

  /** Outstanding balance across pending, partially_paid, and overdue invoices. */
  outstandingBalance: number;

  /** Outstanding balance for overdue invoices only. */
  overdueBalance: number;

  /** Most recent invoices for this customer (bounded list). */
  recentInvoices: CustomerRecentInvoice[];
}

/**
 * Abbreviated invoice for the recent-activity list.
 */
export class CustomerRecentInvoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  status: string;
  createdAt: Date;
}
