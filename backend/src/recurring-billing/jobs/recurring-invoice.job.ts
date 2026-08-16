import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { RecurringBillingService } from "../recurring-billing.service";

/**
 * Daily cron that generates invoices for every due recurring schedule.
 * Safe to run more than once for the same day/instance: duplicate
 * generation is prevented at the DB layer in RecurringBillingService.
 */
@Injectable()
export class RecurringInvoiceJob {
  private readonly logger = new Logger(RecurringInvoiceJob.name);

  constructor(private readonly service: RecurringBillingService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async run(): Promise<void> {
    const { processed, failed } = await this.service.processDueSchedules();
    this.logger.log(
      `Recurring billing run complete: ${processed} generated, ${failed} failed`,
    );
  }
}
