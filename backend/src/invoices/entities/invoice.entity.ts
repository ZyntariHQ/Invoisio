import { User } from "../../users/user.entity";

export enum InvoiceStatus {
  pending = "pending",
  paid = "paid",
  partially_paid = "partially_paid",
  partial = "partial",
  expired = "expired",
  cancelled = "cancelled",
}

export enum StellarMemoType {
  TEXT = "TEXT",
  ID = "ID",
  HASH = "HASH",
}

export class Invoice {
  id: string;

  merchantId?: string;

  user?: User | null;

  invoiceNumber?: string | null;

  clientName: string;

  clientEmail?: string | null;

  description?: string | null;

  amount: string | number;

  amountPaid?: string | number;

  amountDue?: string | number;

  asset_code: string;

  asset_issuer?: string | null;

  memo: string;

  memo_type: StellarMemoType | string;

  tx_hash?: string | null;

  status: InvoiceStatus | string;

  metadata?: any;

  createdAt?: Date;

  updatedAt?: Date;

  dueDate?: Date | null;

  // Not persisted in DB — added at runtime for compatibility with existing DTOs
  destination_address?: string;

  customerId?: string | null;

  statusHistory?: InvoiceStatusHistory[];

  payments?: any[]; // using any[] to avoid circular dependency or add Payment[] if imported
}

export class InvoiceStatusHistory {
  id: string;
  invoiceId: string;
  status: string;
  createdAt: Date;
}
