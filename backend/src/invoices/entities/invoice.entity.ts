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

  /** Stellar asset code (e.g. 'XLM', 'USDC') */
  asset_code: string;

  /** Issuing account for the asset; undefined for native XLM */
  asset_issuer?: string;

  /**
   * Stellar memo for payment matching.
   * Stored as the string representation of a uint64 integer.
   */
  memo: string;

  /**
   * Stellar memo type.
   * 'ID' — numeric uint64 memo, unambiguously maps to exactly one invoice.
   */
  memo_type: "ID";

  /**
   * Invoice status
   * - pending: Awaiting payment
   * - paid: Payment received and confirmed
   * - overdue: Past due date without payment
   * - cancelled: Invoice cancelled by merchant
   */
  status: "pending" | "paid" | "overdue" | "cancelled";

  /** Platform's collection wallet — the Stellar public key payments must be sent to */
  destination_address: string;

  /** Invoice creation timestamp */
  createdAt: Date;

  /** Last update timestamp */
  updatedAt: Date;

  /** Optional due date for the invoice */
  dueDate?: Date;
}
