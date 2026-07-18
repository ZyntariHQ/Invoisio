import { Test, TestingModule } from "@nestjs/testing";
import { ActivityFeedService } from "./activity-feed.service";
import { PrismaService } from "../prisma/prisma.service";
import { MerchantContextService } from "../prisma/merchant-context.service";
import { StructuredLogger } from "../observability/structured-logger.service";
import { ConfigService } from "@nestjs/config";

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

  describe("findAll", () => {
    it("should return paginated activity events ordered newest first", async () => {
      const result = await service.findAll("merchant-1", 1, 20);

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.hasMore).toBe(false);
      expect(prisma.activityEvent.findMany).toHaveBeenCalledWith({
        where: { merchantId: "merchant-1" },
        skip: 0,
        take: 20,
        orderBy: { createdAt: "desc" },
      });
    });

    it("should filter by type when provided", async () => {
      await service.findAll("merchant-1", 1, 20, "invoice_paid");

      expect(prisma.activityEvent.findMany).toHaveBeenCalledWith({
        where: { merchantId: "merchant-1", type: "invoice_paid" },
        skip: 0,
        take: 20,
        orderBy: { createdAt: "desc" },
      });
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
