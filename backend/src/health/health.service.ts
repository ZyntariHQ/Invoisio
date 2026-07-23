import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";
import { StellarService } from "../stellar/stellar.service";
import { SorobanService } from "../stellar/soroban.service";

export interface DependencyStatus {
  status: "up" | "down";
  latencyMs: number;
  error?: string;
}

export interface HealthReport {
  ok: boolean;
  version: string;
  network: string;
  timestamp: string;
  checks: {
    postgres: DependencyStatus;
    horizon: DependencyStatus;
    soroban_rpc: DependencyStatus;
  };
}

/**
 * Health service — performs readiness checks for all backend dependencies.
 *
 * Each check is isolated so a single failing dependency does not crash the
 * process; it is reported as `{ status: "down" }` in the structured output.
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stellarService: StellarService,
    private readonly sorobanService: SorobanService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Run all dependency checks in parallel and return a structured report.
   */
  async checkReadiness(): Promise<HealthReport> {
    const stellarConfig = this.configService.get("stellar");
    const appConfig = this.configService.get("app");
    const network = stellarConfig?.networkPassphrase?.includes("Test")
      ? "testnet"
      : "mainnet";

    const [postgres, horizon, soroban_rpc] = await Promise.all([
      this.checkPostgres(),
      this.checkHorizon(),
      this.checkSorobanRpc(),
    ]);

    const ok =
      postgres.status === "up" &&
      horizon.status === "up" &&
      soroban_rpc.status === "up";

    return {
      ok,
      version: appConfig?.version || "0.0.1",
      network,
      timestamp: new Date().toISOString(),
      checks: { postgres, horizon, soroban_rpc },
    };
  }

  /**
   * Lightweight liveness probe — no I/O, just confirms the process is running.
   */
  checkLiveness(): {
    ok: boolean;
    version: string;
    network: string;
    timestamp: string;
  } {
    const stellarConfig = this.configService.get("stellar");
    const appConfig = this.configService.get("app");
    const network = stellarConfig?.networkPassphrase?.includes("Test")
      ? "testnet"
      : "mainnet";

    return {
      ok: true,
      version: appConfig?.version || "0.0.1",
      network,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Check Postgres connectivity via a trivial query.
   */
  private async checkPostgres(): Promise<DependencyStatus> {
    const start = Date.now();
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "up", latencyMs: Date.now() - start };
    } catch (err) {
      this.logger.warn(
        `Postgres health check failed: ${(err as Error).message}`,
      );
      return {
        status: "down",
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Check Horizon reachability via the Stellar service probe.
   */
  private async checkHorizon(): Promise<DependencyStatus> {
    try {
      const result = await this.stellarService.pingHorizon();
      if (result.reachable) {
        return { status: "up", latencyMs: result.latencyMs };
      }
      return {
        status: "down",
        latencyMs: result.latencyMs,
        error: result.error,
      };
    } catch (err) {
      return {
        status: "down",
        latencyMs: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Check Soroban RPC reachability via the Soroban service probe.
   */
  private async checkSorobanRpc(): Promise<DependencyStatus> {
    try {
      const result = await this.sorobanService.pingRpc();
      if (result.reachable) {
        return { status: "up", latencyMs: result.latencyMs };
      }
      return {
        status: "down",
        latencyMs: result.latencyMs,
        error: result.error,
      };
    } catch (err) {
      return {
        status: "down",
        latencyMs: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
