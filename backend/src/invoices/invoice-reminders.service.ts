import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Prisma } from "@prisma/client";
import { PrismaService as AppPrismaService } from "../prisma/prisma.service";
import { WebhooksService } from "../webhooks/webhooks.service";
import { EmailService } from "../notifications/email.service";

type InvoiceWithWebhook = {
  id: string;
  merchantId?: string | null;
  invoiceNumber?: string | null;
  clientEmail?: string | null;
  amount?: Prisma.Decimal | string | number;
  assetCode?: string | null;
  dueDate?: Date | null;
  metadata?: any;
  user?: { webhookUrl?: string | null } | null;
};

const DEFAULT_INTERVALS = [-3, 0, 3];

@Injectable()
export class InvoiceRemindersService {
  private readonly logger = new Logger(InvoiceRemindersService.name);
  private readonly intervals: number[];

  constructor(
    private readonly prisma: AppPrismaService,
    private readonly webhooksService: WebhooksService,
    private readonly emailService: EmailService,
  ) {
    this.intervals = this.parseIntervals(
      process.env.INVOICE_REMINDER_INTERVAL_DAYS || "-3,0,3",
    );
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleInvoiceReminders() {
    this.logger.log("Running invoice due date reminder job...");

    const now = new Date();
    const start = this.startOfDay(
      this.addDays(now, -Math.max(...this.intervals)),
    );
    const end = this.endOfDay(
      this.addDays(now, -Math.min(...this.intervals)),
    );

    const invoices = await this.prisma.invoice.findMany({
      where: {
        status: {
          in: ["pending", "partially_paid", "overdue"],
        },
        dueDate: {
          gte: start,
          lte: end,
        },
      },
      include: { user: true },
    });

    if (invoices.length === 0) {
      this.logger.log("No unpaid invoices found for reminder windows.");
      return;
    }

    let reminderCount = 0;

    for (const invoice of invoices) {
      if (!invoice.dueDate) {
        continue;
      }

      const diffDays = this.daysBetween(
        this.startOfDay(invoice.dueDate),
        this.startOfDay(now),
      );
      if (!this.intervals.includes(diffDays)) {
        continue;
      }

      const reminderKey = this.reminderKey(diffDays);
      const metadata = (invoice.metadata as any) ?? {};
      const sentReminders = Array.isArray(metadata.reminderWindows)
        ? metadata.reminderWindows
        : [];

      if (sentReminders.includes(reminderKey)) {
        continue;
      }

      const subject = this.buildSubject(invoice, diffDays);
      const body = this.buildBody(invoice, diffDays);

      const sent = await this.trySendReminder(invoice, subject, body);
      if (!sent) {
        this.logger.warn(
          `Skipping metadata update for invoice ${invoice.id} because no reminder channel succeeded.`,
        );
        continue;
      }

      await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          metadata: {
            ...metadata,
            reminderWindows: [...sentReminders, reminderKey],
          },
        },
      });
      reminderCount++;
    }

    this.logger.log(`Invoice reminder job completed. Sent ${reminderCount} reminders.`);
  }

  private async trySendReminder(
    invoice: InvoiceWithWebhook,
    subject: string,
    body: string,
  ): Promise<boolean> {
    let succeeded = false;

    if (this.emailService.isEnabled() && invoice.clientEmail) {
      try {
        await this.emailService.sendInvoiceReminder(invoice, subject, body);
        succeeded = true;
      } catch (error) {
        this.logger.warn(
          `Email reminder failed for invoice ${invoice.id}, continuing to webhook if configured.`,
        );
      }
    }

    if (invoice.user?.webhookUrl) {
      try {
        await this.webhooksService.enqueueWebhook(
          invoice.id,
          "reminder",
          null,
          invoice.merchantId ?? undefined,
        );
        succeeded = true;
      } catch (error) {
        this.logger.error(
          `Webhook reminder enqueue failed for invoice ${invoice.id}`,
          error,
        );
      }
    }

    if (!succeeded) {
      this.logger.warn(
        `No reminder channel available for invoice ${invoice.id}.`,
      );
    }

    return succeeded;
  }

  private parseIntervals(raw: string): number[] {
    const parsed = raw
      .split(",")
      .map((item) => parseInt(item.trim(), 10))
      .filter((value) => Number.isFinite(value));
    return parsed.length > 0 ? Array.from(new Set(parsed)).sort((a, b) => a - b) : DEFAULT_INTERVALS;
  }

  private reminderKey(diffDays: number): string {
    if (diffDays < 0) {
      return `before_due_${Math.abs(diffDays)}d`;
    }
    if (diffDays === 0) {
      return "due_today";
    }
    return `after_due_${diffDays}d`;
  }

  private buildSubject(invoice: InvoiceWithWebhook, diffDays: number): string {
    if (diffDays < 0) {
      return `Upcoming Invoice Due: ${invoice.invoiceNumber}`;
    }
    if (diffDays === 0) {
      return `Invoice Due Today: ${invoice.invoiceNumber}`;
    }
    return `Invoice Overdue: ${invoice.invoiceNumber}`;
  }

  private buildBody(invoice: InvoiceWithWebhook, diffDays: number): string {
    const dueDate = invoice.dueDate?.toISOString().slice(0, 10) || "unknown";
    const assetCode = invoice.assetCode ?? "";
    const amount = invoice.amount?.toString?.() ?? "";
    const invoiceNumber = invoice.invoiceNumber ?? "unknown";
    if (diffDays < 0) {
      return `This is a friendly reminder that invoice ${invoiceNumber} for ${amount} ${assetCode} is due on ${dueDate}. Please pay before the due date.`;
    }
    if (diffDays === 0) {
      return `Invoice ${invoiceNumber} for ${amount} ${assetCode} is due today (${dueDate}). Please arrange payment as soon as possible.`;
    }
    return `Invoice ${invoiceNumber} for ${amount} ${assetCode} is overdue by ${diffDays} day(s). Please pay immediately.`;
  }

  private daysBetween(start: Date, end: Date): number {
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.round((end.getTime() - start.getTime()) / msPerDay);
  }

  private startOfDay(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private endOfDay(date: Date): Date {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
  }
}
