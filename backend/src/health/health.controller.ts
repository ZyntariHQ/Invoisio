import { Controller, Get, HttpCode, HttpStatus, Res } from "@nestjs/common";
import type { Response } from "express";
import { HealthService, HealthReport } from "./health.service";

/**
 * Health check controller
 * Provides liveness and readiness endpoints for monitoring and load balancers.
 *
 * - GET /health  — lightweight liveness probe (no I/O), always returns 200.
 * - GET /ready   — readiness probe that checks Postgres, Horizon, and Soroban RPC.
 *                  Returns 200 when all dependencies are healthy, 503 otherwise.
 */
@Controller("health")
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Liveness probe — confirms the process is running.
   * No dependency checks; safe to call frequently.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  checkLiveness() {
    return this.healthService.checkLiveness();
  }

  /**
   * Readiness probe — checks all backend dependencies in parallel.
   * Returns structured per-service status.
   * HTTP 200 when all dependencies are healthy, HTTP 503 when any are down.
   */
  @Get("ready")
  async checkReadiness(@Res() res: Response) {
    const report: HealthReport = await this.healthService.checkReadiness();

    const statusCode = report.ok
      ? HttpStatus.OK
      : HttpStatus.SERVICE_UNAVAILABLE;
    return res.status(statusCode).json(report);
  }
}
