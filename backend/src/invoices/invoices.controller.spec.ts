import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { InvoicesController } from "./invoices.controller";
import { InvoicesService } from "./invoices.service";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentReviewsService } from "./payment-reviews.service";
import { DraftService } from "./draft.service";

/**
 * Covers the one unauthenticated route on this controller —
 * GET /invoices/public/:id — and the data-exposure boundary it must
 * enforce. See InvoicesService.findPublicInvoice for the status allowlist
 * this route relies on (#438).
 */
describe("InvoicesController — public invoice route", () => {
  let controller: InvoicesController;
  let invoicesService: { findPublicInvoice: jest.Mock };

  beforeEach(async () => {
    invoicesService = {
      findPublicInvoice: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InvoicesController],
      providers: [
        { provide: InvoicesService, useValue: invoicesService },
        { provide: PrismaService, useValue: {} },
        { provide: PaymentReviewsService, useValue: {} },
        { provide: DraftService, useValue: {} },
      ],
    }).compile();

    controller = module.get<InvoicesController>(InvoicesController);
  });

  it("returns the invoice when the service resolves a publicly-safe status", async () => {
    const payload = {
      id: "invoice-1",
      merchantName: "Acme",
      amount: "100",
      asset_code: "XLM",
      memo: "1001",
      destination_address: "GABC",
      status: "pending",
      createdAt: new Date().toISOString(),
    };
    invoicesService.findPublicInvoice.mockResolvedValue(payload);

    const result = await controller.findPublicInvoice("invoice-1");

    expect(result).toEqual(payload);
    expect(invoicesService.findPublicInvoice).toHaveBeenCalledWith("invoice-1");
  });

  it("throws a generic BadRequestException for a draft invoice, not a status-specific error", async () => {
    // The service returns null for draft/cancelled/unknown IDs alike — the
    // controller must not distinguish between them in its response, so a
    // leaked draft UUID can't be used to confirm the invoice exists.
    invoicesService.findPublicInvoice.mockResolvedValue(null);

    await expect(
      controller.findPublicInvoice("draft-invoice-id"),
    ).rejects.toThrow(BadRequestException);
    await expect(
      controller.findPublicInvoice("draft-invoice-id"),
    ).rejects.toThrow("Invoice not found");
  });

  it("throws the same error for an unknown invoice ID as for a draft one", async () => {
    invoicesService.findPublicInvoice.mockResolvedValue(null);

    await expect(
      controller.findPublicInvoice("does-not-exist"),
    ).rejects.toThrow("Invoice not found");
  });
});
