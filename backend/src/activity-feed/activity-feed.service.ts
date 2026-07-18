import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  ActivityEventDto,
  PaginatedActivityEvents,
} from "./dto/activity-event.dto";

@Injectable()
export class ActivityFeedService {
  private readonly logger = new Logger(ActivityFeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record an activity event for the merchant's activity feed.
   */
  async recordEvent(params: {
    merchantId: string;
    userId?: string | null;
    invoiceId?: string | null;
    type: string;
    description: string;
    metadata?: Record<string, unknown> | null;
  }): Promise<ActivityEventDto> {
    const event = await this.prisma.activityEvent.create({
      data: {
        merchantId: params.merchantId,
        userId: params.userId ?? null,
        invoiceId: params.invoiceId ?? null,
        type: params.type,
        description: params.description,
        metadata: (params.metadata as any) ?? undefined,
      },
    });

    return new ActivityEventDto({
      id: event.id,
      invoiceId: event.invoiceId,
      type: event.type,
      description: event.description,
      metadata: event.metadata as Record<string, unknown> | null,
      createdAt: event.createdAt,
    });
  }

  /**
   * Get paginated activity events for a merchant, newest first.
   * Supports optional type filtering.
   */
  async findAll(
    merchantId: string,
    page = 1,
    pageSize = 20,
    type?: string,
  ): Promise<PaginatedActivityEvents> {
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { merchantId };
    if (type && type !== "all") {
      where["type"] = type;
    }

    const [items, total] = await Promise.all([
      this.prisma.activityEvent.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.activityEvent.count({ where }),
    ]);

    return {
      items: items.map(
        (event) =>
          new ActivityEventDto({
            id: event.id,
            invoiceId: event.invoiceId,
            type: event.type,
            description: event.description,
            metadata: event.metadata as Record<string, unknown> | null,
            createdAt: event.createdAt,
          }),
      ),
      total,
      page,
      pageSize,
      hasMore: skip + items.length < total,
    };
  }

  /**
   * Get a single activity event by ID (scoped to merchant).
   */
  async findOne(
    id: string,
    merchantId: string,
  ): Promise<ActivityEventDto | null> {
    const event = await this.prisma.activityEvent.findFirst({
      where: { id, merchantId },
    });

    if (!event) return null;

    return new ActivityEventDto({
      id: event.id,
      invoiceId: event.invoiceId,
      type: event.type,
      description: event.description,
      metadata: event.metadata as Record<string, unknown> | null,
      createdAt: event.createdAt,
    });
  }

  /**
   * Build a human-readable description for a given activity event type.
   */
  static formatDescription(
    type: string,
    metadata?: Record<string, unknown> | null,
  ): string {
    const safeStr = (val: unknown, fallback: string): string => {
      if (val === null || val === undefined) return fallback;
      if (typeof val === "string") return val;
      if (typeof val === "number" || typeof val === "boolean")
        return String(val);
      return fallback;
    };

    switch (type) {
      case "invoice_created":
        return `Invoice #${safeStr(metadata?.invoiceNumber, "Unknown")} created for ${safeStr(metadata?.clientName, "Unknown client")} — ${safeStr(metadata?.amount, "—")} ${safeStr(metadata?.assetCode, "XLM")}`;
      case "invoice_updated":
        return `Invoice #${safeStr(metadata?.invoiceNumber, "Unknown")} updated`;
      case "invoice_paid":
        return `Invoice #${safeStr(metadata?.invoiceNumber, "Unknown")} fully paid — ${safeStr(metadata?.amount, "—")} ${safeStr(metadata?.assetCode, "XLM")}`;
      case "invoice_partially_paid":
        return `Payment received on invoice #${safeStr(metadata?.invoiceNumber, "Unknown")} — ${safeStr(metadata?.amount, "—")} ${safeStr(metadata?.assetCode, "XLM")} (partially paid)`;
      case "invoice_overdue":
        return `Invoice #${safeStr(metadata?.invoiceNumber, "Unknown")} is now overdue`;
      case "invoice_cancelled":
        return `Invoice #${safeStr(metadata?.invoiceNumber, "Unknown")} was cancelled${metadata?.reason ? ` — ${safeStr(metadata.reason, "")}` : ""}`;
      case "payment_received":
        return `Payment of ${safeStr(metadata?.amount, "—")} ${safeStr(metadata?.assetCode, "XLM")} received for invoice #${safeStr(metadata?.invoiceNumber, "Unknown")}`;
      case "reminder_sent":
        return `Reminder sent for invoice #${safeStr(metadata?.invoiceNumber, "Unknown")} to ${safeStr(metadata?.clientEmail, "client")}`;
      case "webhook_delivered":
        return `Webhook delivered successfully for invoice #${safeStr(metadata?.invoiceNumber, "Unknown")}`;
      case "webhook_failed":
        return `Webhook delivery failed for invoice #${safeStr(metadata?.invoiceNumber, "Unknown")} after ${safeStr(metadata?.attempts, "several")} attempts`;
      default:
        return safeStr(
          metadata?.fallbackDescription,
          "Activity event recorded",
        );
    }
  }
}
