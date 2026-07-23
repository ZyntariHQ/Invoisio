import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { MerchantContextService } from "./merchant-context.service";
import { applyMerchantScope } from "./merchant-scope.util";
import { StructuredLogger } from "../observability/structured-logger.service";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(
    private readonly merchantContext: MerchantContextService,
    private readonly structuredLogger: StructuredLogger,
    private readonly configService: ConfigService,
  ) {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL,
    });

    super({
      adapter,
      log:
        process.env.NODE_ENV === "development"
          ? ["query", "info", "warn", "error"]
          : ["warn", "error"],
    });

    (this as any).$use(async (params: any, next: any) => {
      applyMerchantScope(
        params,
        this.merchantContext.getMerchantId(),
        this.logger,
      );

      const startedAt = Date.now();
      const result = await next(params);
      const durationMs = Date.now() - startedAt;
      const slowThresholdMs = this.getSlowDbThresholdMs();
      const operation = params.model
        ? `${params.model}.${params.action}`
        : params.action;

      if (durationMs >= slowThresholdMs) {
        this.structuredLogger.warn("db.query.slow", {
          category: "database",
          operation,
          durationMs,
          slow: true,
        });
      }

      return result;
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log("Prisma connected to database");
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  runWithMerchantScope<T>(
    merchantId: string,
    callback: () => Promise<T> | T,
  ): Promise<T> {
    return this.merchantContext.runWithMerchantScope(merchantId, callback);
  }

  private getSlowDbThresholdMs(): number {
    return (
      this.configService.get<number>("observability.slowDbThresholdMs") ?? 200
    );
  }
}
