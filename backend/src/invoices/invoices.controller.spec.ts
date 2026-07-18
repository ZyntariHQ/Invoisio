import { StreamableFile } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { InvoicesController } from "./invoices.controller";
import { InvoicesService } from "./invoices.service";
import { InvoicePdfService } from "./invoice-pdf.service";
import { PrismaService } from "../prisma/prisma.service";

describe("InvoicesController", () => {
  let controller: InvoicesController;

  const mockInvoicesService = {};

  const mockInvoicePdfService = {
    generateDocument: jest.fn(),
  };

  const mockPrisma = {
    runWithMerchantScope: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.runWithMerchantScope.mockImplementation(
      async (_merchantId: string, callback: () => Promise<unknown>) =>
        callback(),
    );

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvoicesController],
      providers: [
        { provide: InvoicesService, useValue: mockInvoicesService },
        { provide: InvoicePdfService, useValue: mockInvoicePdfService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    controller = module.get<InvoicesController>(InvoicesController);
  });

  it("returns a downloadable invoice PDF with a stable filename header", async () => {
    mockInvoicePdfService.generateDocument.mockResolvedValue({
      filename: "invoice-inv-1001.pdf",
      buffer: Buffer.from("%PDF-1.4"),
    });

    const response = {
      setHeader: jest.fn(),
    } as any;

    const file = await controller.downloadInvoicePdf(
      { merchantId: "merchant-1" } as any,
      "invoice-1",
      response,
    );

    expect(mockPrisma.runWithMerchantScope).toHaveBeenCalledWith(
      "merchant-1",
      expect.any(Function),
    );
    expect(mockInvoicePdfService.generateDocument).toHaveBeenCalledWith(
      "invoice-1",
      "merchant-1",
      "invoice",
    );
    expect(response.setHeader).toHaveBeenNthCalledWith(
      1,
      "Content-Type",
      "application/pdf",
    );
    expect(response.setHeader).toHaveBeenNthCalledWith(
      2,
      "Content-Disposition",
      'attachment; filename="invoice-inv-1001.pdf"',
    );
    expect(file).toBeInstanceOf(StreamableFile);
  });

  it("returns a downloadable receipt PDF with a stable filename header", async () => {
    mockInvoicePdfService.generateDocument.mockResolvedValue({
      filename: "receipt-inv-1001.pdf",
      buffer: Buffer.from("%PDF-1.4"),
    });

    const response = {
      setHeader: jest.fn(),
    } as any;

    const file = await controller.downloadReceiptPdf(
      { merchantId: "merchant-1" } as any,
      "invoice-1",
      response,
    );

    expect(mockInvoicePdfService.generateDocument).toHaveBeenCalledWith(
      "invoice-1",
      "merchant-1",
      "receipt",
    );
    expect(response.setHeader).toHaveBeenNthCalledWith(
      2,
      "Content-Disposition",
      'attachment; filename="receipt-inv-1001.pdf"',
    );
    expect(file).toBeInstanceOf(StreamableFile);
  });
});
