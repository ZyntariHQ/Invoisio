export class ActivityEventDto {
  id: string;
  invoiceId: string | null;
  type: string;
  description: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;

  constructor(data: {
    id: string;
    invoiceId: string | null;
    type: string;
    description: string;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
  }) {
    this.id = data.id;
    this.invoiceId = data.invoiceId;
    this.type = data.type;
    this.description = data.description;
    this.metadata = data.metadata;
    this.createdAt = data.createdAt.toISOString();
  }
}

export type ActivityEventType =
  | "invoice_created"
  | "invoice_updated"
  | "invoice_paid"
  | "invoice_partially_paid"
  | "invoice_overdue"
  | "invoice_cancelled"
  | "payment_received"
  | "reminder_sent"
  | "webhook_delivered"
  | "webhook_failed";

export interface PaginatedActivityEvents {
  items: ActivityEventDto[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
