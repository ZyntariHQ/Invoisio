import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { InvoiceSchedule } from "./entities/invoice-schedule.entity";

@Injectable()
export class RecurringBillingService {
  constructor(
    @InjectRepository(InvoiceSchedule)
    private repo: Repository<InvoiceSchedule>,
  ) {}

  async createSchedule(data: any) {
    const nextDate =
      data.frequency === "MONTHLY"
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const schedule = this.repo.create({
      ...data,

      nextRunDate: nextDate,

      cycleKey: `${data.merchantId}-${Date.now()}`,
    });

    return this.repo.save(schedule);
  }

  async processSchedules() {
    const schedules = await this.repo.find();

    for (const schedule of schedules) {
      if (new Date() >= schedule.nextRunDate) {
        await this.generateInvoice(schedule);
      }
    }
  }

  private async generateInvoice(schedule: any) {
    const cycleKey = `${schedule.merchantId}-${schedule.customerId}-${new Date().getMonth()}`;

    const exists = await this.repo.findOne({
      where: {
        cycleKey,
      },
    });

    if (exists) {
      return;
    }

    console.log("Creating invoice", schedule);

    schedule.nextRunDate =
      schedule.frequency === "MONTHLY"
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    schedule.cycleKey = cycleKey;

    await this.repo.save(schedule);
  }
}
