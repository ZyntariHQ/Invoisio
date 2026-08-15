import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { InvoicesService } from "./invoices.service";
import { StellarService } from "../stellar/stellar.service";
import { SorobanService } from "../soroban/soroban.service";
import { PrismaService } from "../prisma/prisma.service";
import { WebhooksService } from "../webhooks/webhooks.service";
import { NotificationsService } from "../notifications/notifications.service";
import { StructuredLogger } from "../observability/structured-logger.service";
import { mockStructuredLogger } from "../observability/testing/observability.mock";

describe("Public Invoice Tracking & Conversion Metrics (#297)", () => {
  let service: InvoicesService;

  const mockInvoice = {
    id: "inv-123",
    merchantId: "merchant-1",
    invoiceNumber: "INV-2026-001",
  };

  const mockEvents = [
    {
      id: "ev-1",
      merchantId: "merchant-1",
      invoiceId: "inv-123",
      type: "public_invoice_view",
      description: "Payer viewed public invoice",
      createdAt: new Date("2026-08-15T12:00:00Z"),
    },
    {
      id: "ev-2",
      merchantId: "merchant-1",
      invoiceId: "inv-123",
      type: "public_invoice_wallet_launch",
      description: "Payer launched wallet payment flow",
      createdAt: new Date("2026-08-15T12:01:00Z"),
    },
    {
      id: "ev-3",
      merchantId: "merchant-1",
      invoiceId: "inv-123",
      type: "public_invoice_copy_address",
      description: "Payer copied destination address",
      createdAt: new Date("2026-08-15T12:02:00Z"),
    },
  ];

  const mockPrisma = {
    invoice: {
      findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
        if (where.id === "inv-123") return Promise.resolve(mockInvoice);
        return Promise.resolve(null);
      }),
      findFirst: jest.fn().mockImplementation(({ where }: { where: { id: string; merchantId: string } }) => {
        if (where.id === "inv-123" && where.merchantId === "merchant-1") {
          return Promise.resolve(mockInvoice);
        }
        return Promise.resolve(null);
      }),
    },
    activityEvent: {
      create: jest.fn().mockImplementation(({ data }: { data: any }) => {
        return Promise.resolve({
          id: "ev-generated-id",
          ...data,
          createdAt: new Date(),
        });
      }),
      findMany: jest.fn().mockResolvedValue(mockEvents),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: StellarService, useValue: {} },
        { provide: SorobanService, useValue: {} },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WebhooksService, useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: StructuredLogger, useValue: mockStructuredLogger },
      ],
    }).compile();

    service = module.get<InvoicesService>(InvoicesService);
    jest.clearAllMocks();
  });

  it("records a public invoice view event scoped to the merchant", async () => {
    const result = await service.trackPublicInvoiceEvent("inv-123", {
      action: "view",
      metadata: { referrer: "https://example.com" },
    });

    expect(result.success).toBe(true);
    expect(result.eventId).toBe("ev-generated-id");
    expect(mockPrisma.activityEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        merchantId: "merchant-1",
        invoiceId: "inv-123",
        type: "public_invoice_view",
        description: "Payer viewed public invoice",
        metadata: expect.objectContaining({
          action: "view",
          invoiceNumber: "INV-2026-001",
        }),
      }),
    });
  });

  it("records a wallet launch action event", async () => {
    const result = await service.trackPublicInvoiceEvent("inv-123", {
      action: "wallet_launch",
      metadata: { wallet: "freighter" },
    });

    expect(result.success).toBe(true);
    expect(mockPrisma.activityEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        merchantId: "merchant-1",
        invoiceId: "inv-123",
        type: "public_invoice_wallet_launch",
        description: "Payer launched wallet payment flow",
      }),
    });
  });

  it("throws NotFoundException when tracking an event for a nonexistent invoice", async () => {
    await expect(
      service.trackPublicInvoiceEvent("nonexistent-inv", { action: "view" }),
    ).rejects.toThrow(NotFoundException);
  });

  it("aggregates conversion metrics for merchant dashboard", async () => {
    const metrics = await service.getInvoiceConversionMetrics(
      "merchant-1",
      "inv-123",
    );

    expect(metrics).toEqual({
      views: 1,
      walletLaunches: 1,
      copies: 1,
      totalActions: 3,
      lastActionAt: mockEvents[0].createdAt,
    });
  });

  it("rejects conversion metric queries from unauthenticated or non-owner merchants", async () => {
    await expect(
      service.getInvoiceConversionMetrics("merchant-other", "inv-123"),
    ).rejects.toThrow(NotFoundException);
  });
});
