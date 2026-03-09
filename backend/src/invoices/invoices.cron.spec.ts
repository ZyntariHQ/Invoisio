import { Test, TestingModule } from "@nestjs/testing";
import { InvoicesService } from "./invoices.service";
import { ConfigService } from "@nestjs/config";
import { StellarService } from "../stellar/stellar.service";
import { SorobanService } from "../soroban/soroban.service";
import { PrismaService } from "../prisma/prisma.service";
import { WebhooksService } from "../webhooks/webhooks.service";

describe("InvoicesService Cron", () => {
  let service: InvoicesService;
  let prismaService: PrismaService;
  let webhooksService: WebhooksService;

  const mockPrismaService = {
    invoice: {
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  };

  const mockWebhooksService = {
    enqueueWebhook: jest.fn(),
  };

  const mockConfigService = { get: jest.fn() };
  const mockStellarService = { getMerchantPublicKey: jest.fn() };
  const mockSorobanService = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: WebhooksService, useValue: mockWebhooksService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: StellarService, useValue: mockStellarService },
        { provide: SorobanService, useValue: mockSorobanService },
      ],
    }).compile();

    service = module.get<InvoicesService>(InvoicesService);
    prismaService = module.get<PrismaService>(PrismaService);
    webhooksService = module.get<WebhooksService>(WebhooksService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  describe("handleOverdueInvoices", () => {
    it("should mark overdue pending invoices as overdue", async () => {
      const now = new Date("2026-03-10T02:00:00Z");
      jest.useFakeTimers().setSystemTime(now);

      const overdueInvoices = [{ id: "inv-1" }, { id: "inv-2" }];

      mockPrismaService.invoice.findMany.mockResolvedValue(overdueInvoices);
      mockPrismaService.invoice.update.mockResolvedValue({
        id: "inv-1",
        status: "overdue",
        txHash: null,
        amount: 100,
      });

      await service.handleOverdueInvoices();

      expect(mockPrismaService.invoice.findMany).toHaveBeenCalledWith({
        where: {
          status: "pending",
          dueDate: { lt: now },
        },
        select: { id: true },
      });

      expect(mockPrismaService.invoice.update).toHaveBeenCalledTimes(2);
      expect(mockPrismaService.invoice.update).toHaveBeenCalledWith({
        where: { id: "inv-2" },
        data: { status: "overdue" },
      });
      expect(mockWebhooksService.enqueueWebhook).toHaveBeenCalledTimes(2);
    });

    it("should handle empty list gracefully", async () => {
      mockPrismaService.invoice.findMany.mockResolvedValue([]);
      await service.handleOverdueInvoices();
      expect(mockPrismaService.invoice.update).not.toHaveBeenCalled();
    });
  });
});
