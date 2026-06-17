import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { BadRequestException } from "@nestjs/common";
import { BackfillService, BackfillStats } from "./backfill.service";
import { PrismaService } from "../prisma/prisma.service";
import { InvoicesService } from "../invoices/invoices.service";
import { SorobanService } from "../soroban/soroban.service";

// Mock the postJson method to avoid network calls
jest.mock("node-fetch");

describe("BackfillService", () => {
  let service: BackfillService;
  let prismaService: jest.Mocked<PrismaService>;
  let invoicesService: jest.Mocked<InvoicesService>;
  let configService: jest.Mocked<ConfigService>;

  const mockContractId = "C1234567890123456789012345678901234567890";
  const mockRpcUrl = "https://soroban-testnet.stellar.org";

  const createMockStats = (): BackfillStats => ({
    totalEvents: 0,
    matched: 0,
    skipped: 0,
    failed: 0,
    failedEvents: [],
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackfillService,
        {
          provide: PrismaService,
          useValue: {
            backfillRun: {
              create: jest.fn(),
              update: jest.fn(),
              findUnique: jest.fn(),
              findMany: jest.fn(),
            },
            processedEvent: {
              findUnique: jest.fn(),
              create: jest.fn(),
              count: jest.fn(),
              findFirst: jest.fn(),
            },
          },
        },
        {
          provide: InvoicesService,
          useValue: {
            applySorobanPaymentEvent: jest.fn(),
          },
        },
        {
          provide: SorobanService,
          useValue: {},
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue({
              sorobanContractId: mockContractId,
              sorobanRpcUrl: mockRpcUrl,
              sorobanEventTopic: "InvoicePaymentRecorded",
            }),
          },
        },
      ],
    }).compile();

    service = module.get<BackfillService>(BackfillService);
    prismaService = module.get(PrismaService);
    invoicesService = module.get(InvoicesService);
    configService = module.get(ConfigService);

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe("coercePaymentRecorded", () => {
    it("should extract invoice_id from direct object", () => {
      const event = {
        invoice_id: "invoice-123",
        payer: "GABCDEF123",
        asset_code: "USDC",
        asset_issuer: "GISSUER123",
        amount: "1000000",
      };

      const result = service["coercePaymentRecorded"](event);
      expect(result).toEqual(event);
    });

    it("should extract invoice_id from nested event.value", () => {
      const event = {
        event: {
          value: {
            invoice_id: "invoice-456",
            payer: "GABCDEF456",
            asset_code: "XLM",
            amount: "5000000",
          },
        },
      };

      const result = service["coercePaymentRecorded"](event);
      expect(result?.invoice_id).toBe("invoice-456");
      expect(result?.payer).toBe("GABCDEF456");
    });

    it("should extract invoice_id from array format", () => {
      const event = {
        value: [
          { key: { symbol: "invoice_id" }, val: { string: "invoice-789" } },
          { key: { symbol: "payer" }, val: { address: "GABCDEF789" } },
          { key: { symbol: "amount" }, val: { i128: "1000000" } },
        ],
      };

      const result = service["coercePaymentRecorded"](event);
      expect(result?.invoice_id).toBe("invoice-789");
      expect(result?.payer).toBe("GABCDEF789");
    });

    it("should return null for invalid event", () => {
      const result = service["coercePaymentRecorded"](null);
      expect(result).toBeNull();

      const result2 = service["coercePaymentRecorded"]("not an object");
      expect(result2).toBeNull();
    });

    it("should return null when no invoice_id found", () => {
      const event = {
        value: {
          some_other_field: "value",
        },
      };
      const result = service["coercePaymentRecorded"](event);
      expect(result).toBeNull();
    });
  });

  describe("getLastProcessedLedger", () => {
    it("should return last processed ledger when events exist", async () => {
      prismaService.processedEvent.findFirst = jest.fn().mockResolvedValue({
        ledger: BigInt(12345),
      });

      const result = await service["getLastProcessedLedger"](mockContractId);
      expect(result).toBe(12345);
      expect(prismaService.processedEvent.findFirst).toHaveBeenCalledWith({
        where: { contractId: mockContractId, status: "success" },
        orderBy: { ledger: "desc" },
        select: { ledger: true },
      });
    });

    it("should return null when no processed events exist", async () => {
      prismaService.processedEvent.findFirst = jest
        .fn()
        .mockResolvedValue(null);

      const result = await service["getLastProcessedLedger"](mockContractId);
      expect(result).toBeNull();
    });
  });

  describe("processEvent", () => {
    const mockEvent = {
      id: "event-123",
      ledger: 12345,
      txHash: "tx-abc123",
      value: {
        invoice_id: "invoice-123",
        payer: "GABCDEF123",
        asset_code: "USDC",
        asset_issuer: "GISSUER123",
        amount: "1000000",
      },
    };

    it("should skip events with no invoice_id", async () => {
      const stats = createMockStats();
      const eventWithoutInvoice = {
        id: "event-456",
        ledger: 12346,
        value: { some_other_field: "value" },
      };

      await service["processEvent"](
        eventWithoutInvoice,
        mockContractId,
        false,
        stats,
      );

      expect(stats.skipped).toBe(0);
      expect(prismaService.processedEvent.create).not.toHaveBeenCalled();
    });

    it("should skip already processed events", async () => {
      const stats = createMockStats();
      prismaService.processedEvent.findUnique = jest.fn().mockResolvedValue({
        id: 1,
        txHash: "tx-abc123",
        invoiceId: "invoice-123",
        contractId: mockContractId,
        status: "success",
      });

      await service["processEvent"](mockEvent, mockContractId, false, stats);

      expect(stats.skipped).toBe(1);
      expect(prismaService.processedEvent.create).not.toHaveBeenCalled();
    });

    it("should process and record a new event", async () => {
      const stats = createMockStats();
      prismaService.processedEvent.findUnique = jest
        .fn()
        .mockResolvedValue(null);
      invoicesService.applySorobanPaymentEvent = jest.fn().mockResolvedValue({
        id: "invoice-123",
        status: "paid",
      });
      prismaService.processedEvent.create = jest.fn().mockResolvedValue({});

      await service["processEvent"](mockEvent, mockContractId, false, stats);

      expect(stats.matched).toBe(1);
      expect(invoicesService.applySorobanPaymentEvent).toHaveBeenCalledWith({
        eventId: "event-123",
        contractId: mockContractId,
        ledger: 12345,
        invoice_id: "invoice-123",
        payer: "GABCDEF123",
        asset_code: "USDC",
        asset_issuer: "GISSUER123",
        amount: "1000000",
      });
      expect(prismaService.processedEvent.create).toHaveBeenCalledWith({
        data: {
          txHash: "tx-abc123",
          ledger: BigInt(12345),
          invoiceId: "invoice-123",
          contractId: mockContractId,
          status: "success",
        },
      });
    });

    it("should handle missing invoice in database", async () => {
      const stats = createMockStats();
      prismaService.processedEvent.findUnique = jest
        .fn()
        .mockResolvedValue(null);
      invoicesService.applySorobanPaymentEvent = jest
        .fn()
        .mockResolvedValue(null);
      prismaService.processedEvent.create = jest.fn().mockResolvedValue({});

      await service["processEvent"](mockEvent, mockContractId, false, stats);

      expect(stats.failed).toBe(1);
      expect(stats.failedEvents[0].error).toBe("Invoice not found in database");
      expect(prismaService.processedEvent.create).toHaveBeenCalledWith({
        data: {
          txHash: "tx-abc123",
          ledger: BigInt(12345),
          invoiceId: "invoice-123",
          contractId: mockContractId,
          status: "failed",
          errorMessage: "Invoice not found in database",
        },
      });
    });

    it("should support dry-run mode", async () => {
      const stats = createMockStats();
      prismaService.processedEvent.findUnique = jest
        .fn()
        .mockResolvedValue(null);

      await service["processEvent"](mockEvent, mockContractId, true, stats);

      expect(stats.matched).toBe(1);
      expect(invoicesService.applySorobanPaymentEvent).not.toHaveBeenCalled();
      expect(prismaService.processedEvent.create).not.toHaveBeenCalled();
    });

    it("should handle errors during processing", async () => {
      const stats = createMockStats();
      prismaService.processedEvent.findUnique = jest
        .fn()
        .mockRejectedValue(new Error("Database connection failed"));

      await service["processEvent"](mockEvent, mockContractId, false, stats);

      expect(stats.failed).toBe(1);
      expect(stats.failedEvents[0].error).toBe("Database connection failed");
      expect(prismaService.processedEvent.create).toHaveBeenCalledWith({
        data: {
          txHash: "tx-abc123",
          ledger: BigInt(12345),
          invoiceId: "invoice-123",
          contractId: mockContractId,
          status: "failed",
          errorMessage: "Database connection failed",
        },
      });
    });
  });

  describe("getHistory", () => {
    it("should return backfill history with default limit", async () => {
      const mockHistory = [
        { id: 1, status: "completed", eventsProcessed: 100 },
        { id: 2, status: "failed", eventsProcessed: 50 },
      ];
      prismaService.backfillRun.findMany = jest
        .fn()
        .mockResolvedValue(mockHistory);

      const result = await service.getHistory();
      expect(result).toEqual(mockHistory);
      expect(prismaService.backfillRun.findMany).toHaveBeenCalledWith({
        orderBy: { startedAt: "desc" },
        take: 10,
      });
    });

    it("should return backfill history with custom limit", async () => {
      prismaService.backfillRun.findMany = jest.fn().mockResolvedValue([]);
      await service.getHistory(5);
      expect(prismaService.backfillRun.findMany).toHaveBeenCalledWith({
        orderBy: { startedAt: "desc" },
        take: 5,
      });
    });
  });

  describe("getReport", () => {
    it("should return a specific backfill run report", async () => {
      const mockReport = {
        id: 1,
        status: "completed",
        startLedger: BigInt(1000),
        endLedger: BigInt(2000),
        eventsProcessed: 150,
        eventsMatched: 100,
        eventsSkipped: 40,
        eventsFailed: 10,
      };
      prismaService.backfillRun.findUnique = jest
        .fn()
        .mockResolvedValue(mockReport);

      const result = await service.getReport(1);
      expect(result).toEqual(mockReport);
      expect(prismaService.backfillRun.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });
  });

  describe("getStats", () => {
    it("should return processed events statistics", async () => {
      prismaService.processedEvent.count = jest
        .fn()
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(80) // success
        .mockResolvedValueOnce(10) // failed
        .mockResolvedValueOnce(10); // skipped

      prismaService.processedEvent.findFirst = jest.fn().mockResolvedValue({
        ledger: BigInt(12345),
      });

      const result = await service.getStats();

      expect(result).toEqual({
        total: 100,
        success: 80,
        failed: 10,
        skipped: 10,
        lastProcessedLedger: 12345,
      });
    });

    it("should filter by contractId", async () => {
      prismaService.processedEvent.count = jest
        .fn()
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(40)
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(5);

      prismaService.processedEvent.findFirst = jest.fn().mockResolvedValue({
        ledger: BigInt(10000),
      });

      await service.getStats(mockContractId);

      expect(prismaService.processedEvent.count).toHaveBeenCalledWith({
        where: { contractId: mockContractId },
      });
      expect(prismaService.processedEvent.count).toHaveBeenCalledWith({
        where: { contractId: mockContractId, status: "success" },
      });
    });

    it("should return null lastProcessedLedger when no events", async () => {
      prismaService.processedEvent.count = jest
        .fn()
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      prismaService.processedEvent.findFirst = jest
        .fn()
        .mockResolvedValue(null);

      const result = await service.getStats();
      expect(result.lastProcessedLedger).toBeNull();
    });
  });

  describe("reconcile", () => {
    const mockOptions = {
      startLedger: 1000,
      endLedger: 2000,
      dryRun: false,
      fromLast: false,
      batchSize: 100,
    };

    it("should throw error when contractId is missing", async () => {
      configService.get.mockReturnValue({
        sorobanContractId: "",
        sorobanRpcUrl: mockRpcUrl,
      });

      // Re-create service with empty contractId
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          BackfillService,
          {
            provide: PrismaService,
            useValue: {
              backfillRun: {
                create: jest.fn(),
                update: jest.fn(),
                findUnique: jest.fn(),
                findMany: jest.fn(),
              },
              processedEvent: {
                findUnique: jest.fn(),
                create: jest.fn(),
                count: jest.fn(),
                findFirst: jest.fn(),
              },
            },
          },
          {
            provide: InvoicesService,
            useValue: {
              applySorobanPaymentEvent: jest.fn(),
            },
          },
          {
            provide: SorobanService,
            useValue: {},
          },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue({
                sorobanContractId: "",
                sorobanRpcUrl: mockRpcUrl,
                sorobanEventTopic: "InvoicePaymentRecorded",
              }),
            },
          },
        ],
      }).compile();

      const serviceWithEmptyContract =
        module.get<BackfillService>(BackfillService);

      await expect(
        serviceWithEmptyContract.reconcile(mockOptions),
      ).rejects.toThrow(BadRequestException);
    });

    it("should throw error when startLedger is missing and not fromLast", async () => {
      await expect(
        service.reconcile({
          startLedger: undefined,
          fromLast: false,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("should start from last processed ledger when fromLast is true", async () => {
      prismaService.processedEvent.findFirst = jest.fn().mockResolvedValue({
        ledger: BigInt(999),
      });

      prismaService.backfillRun.create = jest.fn().mockResolvedValue({
        id: 1,
        startLedger: BigInt(1000),
        endLedger: BigInt(2000),
        status: "running",
      });

      // Mock the fetchEvents to return empty array
      jest
        .spyOn(service as any, "fetchEvents")
        .mockResolvedValue({ events: [] });

      await service.reconcile({
        startLedger: undefined,
        fromLast: true,
        endLedger: 2000,
      });

      expect(prismaService.backfillRun.create).toHaveBeenCalledWith({
        data: {
          startLedger: BigInt(1000),
          endLedger: BigInt(2000),
          status: "running",
        },
      });
    });

    it("should create and complete a backfill run", async () => {
      const mockRun = {
        id: 1,
        startLedger: BigInt(1000),
        endLedger: BigInt(2000),
        status: "running",
      };

      prismaService.backfillRun.create = jest.fn().mockResolvedValue(mockRun);
      prismaService.backfillRun.update = jest.fn().mockResolvedValue({});

      // Mock fetchEvents to return empty events
      jest
        .spyOn(service as any, "fetchEvents")
        .mockResolvedValue({ events: [] });

      // Mock getLatestLedger
      jest.spyOn(service as any, "getLatestLedger").mockResolvedValue(2000);

      const result = await service.reconcile({
        startLedger: 1000,
        dryRun: false,
      });

      expect(result.runId).toBe(1);
      expect(result.stats).toEqual({
        totalEvents: 0,
        matched: 0,
        skipped: 0,
        failed: 0,
        failedEvents: [],
      });

      expect(prismaService.backfillRun.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          completedAt: expect.any(Date),
          status: "completed",
          eventsProcessed: 0,
          eventsMatched: 0,
          eventsSkipped: 0,
          eventsFailed: 0,
        },
      });
    });

    it("should handle errors during reconciliation", async () => {
      const mockRun = {
        id: 1,
        startLedger: BigInt(1000),
        endLedger: BigInt(2000),
        status: "running",
      };

      prismaService.backfillRun.create = jest.fn().mockResolvedValue(mockRun);
      prismaService.backfillRun.update = jest.fn().mockResolvedValue({});

      // Mock fetchEvents to throw error
      jest
        .spyOn(service as any, "fetchEvents")
        .mockRejectedValue(new Error("RPC connection failed"));

      await expect(
        service.reconcile({
          startLedger: 1000,
          dryRun: false,
        }),
      ).rejects.toThrow("RPC connection failed");

      expect(prismaService.backfillRun.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: {
          completedAt: expect.any(Date),
          status: "failed",
          errorMessage: "RPC connection failed",
        },
      });
    });
  });
});
