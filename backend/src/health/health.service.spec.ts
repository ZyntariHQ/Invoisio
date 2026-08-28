import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { HealthService } from "./health.service";
import { PrismaService } from "../prisma/prisma.service";
import { StellarService } from "../stellar/stellar.service";
import { SorobanService } from "../soroban/soroban.service";

describe("HealthService watcher observability", () => {
  let service: HealthService;

  const mockPrismaService = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    watcherCursor: {
      findMany: jest.fn(),
    },
    watcherDeadLetter: {
      groupBy: jest.fn(),
    },
  };

  const mockStellarService = {
    pingHorizon: jest.fn().mockResolvedValue({ reachable: true, latencyMs: 5 }),
  };

  const mockSorobanService = {
    pingRpc: jest.fn().mockResolvedValue({ reachable: true, latencyMs: 5 }),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === "stellar") return { networkPassphrase: "Test SDF" };
      if (key === "app") return { version: "1.0.0" };
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: StellarService, useValue: mockStellarService },
        { provide: SorobanService, useValue: mockSorobanService },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  it("exposes persisted cursor positions and checkpoint lag", async () => {
    const tenSecondsAgo = new Date(Date.now() - 10_000);
    mockPrismaService.watcherCursor.findMany.mockResolvedValue([
      { watcher: "horizon", cursor: "1234567", updatedAt: tenSecondsAgo },
    ]);
    mockPrismaService.watcherDeadLetter.groupBy.mockResolvedValue([]);

    const report = await service.checkReadiness();

    expect(report.watchers).toBeDefined();
    expect(report.watchers!.cursors).toEqual([
      expect.objectContaining({
        watcher: "horizon",
        cursor: "1234567",
        secondsSinceCheckpoint: expect.any(Number),
      }),
    ]);
    // Lag is reported in seconds and roughly matches the fixture.
    const lag = report.watchers!.cursors[0].secondsSinceCheckpoint!;
    expect(lag).toBeGreaterThanOrEqual(9);
    expect(lag).toBeLessThanOrEqual(15);
    expect(report.watchers!.deadLetters).toEqual([]);
  });

  it("reports pending dead-letter counts per watcher", async () => {
    const oldest = new Date(Date.now() - 120_000);
    mockPrismaService.watcherCursor.findMany.mockResolvedValue([]);
    mockPrismaService.watcherDeadLetter.groupBy.mockResolvedValue([
      {
        watcher: "soroban",
        _count: { _all: 2 },
        _min: { createdAt: oldest },
      },
    ]);

    const report = await service.checkReadiness();

    expect(report.watchers!.cursors).toEqual([]);
    expect(report.watchers!.deadLetters).toEqual([
      {
        watcher: "soroban",
        pendingCount: 2,
        oldestPendingAt: oldest.toISOString(),
      },
    ]);
  });

  it("omits the watchers section when the observability query fails", async () => {
    mockPrismaService.watcherCursor.findMany.mockRejectedValue(
      new Error("relation does not exist"),
    );

    const report = await service.checkReadiness();

    // Observability degradation must not break the readiness probe.
    expect(report.ok).toBe(true);
    expect(report.watchers).toBeUndefined();
  });
});
