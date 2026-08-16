import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { StellarModule } from "../stellar/stellar.module";
import { AuthModule } from "../auth/auth.module";
import { RecurringBillingService } from "./recurring-billing.service";
import { RecurringBillingController } from "./recurring-billing.controller";
import { RecurringInvoiceJob } from "./jobs/recurring-invoice.job";

@Module({
  imports: [PrismaModule, StellarModule, AuthModule],
  controllers: [RecurringBillingController],
  providers: [RecurringBillingService, RecurringInvoiceJob],
  exports: [RecurringBillingService],
})
export class RecurringBillingModule {}
