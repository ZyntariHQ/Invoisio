export class InvoicePaidEvent {
  constructor(
    public readonly invoiceId: string,
    public readonly txHash: string,
    public readonly memo: string,
    public readonly amount: string,
    public readonly asset: string,
    public readonly paidAt: Date = new Date(),
  ) {}
}
