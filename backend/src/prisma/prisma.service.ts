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

/**
 * Callback executed by the Prisma `$extends` query extension for every
 * top-level model operation. Exported for unit testing in
 * prisma.service.spec.ts — keeps the wiring logic in PrismaService and the
 * testable behavior in a pure-ish function.
 *
 * Responsibilities (in order):
 *  1. Apply tenant scope (multi-tenancy isolation for Invoice and User models)
 *  2. Time the query
 *  3. Log a structured warning if the query exceeds the slow threshold
 *
 * Note: `$extends` only intercepts model operations bound to a `$allModels`
 * extension. Raw queries ($queryRaw / $executeRaw) bypass this callback. The
 * only two raw queries in this codebase (health probe, full-text search in
 * invoices.service.ts) either touch no tenant data or embed a WHERE clause
 * with merchant_id directly — see commit history.
 */
export async function prismaExtensionCallback(
  deps: {
    merchantContext: MerchantContextService;
    structuredLogger: StructuredLogger;
    slowThresholdMs: number;
    logger: Logger;
  },
  ctx: {
    model?: string;
    operation: string;
    args?: Record<string, any>;
    query: (args: Record<string, any>) => Promise<any>;
  },
): Promise<any> {
  // Normalize args to a mutable object before the util mutates it.
  // The util creates a new {} internally when args is undefined, so we mirror
  // that here to keep the same reference visible to the downstream `query`.
  const args = ctx.args ?? {};

  applyMerchantScope(
    { model: ctx.model, action: ctx.operation, args },
    deps.merchantContext.getMerchantId(),
    deps.logger,
  );

  const startedAt = Date.now();
  const result = await ctx.query(args);
  const durationMs = Date.now() - startedAt;

  if (durationMs >= deps.slowThresholdMs) {
    deps.structuredLogger.warn("db.query.slow", {
      category: "database",
      operation: ctx.model ? `${ctx.model}.${ctx.operation}` : ctx.operation,
      durationMs,
      slow: true,
    });
  }

  return result;
}

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

    // Prisma 7 removed `$use` middleware — migrate to client extensions
    // (`$extends`). The extension returns a NEW client object; we bridge it
    // onto `this` via Object.assign so existing call sites
    // (`prisma.invoice.findMany(...)`) keep working without touching the
    // 9 files that consume PrismaService.
    //
    // ORDER MATTERS: `super()` → `$extends()` → `Object.assign()` must run
    // back-to-back. Any code inserted between them that calls a model method
    // would hit the un-extended client.
    const extended = (this as any).$extends({
      query: {
        $allModels: {
          $allOperations: (ctx: any) =>
            prismaExtensionCallback(
              {
                merchantContext: this.merchantContext,
                structuredLogger: this.structuredLogger,
                slowThresholdMs: this.getSlowDbThresholdMs(),
                logger: this.logger,
              },
              ctx,
            ),
        },
      },
    });

    Object.assign(this, extended);
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
