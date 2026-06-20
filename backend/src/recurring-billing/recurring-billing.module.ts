import { Module } from "@nestjs/common";

import { TypeOrmModule } from "@nestjs/typeorm";

import { InvoiceSchedule } from "./entities/invoice-schedule.entity";

import { RecurringBillingService } from "./recurring-billing.service";

import { RecurringInvoiceJob } from "./jobs/create-schedule.dto";

@Module({
  imports: [TypeOrmModule.forFeature([InvoiceSchedule])],

  providers: [RecurringBillingService, RecurringInvoiceJob],

  exports: [RecurringBillingService],
})
export class RecurringBillingModule {}
