import { Test, TestingModule } from "@nestjs/testing";
import { HealthController } from "./health.controller";
import { HealthService, HealthReport } from "./health.service";

describe("HealthController", () => {
  let controller: HealthController;

  const mockHealthService: Partial<HealthService> = {
    checkLiveness: jest.fn(() => ({
      ok: true,
      version: "0.0.1",
      network: "testnet",
      timestamp: new Date().toISOString(),
    })),
    checkReadiness: jest.fn(() =>
      Promise.resolve({
        ok: true,
        version: "0.0.1",
        network: "testnet",
        timestamp: new Date().toISOString(),
        checks: {
          postgres: { status: "up", latencyMs: 5 },
          horizon: { status: "up", latencyMs: 120 },
          soroban_rpc: { status: "up", latencyMs: 80 },
        },
      } as HealthReport),
    ),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthService,
          useValue: mockHealthService,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  describe("checkLiveness", () => {
    it("should return liveness status with ok: true", () => {
      const result = controller.checkLiveness();

      expect(result.ok).toBe(true);
      expect(result.version).toBe("0.0.1");
      expect(result.network).toBe("testnet");
      expect(result.timestamp).toBeDefined();
    });
  });

  describe("checkReadiness", () => {
    it("should return readiness report with all checks", async () => {
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      } as any;

      await controller.checkReadiness(mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          ok: true,
          checks: expect.objectContaining({
            postgres: expect.objectContaining({ status: "up" }),
            horizon: expect.objectContaining({ status: "up" }),
            soroban_rpc: expect.objectContaining({ status: "up" }),
          }),
        }),
      );
    });

    it("should return 503 when a dependency is down", async () => {
      (mockHealthService.checkReadiness as jest.Mock).mockResolvedValueOnce({
        ok: false,
        version: "0.0.1",
        network: "testnet",
        timestamp: new Date().toISOString(),
        checks: {
          postgres: { status: "up", latencyMs: 5 },
          horizon: { status: "down", latencyMs: 5000, error: "timeout" },
          soroban_rpc: { status: "up", latencyMs: 80 },
        },
      } as HealthReport);

      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      } as any;

      await controller.checkReadiness(mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({ ok: false }),
      );
    });
  });
});
