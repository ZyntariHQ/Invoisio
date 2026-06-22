import { Invoice } from "./invoice.entity";

export class Payment {
  id: string;

  invoiceId: string;

  invoice?: Invoice;

  amount: string | number;

  txHash?: string | null;

  createdAt: Date;
}
