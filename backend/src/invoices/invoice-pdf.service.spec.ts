import { InvoicePdfService } from "./invoice-pdf.service";
import { Invoice } from "./entities/invoice.entity";

describe("InvoicePdfService", () => {
  const service = new InvoicePdfService();

  const baseInvoice: Invoice = {
    id: "invoice-123",
    merchantId: "merchant-123",
    merchant: {
      id: "merchant-123",
      name: "Acme Billing",
      stellarPublicKey:
        "GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      payoutPublicKey: null,
      preferredAsset: "USDC",
    },
    invoiceNumber: "INV/2026 001",
    clientName: "Client Co",
    clientEmail: "ap@client.example",
    description: "Integration services",
    amount: 2500,
    amountPaid: 0,
    amountDue: 2500,
    asset_code: "USDC",
    asset_issuer: null,
    memo: "123456789",
    memo_type: "ID",
    tx_hash: null,
    status: "pending",
    destination_address:
      "GDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    createdAt: new Date("2026-07-01T10:00:00Z"),
    updatedAt: new Date("2026-07-02T10:00:00Z"),
    dueDate: new Date("2026-07-31T23:59:59Z"),
    statusHistory: [
      {
        id: "hist-1",
        invoiceId: "invoice-123",
        status: "pending",
        createdAt: new Date("2026-07-01T10:00:00Z"),
      },
    ],
    payments: [],
  };

  it("renders a valid invoice PDF with a stable sanitized filename", () => {
    const document = service.createInvoiceExport(baseInvoice);
    const pdf = document.buffer.toString("utf8");

    expect(document.filename).toBe("invoice-INV-2026-001.pdf");
    expect(document.buffer.subarray(0, 8).toString()).toBe("%PDF-1.4");
    expect(pdf).toContain("Invoice Export");
    expect(pdf).toContain("Merchant: Acme Billing");
    expect(pdf).toContain("Status: pending");
    expect(pdf).toContain("Unpaid or pending");
  });

  it("renders paid receipt content and payment rows", () => {
    const paidInvoice: Invoice = {
      ...baseInvoice,
      status: "paid",
      amountPaid: 2500,
      amountDue: 0,
      tx_hash: "tx-paid",
      payments: [
        {
          id: "payment-1",
          amount: 2500,
          txHash: "tx-paid",
          createdAt: new Date("2026-07-03T11:00:00Z"),
        },
      ],
      statusHistory: [
        ...(baseInvoice.statusHistory ?? []),
        {
          id: "hist-2",
          invoiceId: "invoice-123",
          status: "paid",
          createdAt: new Date("2026-07-03T11:00:00Z"),
        },
      ],
    };

    const document = service.createReceipt(paidInvoice);
    const pdf = document.buffer.toString("utf8");

    expect(document.filename).toBe("receipt-INV-2026-001.pdf");
    expect(pdf).toContain("Payment Receipt");
    expect(pdf).toContain("Paid in full");
    expect(pdf).toContain("tx-paid");
  });
});
