import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  Prisma,
  RecurringFrequency,
  RecurringSchedule,
  RecurringScheduleStatus,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { StellarService } from "../stellar/stellar.service";
import { CreateScheduleDto } from "./dto/create-schedule.dto";

/**
 * Manages recurring billing rules and turns them into invoices on schedule.
 * Persistence is Prisma (the live app's data layer) — this used to be a
 * standalone TypeORM entity that no module ever imported.
 */
@Injectable()
export class RecurringBillingService {
  private readonly logger = new Logger(RecurringBillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stellarService: StellarService,
  ) {}

  /** Merchants define a recurring rule for a saved customer. */
  async createSchedule(
    merchantId: string,
    userId: string,
    dto: CreateScheduleDto,
  ): Promise<RecurringSchedule> {
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, merchantId },
    });
    if (!customer) {
      throw new NotFoundException(
        `Customer "${dto.customerId}" not found for this merchant`,
      );
    }

    return this.prisma.recurringSchedule.create({
      data: {
        merchantId,
        customerId: dto.customerId,
        createdByUserId: userId,
        amount: dto.amount as unknown as Prisma.Decimal,
        assetCode: dto.assetCode,
        assetIssuer: dto.assetIssuer ?? null,
        description: dto.description ?? null,
        frequency: dto.frequency,
        nextRunDate: this.computeNextRunDate(new Date(), dto.frequency),
      },
    });
  }

  async listSchedules(merchantId: string): Promise<RecurringSchedule[]> {
    return this.prisma.recurringSchedule.findMany({
      where: { merchantId },
      orderBy: { createdAt: "desc" },
    });
  }

  async cancelSchedule(
    merchantId: string,
    scheduleId: string,
  ): Promise<RecurringSchedule> {
    const schedule = await this.prisma.recurringSchedule.findFirst({
      where: { id: scheduleId, merchantId },
    });
    if (!schedule) {
      throw new NotFoundException(`Schedule "${scheduleId}" not found`);
    }
    return this.prisma.recurringSchedule.update({
      where: { id: scheduleId },
      data: { status: RecurringScheduleStatus.cancelled },
    });
  }

  /**
   * Entry point for the cron job. Finds every due, active schedule and
   * generates its invoice one at a time so one bad schedule can't abort
   * the rest of the run.
   */
  async processDueSchedules(): Promise<{ processed: number; failed: number }> {
    const due = await this.prisma.recurringSchedule.findMany({
      where: {
        status: RecurringScheduleStatus.active,
        nextRunDate: { lte: new Date() },
      },
    });

    let processed = 0;
    let failed = 0;
    for (const schedule of due) {
      try {
        await this.generateInvoiceForSchedule(schedule);
        processed++;
      } catch (error) {
        failed++;
        this.logger.error(
          `Failed to generate invoice for schedule ${schedule.id}`,
          error as Error,
        );
      }
    }
    return { processed, failed };
  }

  /**
   * Generates the invoice for a schedule's current due period, at most
   * once. Safety comes from the unique (scheduleId, periodKey) constraint
   * on RecurringInvoiceRun, enforced inside the same transaction.
   */
  async generateInvoiceForSchedule(schedule: RecurringSchedule): Promise<void> {
    const periodKey = this.computePeriodKey(schedule.nextRunDate);
    const nextRunDate = this.computeNextRunDate(
      schedule.nextRunDate,
      schedule.frequency,
    );
    const customer = await this.prisma.customer.findUniqueOrThrow({
      where: { id: schedule.customerId },
    });

    try {
      await this.prisma.$transaction(async (tx) => {
        // This insert is the duplicate guard: a second attempt for the
        // same schedule + period hits the unique index and throws P2002.
        const run = await tx.recurringInvoiceRun.create({
          data: { scheduleId: schedule.id, periodKey },
        });

        const invoice = await tx.invoice.create({
          data: this.buildInvoiceData(
            schedule,
            customer,
            `${schedule.id}-${periodKey}`,
          ),
        });

        await tx.recurringInvoiceRun.update({
          where: { id: run.id },
          data: { invoiceId: invoice.id },
        });

        await tx.recurringSchedule.update({
          where: { id: schedule.id },
          data: { nextRunDate, lastGeneratedAt: new Date() },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        // Already generated for this period by another run/retry — no-op.
        this.logger.warn(
          `Skipped duplicate generation for schedule ${schedule.id}, period ${periodKey}`,
        );
        return;
      }
      throw error;
    }
  }

  private buildInvoiceData(
    schedule: RecurringSchedule,
    customer: { name: string; email: string | null },
    cycleKey: string,
  ) {
    return {
      merchantId: schedule.merchantId,
      userId: schedule.createdByUserId,
      customerId: schedule.customerId,
      invoiceNumber: `REC-${cycleKey}`,
      clientName: customer.name,
      clientEmail: customer.email ?? "",
      description: schedule.description ?? undefined,
      amount: schedule.amount,
      amountPaid: 0 as unknown as Prisma.Decimal,
      amountDue: schedule.amount,
      assetCode: schedule.assetCode,
      assetIssuer: schedule.assetIssuer ?? undefined,
      memo: this.generateMemoId(),
      memoType: "ID",
      status: "pending" as const,
      destinationAddress: this.stellarService.getMerchantPublicKey(),
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      statusHistory: { create: { status: "pending" as const } },
    };
  }

  /** Deterministic per-cycle key so retries of the same run collide safely. */
  private computePeriodKey(nextRunDate: Date): string {
    return nextRunDate.toISOString().slice(0, 10);
  }

  private computeNextRunDate(
    from: Date,
    frequency: RecurringFrequency,
  ): Date {
    const days = frequency === RecurringFrequency.MONTHLY ? 30 : 7;
    return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
  }

  private generateMemoId(): string {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 65536);
    return String(timestamp * 65536 + random);
  }
}
