import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { MerchantContextService } from "./merchant-context.service";
import { applyMerchantScope } from "./merchant-scope.util";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(private readonly merchantContext: MerchantContextService) {
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
        params as any,
        this.merchantContext.getMerchantId(),
        this.logger,
      );
      return next(params);
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
}
