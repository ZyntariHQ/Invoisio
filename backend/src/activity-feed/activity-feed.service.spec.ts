import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { ActivityFeedService } from "./activity-feed.service";
import { PrismaService } from "../prisma/prisma.service";
import { MerchantContextService } from "../prisma/merchant-context.service";
import { StructuredLogger } from "../observability/structured-logger.service";
import { ConfigService } from "@nestjs/config";
import { encodeActivityCursor } from "./activity-feed.cursor";

describe("ActivityFeedService", () => {
  let service: ActivityFeedService;
  let prisma: PrismaService;

  const mockActivityEvent = {
    id: "event-1",
    merchantId: "merchant-1",
    userId: "user-1",
    invoiceId: "invoice-1",
    type: "invoice_created",
    description: "Invoice #INV-001 created",
    metadata: { invoiceNumber: "INV-001" },
    createdAt: new Date("2026-07-15T12:00:00Z"),
  };

  const mockPrisma = {
    activityEvent: {
      create: jest.fn().mockResolvedValue(mockActivityEvent),
      findMany: jest.fn().mockResolvedValue([mockActivityEvent]),
      findFirst: jest.fn().mockResolvedValue(mockActivityEvent),
      count: jest.fn().mockResolvedValue(1),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.activityEvent.findMany.mockResolvedValue([mockActivityEvent]);
    mockPrisma.activityEvent.count.mockResolvedValue(1);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityFeedService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: MerchantContextService,
          useValue: {
            getMerchantId: jest.fn(),
            runWithMerchantScope: jest.fn(),
          },
        },
        {
          provide: StructuredLogger,
          useValue: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<ActivityFeedService>(ActivityFeedService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("recordEvent", () => {
    it("should create and return an activity event", async () => {
      const result = await service.recordEvent({
        merchantId: "merchant-1",
        userId: "user-1",
        invoiceId: "invoice-1",
        type: "invoice_created",
        description: "Invoice #INV-001 created",
        metadata: { invoiceNumber: "INV-001" },
      });

      expect(result.id).toBe("event-1");
      expect(result.type).toBe("invoice_created");
      expect(result.description).toBe("Invoice #INV-001 created");
      expect(prisma.activityEvent.create).toHaveBeenCalledWith({
        data: {
          merchantId: "merchant-1",
          userId: "user-1",
          invoiceId: "invoice-1",
          type: "invoice_created",
          description: "Invoice #INV-001 created",
          metadata: { invoiceNumber: "INV-001" },
        },
      });
    });
  });

  describe("findAll (offset pagination)", () => {
    it("should return paginated activity events ordered newest first", async () => {
      const result = await service.findAll("merchant-1");

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.hasMore).toBe(false);
      expect(prisma.activityEvent.findMany).toHaveBeenCalledWith({
        where: { merchantId: "merchant-1" },
        skip: 0,
        take: 20,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
    });

    it("should respect page and limit", async () => {
      await service.findAll("merchant-1", { page: 2, limit: 10 });

      expect(prisma.activityEvent.findMany).toHaveBeenCalledWith({
        where: { merchantId: "merchant-1" },
        skip: 10,
        take: 10,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
    });

    it("should filter by type when provided", async () => {
      await service.findAll("merchant-1", { type: "invoice_paid" });

      expect(prisma.activityEvent.findMany).toHaveBeenCalledWith({
        where: { merchantId: "merchant-1", type: "invoice_paid" },
        skip: 0,
        take: 20,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
    });

    it("should report hasMore true when more items exist", async () => {
      mockPrisma.activityEvent.count.mockResolvedValue(25);

      const result = await service.findAll("merchant-1", {
        page: 1,
        limit: 20,
      });

      expect(result.hasMore).toBe(true);
    });

    it("should reject an invalid pageSize", async () => {
      await expect(
        service.findAll("merchant-1", { pageSize: 0 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("findAll (date-range and invoice filters)", () => {
    it("should filter by startDate and endDate", async () => {
      await service.findAll("merchant-1", {
        startDate: "2026-07-01",
        endDate: "2026-07-31",
      });

      expect(prisma.activityEvent.findMany).toHaveBeenCalledWith({
        where: {
          merchantId: "merchant-1",
          createdAt: {
            gte: new Date("2026-07-01"),
            lte: new Date("2026-07-31"),
          },
        },
        skip: 0,
        take: 20,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
    });

    it("should filter by invoiceId", async () => {
      await service.findAll("merchant-1", { invoiceId: "inv-123" });

      expect(prisma.activityEvent.findMany).toHaveBeenCalledWith({
        where: {
          merchantId: "merchant-1",
          invoiceId: "inv-123",
        },
        skip: 0,
        take: 20,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
    });

    it("should combine type, invoice, and date filters", async () => {
      await service.findAll("merchant-1", {
        type: "invoice_paid",
        invoiceId: "inv-123",
        startDate: "2026-07-01",
        endDate: "2026-07-31",
      });

      expect(prisma.activityEvent.findMany).toHaveBeenCalledWith({
        where: {
          merchantId: "merchant-1",
          type: "invoice_paid",
          invoiceId: "inv-123",
          createdAt: {
            gte: new Date("2026-07-01"),
            lte: new Date("2026-07-31"),
          },
        },
        skip: 0,
        take: 20,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
    });

    it("should reject an invalid startDate", async () => {
      await expect(
        service.findAll("merchant-1", { startDate: "not-a-date" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should reject an invalid endDate", async () => {
      await expect(
        service.findAll("merchant-1", { endDate: "not-a-date" }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should reject startDate after endDate", async () => {
      await expect(
        service.findAll("merchant-1", {
          startDate: "2026-07-31",
          endDate: "2026-07-01",
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("findAll (cursor pagination)", () => {
    const firstEvent = {
      ...mockActivityEvent,
      id: "event-1",
      createdAt: new Date("2026-07-15T12:00:00Z"),
    };
    const secondEvent = {
      ...mockActivityEvent,
      id: "event-2",
      createdAt: new Date("2026-07-14T12:00:00Z"),
    };
    const thirdEvent = {
      ...mockActivityEvent,
      id: "event-3",
      createdAt: new Date("2026-07-13T12:00:00Z"),
    };

    it("should page forward from a cursor", async () => {
      const cursor = encodeActivityCursor(
        secondEvent.createdAt,
        secondEvent.id,
      );
      mockPrisma.activityEvent.findMany.mockResolvedValue([thirdEvent]);

      const result = await service.findAll("merchant-1", {
        cursor,
        pageSize: 10,
      });

      expect(prisma.activityEvent.findMany).toHaveBeenCalledWith({
        where: {
          AND: [
            { merchantId: "merchant-1" },
            {
              OR: [
                { createdAt: { lt: secondEvent.createdAt } },
                {
                  createdAt: secondEvent.createdAt,
                  id: { lt: secondEvent.id },
                },
              ],
            },
          ],
        },
        take: 11,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe("event-3");
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBe(
        encodeActivityCursor(thirdEvent.createdAt, thirdEvent.id),
      );
      expect(result.prevCursor).toBe(
        encodeActivityCursor(thirdEvent.createdAt, thirdEvent.id),
      );
    });

    it("should page backwards when before=true", async () => {
      const cursor = encodeActivityCursor(
        secondEvent.createdAt,
        secondEvent.id,
      );
      mockPrisma.activityEvent.findMany.mockResolvedValue([firstEvent]);

      const result = await service.findAll("merchant-1", {
        cursor,
        pageSize: 10,
        before: true,
      });

      expect(prisma.activityEvent.findMany).toHaveBeenCalledWith({
        where: {
          AND: [
            { merchantId: "merchant-1" },
            {
              OR: [
                { createdAt: { gt: secondEvent.createdAt } },
                {
                  createdAt: secondEvent.createdAt,
                  id: { gt: secondEvent.id },
                },
              ],
            },
          ],
        },
        take: 11,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      expect(result.items[0].id).toBe("event-1");
    });

    it("should combine cursor with filters", async () => {
      const cursor = encodeActivityCursor(thirdEvent.createdAt, thirdEvent.id);
      mockPrisma.activityEvent.findMany.mockResolvedValue([]);

      await service.findAll("merchant-1", {
        cursor,
        type: "invoice_paid",
        invoiceId: "inv-123",
        startDate: "2026-07-01",
      });

      expect(prisma.activityEvent.findMany).toHaveBeenCalledWith({
        where: {
          AND: [
            {
              merchantId: "merchant-1",
              type: "invoice_paid",
              invoiceId: "inv-123",
              createdAt: { gte: new Date("2026-07-01") },
            },
            {
              OR: [
                { createdAt: { lt: thirdEvent.createdAt } },
                {
                  createdAt: thirdEvent.createdAt,
                  id: { lt: thirdEvent.id },
                },
              ],
            },
          ],
        },
        take: 21,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      });
    });

    it("should report hasMore true when more rows exist after cursor", async () => {
      const cursor = encodeActivityCursor(firstEvent.createdAt, firstEvent.id);
      mockPrisma.activityEvent.findMany.mockResolvedValue([
        secondEvent,
        thirdEvent,
      ]);

      const result = await service.findAll("merchant-1", {
        cursor,
        pageSize: 1,
      });

      expect(prisma.activityEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 2 }),
      );
      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(true);
    });

    it("should report hasMore false when fewer rows than pageSize remain", async () => {
      const cursor = encodeActivityCursor(firstEvent.createdAt, firstEvent.id);
      mockPrisma.activityEvent.findMany.mockResolvedValue([secondEvent]);

      const result = await service.findAll("merchant-1", {
        cursor,
        pageSize: 5,
      });

      expect(result.items).toHaveLength(1);
      expect(result.hasMore).toBe(false);
    });

    it("should reject an invalid cursor", async () => {
      await expect(
        service.findAll("merchant-1", { cursor: "not-a-valid-cursor" }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("findOne", () => {
    it("should return a single activity event scoped to merchant", async () => {
      const result = await service.findOne("event-1", "merchant-1");

      expect(result).not.toBeNull();
      expect(result!.id).toBe("event-1");
      expect(prisma.activityEvent.findFirst).toHaveBeenCalledWith({
        where: { id: "event-1", merchantId: "merchant-1" },
      });
    });

    it("should return null if event not found for merchant", async () => {
      mockPrisma.activityEvent.findFirst.mockResolvedValueOnce(null);

      const result = await service.findOne("event-nonexistent", "merchant-1");

      expect(result).toBeNull();
    });
  });

  describe("formatDescription", () => {
    it("should format invoice_created description", () => {
      const desc = ActivityFeedService.formatDescription("invoice_created", {
        invoiceNumber: "INV-001",
        clientName: "Acme Corp",
        amount: "1500.00",
        assetCode: "USDC",
      });
      expect(desc).toContain("INV-001");
      expect(desc).toContain("Acme Corp");
      expect(desc).toContain("1500.00");
      expect(desc).toContain("USDC");
    });

    it("should format invoice_paid description", () => {
      const desc = ActivityFeedService.formatDescription("invoice_paid", {
        invoiceNumber: "INV-001",
        amount: "5000.00",
        assetCode: "XLM",
      });
      expect(desc).toContain("fully paid");
      expect(desc).toContain("5000.00");
      expect(desc).toContain("XLM");
    });

    it("should format webhook_failed description", () => {
      const desc = ActivityFeedService.formatDescription("webhook_failed", {
        invoiceNumber: "INV-003",
        attempts: 5,
      });
      expect(desc).toContain("failed");
      expect(desc).toContain("5");
    });

    it("should return fallback for unknown type", () => {
      const desc = ActivityFeedService.formatDescription("unknown_type", {
        fallbackDescription: "Custom event",
      });
      expect(desc).toBe("Custom event");
    });
  });
});
