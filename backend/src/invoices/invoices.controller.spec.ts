import { InvoicesController } from "./invoices.controller";
import { InvoicePdfService } from "./invoice-pdf.service";
import { Invoice } from "./entities/invoice.entity";

describe("InvoicesController PDF exports", () => {
  const invoice: Invoice = {
    id: "invoice-123",
    merchantId: "merchant-123",
    invoiceNumber: "INV-001",
    clientName: "Client Co",
    clientEmail: "ap@client.example",
    description: "Services",
    amount: 100,
    amountPaid: 100,
    amountDue: 0,
    asset_code: "USDC",
    memo: "123",
    memo_type: "ID",
    status: "paid",
  };

  const invoicesService = {
    findOne: jest.fn().mockResolvedValue(invoice),
  };

  const prisma = {
    runWithMerchantScope: jest
      .fn()
      .mockImplementation(
        (_merchantId: string, callback: () => Promise<Invoice>) => callback(),
      ),
  };

  const pdfService = {
    createInvoiceExport: jest.fn().mockReturnValue({
      filename: "invoice-INV-001.pdf",
      buffer: Buffer.from("%PDF-1.4 invoice"),
    }),
    createReceipt: jest.fn().mockReturnValue({
      filename: "receipt-INV-001.pdf",
      buffer: Buffer.from("%PDF-1.4 receipt"),
    }),
  };

  let controller: InvoicesController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new InvoicesController(
      invoicesService as any,
      prisma as any,
      pdfService as unknown as InvoicePdfService,
    );
  });

  it("returns a merchant-scoped invoice PDF download", async () => {
    const response = { setHeader: jest.fn() };

    const buffer = await controller.exportInvoicePdf(
      {
        id: "user-123",
        merchantId: "merchant-123",
        publicKey: "G",
        isAdmin: false,
      },
      "invoice-123",
      response as any,
    );

    expect(prisma.runWithMerchantScope).toHaveBeenCalledWith(
      "merchant-123",
      expect.any(Function),
    );
    expect(invoicesService.findOne).toHaveBeenCalledWith(
      "invoice-123",
      "merchant-123",
    );
    expect(pdfService.createInvoiceExport).toHaveBeenCalledWith(invoice);
    expect(buffer.toString()).toContain("%PDF-1.4");
    expect(response.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "application/pdf",
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      'attachment; filename="invoice-INV-001.pdf"',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "private, no-store",
    );
  });

  it("returns a merchant-scoped receipt PDF download", async () => {
    const response = { setHeader: jest.fn() };

    const buffer = await controller.exportReceiptPdf(
      {
        id: "user-123",
        merchantId: "merchant-123",
        publicKey: "G",
        isAdmin: false,
      },
      "invoice-123",
      response as any,
    );

    expect(pdfService.createReceipt).toHaveBeenCalledWith(invoice);
    expect(buffer.toString()).toContain("%PDF-1.4");
    expect(response.setHeader).toHaveBeenCalledWith(
      "Content-Disposition",
      'attachment; filename="receipt-INV-001.pdf"',
    );
  });
});
