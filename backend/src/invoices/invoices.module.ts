import { Module } from "@nestjs/common";
import { InvoicesController } from "./invoices.controller";
import { InvoicesService } from "./invoices.service";
import { DraftService } from "./draft.service";
import { PaymentReviewsService } from "./payment-reviews.service";
import { StellarModule } from "../stellar/stellar.module";
import { SorobanModule } from "../soroban/soroban.module";
import { PrismaModule } from "../prisma/prisma.module";
import { WebhooksModule } from "../webhooks/webhooks.module";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { RealtimeModule } from "../realtime/realtime.module";
import { ObservabilityModule } from "../observability/observability.module";
import { ActivityFeedModule } from "../activity-feed/activity-feed.module";

/**
 * Invoices module
 * Provides invoice management functionality with in-memory storage
 * 
 * @module InvoicesModule
 * @description Manages invoice lifecycle including creation, status updates,
 *              payment reconciliation, and draft management
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
    ObservabilityModule,
    ActivityFeedModule,
  ],
  controllers: [InvoicesController],
  providers: [InvoicesService, PaymentReviewsService, DraftService],
  exports: [InvoicesService, DraftService],
})
export class InvoicesModule {}