export type NotificationEventType =
  | "invoice.paid"
  | "invoice.overdue"
  | "invoice.reminder"
  | "payment.received"
  | "payment.review_flagged";

interface BaseNotificationPayload {
  [key: string]: unknown;
  type: NotificationEventType;
  deepLink: string;
}

export interface InvoicePaidPayload extends BaseNotificationPayload {
  type: "invoice.paid";
  invoiceId: string;
  invoiceNumber: string;
}

export interface InvoiceOverduePayload extends BaseNotificationPayload {
  type: "invoice.overdue";
  invoiceId: string;
  invoiceNumber: string;
}

export interface InvoiceReminderPayload extends BaseNotificationPayload {
  type: "invoice.reminder";
  invoiceId: string;
  invoiceNumber: string;
}

export interface PaymentReceivedPayload extends BaseNotificationPayload {
  type: "payment.received";
  paymentId: string;
  invoiceId: string;
}

export interface PaymentReviewFlaggedPayload extends BaseNotificationPayload {
  type: "payment.review_flagged";
  reviewId: string;
  invoiceId?: string | null;
}

export type NotificationPayload =
  | InvoicePaidPayload
  | InvoiceOverduePayload
  | InvoiceReminderPayload
  | PaymentReceivedPayload
  | PaymentReviewFlaggedPayload;
