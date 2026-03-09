import { Test, TestingModule } from "@nestjs/testing";
import { AdminService } from "./admin.service";
import { PrismaService } from "../prisma/prisma.service";
import { InvoiceStatus } from "./dtos/invoice-analytics.dto";

describe("AdminService", () => {
  let service: AdminService;
  let prismaService: Partial<PrismaService>;

  // Mock data
  const mockAggregations = {
    _count: { id: 5 },
    _sum: { amount: 8000 },
  };

  const mockGroupByResult = [
    { status: "pending", _count: { id: 1 }, _sum: { amount: 1000 } },
    { status: "paid", _count: { id: 2 }, _sum: { amount: 5000 } },
    { status: "overdue", _count: { id: 1 }, _sum: { amount: 1500 } },
    { status: "cancelled", _count: { id: 1 }, _sum: { amount: 500 } },
  ];

  // Helper to create query objects with validateDates method
  const createInvoiceQuery = (params: {
    status?: InvoiceStatus;
    startDate?: string;
    endDate?: string;
  }) => ({
    ...params,
    validateDates: () => {
      if (params.startDate && params.endDate) {
        const start = new Date(params.startDate);
        const end = new Date(params.endDate);
        if (start > end) {
          throw new Error("startDate must be before or equal to endDate");
        }
        const oneYearInMs = 365 * 24 * 60 * 60 * 1000;
        if (end.getTime() - start.getTime() > oneYearInMs) {
          throw new Error("Date range cannot exceed 1 year");
        }
      }
    },
  });

  const createPaymentQuery = (params: {
    asset?: string;
    startDate?: string;
    endDate?: string;
  }) => ({
    ...params,
    validateDates: () => {
      if (params.startDate && params.endDate) {
        const start = new Date(params.startDate);
        const end = new Date(params.endDate);
        if (start > end) {
          throw new Error("startDate must be before or equal to endDate");
        }
        const oneYearInMs = 365 * 24 * 60 * 60 * 1000;
        if (end.getTime() - start.getTime() > oneYearInMs) {
          throw new Error("Date range cannot exceed 1 year");
        }
      }
    },
  });

  beforeEach(async () => {
    prismaService = {
      invoice: {
        aggregate: jest.fn().mockResolvedValue(mockAggregations),
        groupBy: jest.fn().mockResolvedValue(mockGroupByResult),
      },
    } as unknown as PrismaService;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PrismaService, useValue: prismaService },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("getInvoiceAnalytics", () => {
    it("should return total count and amount", async () => {
      const query = createInvoiceQuery({});
      const result = await service.getInvoiceAnalytics(query);

      expect(result.totalCount).toBe(5);
      expect(result.totalAmount).toBe(8000);
    });

    it("should return breakdown by status", async () => {
      const query = createInvoiceQuery({});
      const result = await service.getInvoiceAnalytics(query);

      expect(result.byStatus).toHaveLength(4);
      expect(result.byStatus).toContainEqual({
        status: "pending",
        count: 1,
        amount: 1000,
      });
      expect(result.byStatus).toContainEqual({
        status: "paid",
        count: 2,
        amount: 5000,
      });
    });

    it("should filter by status", async () => {
      const query = createInvoiceQuery({ status: InvoiceStatus.paid });
      const result = await service.getInvoiceAnalytics(query);

      expect(prismaService.invoice!.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: "paid",
          }),
        }),
      );
      expect(result.byStatus).toHaveLength(1);
      expect(result.byStatus[0].status).toBe("paid");
    });

    it("should filter by date range", async () => {
      const query = createInvoiceQuery({
        startDate: "2026-01-01",
        endDate: "2026-02-28",
      });
      const result = await service.getInvoiceAnalytics(query);

      expect(prismaService.invoice!.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.objectContaining({
              gte: new Date("2026-01-01"),
              lte: new Date("2026-02-28"),
            }),
          }),
        }),
      );
    });

    it("should include date range in response when filtering by dates", async () => {
      const query = createInvoiceQuery({
        startDate: "2026-01-01",
        endDate: "2026-12-31",
      });
      const result = await service.getInvoiceAnalytics(query);

      expect(result.dateRange).toBeDefined();
      expect(result.dateRange?.startDate).toBe("2026-01-01");
      expect(result.dateRange?.endDate).toBe("2026-12-31");
    });
  });

  describe("getPaymentAnalytics", () => {
    it("should return total volume and count for paid invoices", async () => {
      const query = createPaymentQuery({});
      const result = await service.getPaymentAnalytics(query);

      // Should only count paid invoices
      expect(prismaService.invoice!.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: InvoiceStatus.paid,
          }),
        }),
      );
      expect(result.totalCount).toBe(5);
      expect(result.totalVolume).toBe(8000);
    });

    it("should return breakdown by asset", async () => {
      const assetGroupByResult = [
        {
          assetCode: "USDC",
          assetIssuer:
            "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
          _count: { id: 2 },
          _sum: { amount: 5000 },
        },
        { assetCode: "XLM", assetIssuer: null, _count: { id: 3 }, _sum: { amount: 3000 } },
      ];

      (prismaService.invoice!.groupBy as jest.Mock).mockResolvedValueOnce(
        assetGroupByResult,
      );

      const query = createPaymentQuery({});
      const result = await service.getPaymentAnalytics(query);

      expect(result.byAsset).toHaveLength(2);
      expect(result.byAsset).toContainEqual({
        assetCode: "USDC",
        assetIssuer:
          "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
        volume: 5000,
        count: 2,
      });
    });

    it("should filter by asset code", async () => {
      const query = createPaymentQuery({ asset: "USDC" });
      await service.getPaymentAnalytics(query);

      expect(prismaService.invoice!.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            assetCode: "USDC",
          }),
        }),
      );
    });

    it("should filter by date range using updatedAt", async () => {
      const query = createPaymentQuery({
        startDate: "2026-01-01",
        endDate: "2026-06-30",
      });
      await service.getPaymentAnalytics(query);

      expect(prismaService.invoice!.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            updatedAt: expect.objectContaining({
              gte: new Date("2026-01-01"),
              lte: new Date("2026-06-30"),
            }),
          }),
        }),
      );
    });
  });
});
