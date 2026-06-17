import { Injectable } from "@nestjs/common";

import { Cron, CronExpression } from "@nestjs/schedule";

import { RecurringBillingService } from "../recurring-billing.service";

@Injectable()
export class RecurringInvoiceJob {
  constructor(private service: RecurringBillingService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async run() {
    await this.service.processSchedules();
  }
}
