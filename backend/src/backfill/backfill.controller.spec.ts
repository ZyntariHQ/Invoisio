import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { BadRequestException } from "@nestjs/common";
import { BackfillController } from "./backfill.controller";
import { BackfillService, BackfillStats } from "./backfill.service";
import { BackfillRunStatus } from "@prisma/client";
import {
  jwtAuthImports,
  jwtAuthProviders,
  signUserToken,
} from "../auth/guard/auth-testing.util";
import { AdminGuard } from "../auth/guard/admin.guard";

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
            cancelRun: jest.fn(),
            getLatestCheckpoint: jest.fn(),
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
        message: "Backfill completed",
      });
      expect(service.reconcile).toHaveBeenCalledWith(options);
    });

    it("should throw error when startLedger, fromLast, and resumeFromRunId are all missing", async () => {
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

    it("should allow resumeFromRunId without startLedger", async () => {
      const options = { resumeFromRunId: 5 };

      service.reconcile.mockResolvedValue({
        runId: 6,
        stats: mockStats,
      });

      await controller.startBackfill(options);
      expect(service.reconcile).toHaveBeenCalledWith(options);
    });
  });

  describe("cancelRun", () => {
    it("should cancel a run", async () => {
      service.cancelRun.mockResolvedValue({
        id: 3,
        status: BackfillRunStatus.cancelled,
      });

      const result = await controller.cancelRun("3", {
        runId: 3,
        operator: "alice",
        note: "manual stop",
      });
      expect(result).toEqual({
        success: true,
        id: 3,
        status: BackfillRunStatus.cancelled,
      });
      expect(service.cancelRun).toHaveBeenCalledWith({
        runId: 3,
        operator: "alice",
        note: "manual stop",
      });
    });
  });

  describe("getLatestCheckpoint", () => {
    it("should delegate to service", async () => {
      const payload = {
        runId: 1,
        status: BackfillRunStatus.failed,
        checkpoint: null,
      };
      service.getLatestCheckpoint.mockResolvedValue(payload);
      expect(await controller.getLatestCheckpoint("1")).toBe(payload);
      expect(service.getLatestCheckpoint).toHaveBeenCalledWith(1);
    });
  });

  describe("getHistory", () => {
    it("should return history with default limit", async () => {
      const mockHistory = [
        { id: 1, status: BackfillRunStatus.completed },
        { id: 2, status: BackfillRunStatus.failed },
      ];

      service.getHistory.mockResolvedValue(mockHistory);

      const result = await controller.getHistory(undefined);
      expect(result).toEqual(mockHistory);
      expect(service.getHistory).toHaveBeenCalledWith(10);
    });

    it("should return history with custom limit", async () => {
      const mockHistory = [{ id: 1, status: BackfillRunStatus.completed }];

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
        status: BackfillRunStatus.completed,
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

describe("BackfillController (auth enforcement)", () => {
  let app: INestApplication;
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      controllers: [BackfillController],
      imports: [...jwtAuthImports],
      providers: [
        {
          provide: BackfillService,
          useValue: {
            reconcile: jest.fn().mockResolvedValue({
              runId: 1,
              stats: {
                totalEvents: 1,
                matched: 1,
                skipped: 0,
                failed: 0,
                failedEvents: [],
              },
            }),
            getHistory: jest.fn().mockResolvedValue([]),
          },
        },
        AdminGuard,
        ...jwtAuthProviders,
      ],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it("POST /backfill/reconcile should reject unauthenticated requests", async () => {
    await request(app.getHttpServer())
      .post("/backfill/reconcile")
      .send({ startLedger: 1000 })
      .expect(401);
  });

  it("POST /backfill/reconcile should reject non-admin authenticated users", async () => {
    const token = signUserToken(module as any, {
      id: "user-1",
      merchantId: "merchant-1",
      role: "owner" as any,
      isAdmin: false,
    });

    await request(app.getHttpServer())
      .post("/backfill/reconcile")
      .set("Authorization", `Bearer ${token}`)
      .send({ startLedger: 1000 })
      .expect(403);
  });

  it("POST /backfill/reconcile should allow admin users", async () => {
    const token = signUserToken(module as any, {
      id: "admin-1",
      merchantId: "merchant-1",
      role: "owner" as any,
      isAdmin: true,
    });

    const res = await request(app.getHttpServer())
      .post("/backfill/reconcile")
      .set("Authorization", `Bearer ${token}`)
      .send({ startLedger: 1000 })
      .expect(202);

    expect(res.body).toMatchObject({ success: true, runId: 1 });
  });

  it("GET /backfill/history should reject unauthenticated requests", async () => {
    await request(app.getHttpServer()).get("/backfill/history").expect(401);
  });

  it("GET /backfill/history should reject non-admin authenticated users", async () => {
    const token = signUserToken(module as any, {
      id: "user-1",
      merchantId: "merchant-1",
      role: "owner" as any,
      isAdmin: false,
    });

    await request(app.getHttpServer())
      .get("/backfill/history")
      .set("Authorization", `Bearer ${token}`)
      .expect(403);
  });

  it("GET /backfill/history should allow admin users", async () => {
    const token = signUserToken(module as any, {
      id: "admin-1",
      merchantId: "merchant-1",
      role: "owner" as any,
      isAdmin: true,
    });

    const res = await request(app.getHttpServer())
      .get("/backfill/history")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);

    expect(res.body).toEqual([]);
  });
});
