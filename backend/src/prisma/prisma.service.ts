import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log:
        process.env.NODE_ENV === "development"
          ? ["query", "info", "warn", "error"]
          : ["warn", "error"],
    });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log("Prisma connected to database");
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Run a callback within a merchant scope context
   * This is a simplified version - in production this would use a context variable
   */
  async runWithMerchantScope<T>(
    _merchantId: string,
    callback: () => Promise<T> | T,
  ): Promise<T> {
    // For now, just run the callback without scope modification
    // The merchant scoping is handled at the application level
    return callback();
  }
}
