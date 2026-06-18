import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { BackfillController } from "./backfill.controller";
import { BackfillService, BackfillStats } from "./backfill.service";

describe("BackfillController", () => {
  let controller: BackfillController;
  let service: jest.Mocked<BackfillService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BackfillController],
      providers: [
        {
          provide: BackfillService,
          useValue: {
            reconcile: jest.fn(),
            getHistory: jest.fn(),
            getReport: jest.fn(),
            getStats: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<BackfillController>(BackfillController);
    service = module.get(BackfillService);
  });

  describe("startBackfill", () => {
    const mockStats: BackfillStats = {
      totalEvents: 100,
      matched: 80,
      skipped: 15,
      failed: 5,
      failedEvents: [
        { invoiceId: "invoice-1", eventId: "event-1", error: "Not found" },
      ],
    };

    it("should start a backfill with valid options", async () => {
      const options = {
        startLedger: 1000,
        endLedger: 2000,
        dryRun: false,
      };

      service.reconcile.mockResolvedValue({
        runId: 1,
        stats: mockStats,
      });

      const result = await controller.startBackfill(options);

      expect(result).toEqual({
        success: true,
        runId: 1,
        stats: mockStats,
        message: "Backfill started successfully",
      });
      expect(service.reconcile).toHaveBeenCalledWith(options);
    });

    it("should throw error when startLedger and fromLast are both missing", async () => {
      const options = {
        startLedger: undefined,
        fromLast: false,
      };

      await expect(controller.startBackfill(options)).rejects.toThrow(
        BadRequestException,
      );
      expect(service.reconcile).not.toHaveBeenCalled();
    });

    it("should allow fromLast without startLedger", async () => {
      const options = {
        startLedger: undefined,
        fromLast: true,
      };

      service.reconcile.mockResolvedValue({
        runId: 2,
        stats: mockStats,
      });

      await controller.startBackfill(options);
      expect(service.reconcile).toHaveBeenCalledWith(options);
    });
  });

  describe("getHistory", () => {
    it("should return history with default limit", async () => {
      const mockHistory = [
        { id: 1, status: "completed" },
        { id: 2, status: "failed" },
      ];

      service.getHistory.mockResolvedValue(mockHistory);

      const result = await controller.getHistory(undefined);
      expect(result).toEqual(mockHistory);
      expect(service.getHistory).toHaveBeenCalledWith(10);
    });

    it("should return history with custom limit", async () => {
      const mockHistory = [{ id: 1, status: "completed" }];

      service.getHistory.mockResolvedValue(mockHistory);

      const result = await controller.getHistory("5");
      expect(result).toEqual(mockHistory);
      expect(service.getHistory).toHaveBeenCalledWith(5);
    });
  });

  describe("getReport", () => {
    it("should return a specific backfill report", async () => {
      const mockReport = {
        id: 1,
        status: "completed",
        eventsProcessed: 100,
        eventsMatched: 80,
        eventsSkipped: 15,
        eventsFailed: 5,
      };

      service.getReport.mockResolvedValue(mockReport);

      const result = await controller.getReport("1");
      expect(result).toEqual(mockReport);
      expect(service.getReport).toHaveBeenCalledWith(1);
    });
  });

  describe("getStats", () => {
    it("should return stats without contractId filter", async () => {
      const mockStats = {
        total: 100,
        success: 80,
        failed: 10,
        skipped: 10,
        lastProcessedLedger: 12345,
      };

      service.getStats.mockResolvedValue(mockStats);

      const result = await controller.getStats(undefined);
      expect(result).toEqual(mockStats);
      expect(service.getStats).toHaveBeenCalledWith(undefined);
    });

    it("should return stats with contractId filter", async () => {
      const mockStats = {
        total: 50,
        success: 40,
        failed: 5,
        skipped: 5,
        lastProcessedLedger: 10000,
      };

      const contractId = "C1234567890";
      service.getStats.mockResolvedValue(mockStats);

      const result = await controller.getStats(contractId);
      expect(result).toEqual(mockStats);
      expect(service.getStats).toHaveBeenCalledWith(contractId);
    });
  });
});
