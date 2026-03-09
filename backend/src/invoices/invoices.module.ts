import { Module } from "@nestjs/common";
import { InvoicesController } from "./invoices.controller";
import { InvoicesService } from "./invoices.service";
import { StellarModule } from "../stellar/stellar.module";
import { SorobanModule } from "../soroban/soroban.module";
import { PrismaModule } from "../prisma/prisma.module";
import { WebhooksModule } from "../webhooks/webhooks.module";
import { AuthModule } from "../auth/auth.module";

/**
 * Invoices module
 * Provides invoice management functionality with in-memory storage
 */
@Module({
  imports: [
    StellarModule,
    SorobanModule,
    PrismaModule,
    WebhooksModule,
    AuthModule,
  ],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
