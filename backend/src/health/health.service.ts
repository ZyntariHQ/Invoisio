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

export interface AnchoringStatus {
  enabled: boolean;
  contractIdConfigured: boolean;
  adminKeyConfigured: boolean;
  message?: string;
}

export interface HealthReport {
  ok: boolean;
  version: string;
  network: string;
  timestamp: string;
  anchoring: AnchoringStatus;
  checks: {
    postgres: DependencyStatus;
    horizon: DependencyStatus;
    soroban_rpc: DependencyStatus;
  };
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stellarService: StellarService,
    private readonly sorobanService: SorobanService,
    private readonly configService: ConfigService,
  ) {}

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

    const anchoring = this.getAnchoringStatus();

    return {
      ok,
      version: appConfig?.version || "0.0.1",
      network,
      timestamp: new Date().toISOString(),
      anchoring,
      checks: { postgres, horizon, soroban_rpc },
    };
  }

  checkLiveness(): {
    ok: boolean;
    version: string;
    network: string;
    timestamp: string;
    anchoring: AnchoringStatus;
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
      anchoring: this.getAnchoringStatus(),
    };
  }

  private getAnchoringStatus(): AnchoringStatus {
    const enabled = process.env.SOROBAN_ANCHORING_ENABLED === "true";
    const contractId = process.env.SOROBAN_CONTRACT_ID || "";
    const adminKey = process.env.ADMIN_SECRET_KEY || process.env.SOROBAN_SECRET_KEY || "";

    const contractIdConfigured = contractId.length > 0;
    const adminKeyConfigured = adminKey.length > 0;

    let message: string | undefined;
    if (enabled) {
      if (!contractIdConfigured) {
        message = "SOROBAN_CONTRACT_ID is required when anchoring is enabled";
      } else if (!adminKeyConfigured) {
        message = "ADMIN_SECRET_KEY or SOROBAN_SECRET_KEY is required when anchoring is enabled";
      } else {
        message = "Anchoring is fully configured and operational";
      }
    } else {
      message =
        "Anchoring is disabled. Set SOROBAN_ANCHORING_ENABLED=true to enable";
    }

    return {
      enabled,
      contractIdConfigured,
      adminKeyConfigured,
      message,
    };
  }

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
