import { BadRequestException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { InvoicePdfService } from "./invoice-pdf.service";
import { InvoicesService } from "./invoices.service";
import { PrismaService } from "../prisma/prisma.service";

describe("InvoicePdfService", () => {
  let service: InvoicePdfService;

  const mockInvoicesService = {
    findOne: jest.fn(),
  };

  const mockPrisma = {
    merchant: {
      findUnique: jest.fn(),
    },
  };

  const paidInvoice = {
    id: "invoice-12345678",
    invoiceNumber: "INV-1001",
    clientName: "Acme Corp",
    clientEmail: "billing@acme.test",
    description: "Monthly design retainer",
    amount: 199.5,
    asset: "USDC",
    memo: "MEMO-1001",
    destination_address: "GDESTINATION",
    status: "paid",
    tx_hash: "tx-hash-123",
    createdAt: "2026-07-18T00:00:00.000Z",
    dueDate: "2026-08-18T00:00:00.000Z",
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicePdfService,
        { provide: InvoicesService, useValue: mockInvoicesService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<InvoicePdfService>(InvoicePdfService);
    mockPrisma.merchant.findUnique.mockResolvedValue({
      id: "merchant-1",
      name: "Acme Studio",
      preferredAsset: "USDC",
      stellarPublicKey: "GMERCHANT",
    });
  });

  it("generates an invoice PDF with a stable invoice filename", async () => {
    mockInvoicesService.findOne.mockResolvedValue({
      ...paidInvoice,
      status: "pending",
      tx_hash: undefined,
    });

    const result = await service.generateDocument(
      "invoice-12345678",
      "merchant-1",
      "invoice",
    );

    expect(result.filename).toBe("invoice-inv-1001.pdf");
    expect(result.buffer.toString("utf8", 0, 8)).toContain("%PDF-1.4");
    expect(result.buffer.toString("utf8")).toContain("Acme Studio");
    expect(result.buffer.toString("utf8")).toContain("Pending");
  });

  it("generates a receipt PDF with a stable receipt filename", async () => {
    mockInvoicesService.findOne.mockResolvedValue(paidInvoice);

    const result = await service.generateDocument(
      "invoice-12345678",
      "merchant-1",
      "receipt",
    );

    expect(result.filename).toBe("receipt-inv-1001.pdf");
    expect(result.buffer.toString("utf8")).toContain("Paid Receipt");
    expect(result.buffer.toString("utf8")).toContain("Payment Tx Hash");
  });

  it("rejects a receipt download for an unpaid invoice", async () => {
    mockInvoicesService.findOne.mockResolvedValue({
      ...paidInvoice,
      status: "pending",
      tx_hash: undefined,
    });

    await expect(
      service.generateDocument("invoice-12345678", "merchant-1", "receipt"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws when the merchant cannot be found", async () => {
    mockInvoicesService.findOne.mockResolvedValue(paidInvoice);
    mockPrisma.merchant.findUnique.mockResolvedValue(null);

    await expect(
      service.generateDocument("invoice-12345678", "merchant-1", "invoice"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
