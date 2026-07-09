import { Module } from "@nestjs/common";
import { InvoicesController } from "./invoices.controller";
import { InvoicesService } from "./invoices.service";
import { StellarModule } from "../stellar/stellar.module";
import { SorobanModule } from "../soroban/soroban.module";
import { PrismaModule } from "../prisma/prisma.module";
import { WebhooksModule } from "../webhooks/webhooks.module";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { InvoicePdfService } from "./invoice-pdf.service";

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
    NotificationsModule,
    RealtimeModule,
  ],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoicePdfService],
  exports: [InvoicesService, InvoicePdfService],
})
export class InvoicesModule {}
