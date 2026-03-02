/**
 * Invoice entity representing a payment request
 * Used for Stellar payment matching via memo field
 */
export class Invoice {
  /** Unique identifier (UUID) */
  id: string;

  /** Human-readable invoice number (e.g., "INV-001") */
  invoiceNumber: string;

  /** Client name */
  clientName: string;

  /** Client email address */
  clientEmail: string;

  /** Invoice description or notes */
  description: string;

  /** Payment amount */
  amount: number;

  /** Asset code for payment: 'XLM' or 'USDC' */
  asset: "XLM" | "USDC";

  /**
   * Stellar memo for payment matching
   * Format: {MEMO_PREFIX}{invoiceId} (e.g., "invoisio-abc123")
   */
  memo: string;

  /**
   * Invoice status
   * - pending: Awaiting payment
   * - paid: Payment received and confirmed
   * - overdue: Past due date without payment
   * - cancelled: Invoice cancelled by merchant
   */
  status: "pending" | "paid" | "overdue" | "cancelled";

  /** Destination Stellar public key for payment */
  destination: string;

  /** Invoice creation timestamp */
  createdAt: Date;

  /** Last update timestamp */
  updatedAt: Date;

  /** Optional due date for the invoice */
  dueDate?: Date;
}
