import { Test, TestingModule } from "@nestjs/testing";
import { AdminAnalyticsService } from "./admin-analytics.service";
import { PrismaService } from "../prisma/prisma.service";
import { InvoiceStatus } from "@prisma/client";
import { BadRequestException } from "@nestjs/common";

describe("AdminAnalyticsService", () => {
  let service: AdminAnalyticsService;

  const mockPrisma = () => {
    const invoices = [
      {
        id: "invoice-1",
        merchantId: "merchant-1",
        userId: "user-1",
        invoiceNumber: "INV-001",
        clientName: "Test Client 1",
        clientEmail: "test1@example.com",
        amount: 100,
        assetCode: "XLM",
        assetIssuer: null,
        status: "paid",
        createdAt: new Date("2024-01-01"),
        updatedAt: new Date("2024-01-02"),
      },
      {
        id: "invoice-2",
        merchantId: "merchant-2",
        userId: "user-2",
        invoiceNumber: "INV-002",
        clientName: "Test Client 2",
        clientEmail: "test2@example.com",
        amount: 200,
        assetCode: "USDC",
        assetIssuer: "GASDF",
        status: "pending",
        createdAt: new Date("2024-01-15"),
        updatedAt: new Date("2024-01-15"),
      },
      {
        id: "invoice-3",
        merchantId: "merchant-1",
        userId: "user-1",
        invoiceNumber: "INV-003",
        clientName: "Test Client 3",
        clientEmail: "test3@example.com",
        amount: 150,
        assetCode: "USDC",
        assetIssuer: "GASDF",
        status: "paid",
        createdAt: new Date("2024-02-01"),
        updatedAt: new Date("2024-02-02"),
      },
    ];

    const filterInvoices = (where: any) => {
      return invoices.filter((inv) => {
        let matches = true;
        if (where?.merchantId && inv.merchantId !== where.merchantId) matches = false;
        if (where?.status && inv.status !== where.status) matches = false;
        if (where?.assetCode && inv.assetCode !== where.assetCode)
          matches = false;
        if (
          where?.createdAt?.gte &&
          inv.createdAt.getTime() < new Date(where.createdAt.gte).getTime()
        )
          matches = false;
        if (
          where?.createdAt?.lte &&
          inv.createdAt.getTime() > new Date(where.createdAt.lte).getTime()
        )
          matches = false;
        if (
          where?.updatedAt?.gte &&
          inv.updatedAt.getTime() < new Date(where.updatedAt.gte).getTime()
        )
          matches = false;
        if (
          where?.updatedAt?.lte &&
          inv.updatedAt.getTime() > new Date(where.updatedAt.lte).getTime()
        )
          matches = false;
        return matches;
      });
    };

    return {
      invoice: {
        count: jest.fn().mockImplementation(({ where }: any) => {
          const filtered = filterInvoices(where);
          return Promise.resolve(filtered.length);
        }),
        aggregate: jest.fn().mockImplementation(({ where, _sum }: any) => {
          const filtered = filterInvoices(where);
          const sum = filtered.reduce((acc, inv) => acc + inv.amount, 0);
          return Promise.resolve({
            _sum: { amount: { toNumber: () => sum } },
          });
        }),
        groupBy: jest
          .fn()
          .mockImplementation(({ where, by, _count, _sum }: any) => {
            const filtered = filterInvoices(where);

            const groups: any[] = [];
            const groupMap = new Map();

            for (const inv of filtered) {
              const key = by
                .map((b: string) => `${b}:${(inv as any)[b]}`)
                .join("|");
              if (!groupMap.has(key)) {
                const group: any = { _count: 0, _sum: { amount: 0 } };
                by.forEach((b: string) => {
                  group[b] = (inv as any)[b];
                });
                groupMap.set(key, group);
              }
              const group = groupMap.get(key)!;
              group._count++;
              group._sum.amount += inv.amount;
            }

            return Promise.resolve(
              Array.from(groupMap.values()).map((g: any) => ({
                ...g,
                _sum: { amount: { toNumber: () => g._sum.amount } },
              })),
            );
          }),
      },
    };
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAnalyticsService,
        { provide: PrismaService, useFactory: mockPrisma },
      ],
    }).compile();

    service = module.get<AdminAnalyticsService>(AdminAnalyticsService);
  });

  it("is defined", () => {
    expect(service).toBeDefined();
  });

  describe("getInvoiceAnalytics", () => {
    it("returns total invoice count and amount", async () => {
      const result = await service.getInvoiceAnalytics();
      expect(result.count).toBe(3);
      expect(result.totalAmount).toBe(450);
    });

    it("filters by status", async () => {
      const result = await service.getInvoiceAnalytics(InvoiceStatus.paid);
      expect(result.count).toBe(2);
      expect(result.totalAmount).toBe(250);
    });

    it("filters by date range", async () => {
      const result = await service.getInvoiceAnalytics(
        undefined,
        "2024-01-01",
        "2024-01-31",
      );
      expect(result.count).toBe(2);
      expect(result.totalAmount).toBe(300);
    });

    it("throws BadRequestException if startDate > endDate", async () => {
      await expect(
        service.getInvoiceAnalytics(undefined, "2024-02-01", "2024-01-01"),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("getPaymentAnalytics", () => {
    it("returns total payment count and volume", async () => {
      const result = await service.getPaymentAnalytics();
      expect(result.count).toBe(2);
      expect(result.totalVolume).toBe(250);
    });

    it("filters by asset", async () => {
      const result = await service.getPaymentAnalytics("USDC");
      expect(result.count).toBe(1);
      expect(result.totalVolume).toBe(150);
    });
  });

  describe("getMerchantAnalytics", () => {
    it("returns merchant-scoped payment count and volume", async () => {
      const result = await service.getMerchantAnalytics("merchant-1");
      expect(result.count).toBe(2);
      expect(result.totalVolume).toBe(250);
    });

    it("filters by asset", async () => {
      const result = await service.getMerchantAnalytics("merchant-1", "USDC");
      expect(result.count).toBe(1);
      expect(result.totalVolume).toBe(150);
    });

    it("returns correct asset breakdown", async () => {
      const result = await service.getMerchantAnalytics("merchant-1");
      expect(result.assetBreakdown).toEqual(expect.arrayContaining([
        expect.objectContaining({ assetCode: "XLM", count: 1, volume: 100 }),
        expect.objectContaining({ assetCode: "USDC", count: 1, volume: 150 }),
      ]));
    });
  });
});
