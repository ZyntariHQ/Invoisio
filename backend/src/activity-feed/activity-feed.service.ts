import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ActivityEventDto, PaginatedActivityEvents } from "./dto/activity-event.dto";

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
  async findOne(id: string, merchantId: string): Promise<ActivityEventDto | null> {
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
  static formatDescription(type: string, metadata?: Record<string, unknown> | null): string {
    switch (type) {
      case "invoice_created":
        return `Invoice #${metadata?.invoiceNumber ?? "Unknown"} created for ${metadata?.clientName ?? "Unknown client"} — ${metadata?.amount ?? "—"} ${metadata?.assetCode ?? "XLM"}`;
      case "invoice_updated":
        return `Invoice #${metadata?.invoiceNumber ?? "Unknown"} updated`;
      case "invoice_paid":
        return `Invoice #${metadata?.invoiceNumber ?? "Unknown"} fully paid — ${metadata?.amount ?? "—"} ${metadata?.assetCode ?? "XLM"}`;
      case "invoice_partially_paid":
        return `Payment received on invoice #${metadata?.invoiceNumber ?? "Unknown"} — ${metadata?.amount ?? "—"} ${metadata?.assetCode ?? "XLM"} (partially paid)`;
      case "invoice_overdue":
        return `Invoice #${metadata?.invoiceNumber ?? "Unknown"} is now overdue`;
      case "invoice_cancelled":
        return `Invoice #${metadata?.invoiceNumber ?? "Unknown"} was cancelled${metadata?.reason ? ` — ${metadata.reason}` : ""}`;
      case "payment_received":
        return `Payment of ${metadata?.amount ?? "—"} ${metadata?.assetCode ?? "XLM"} received for invoice #${metadata?.invoiceNumber ?? "Unknown"}`;
      case "reminder_sent":
        return `Reminder sent for invoice #${metadata?.invoiceNumber ?? "Unknown"} to ${metadata?.clientEmail ?? "client"}`;
      case "webhook_delivered":
        return `Webhook delivered successfully for invoice #${metadata?.invoiceNumber ?? "Unknown"}`;
      case "webhook_failed":
        return `Webhook delivery failed for invoice #${metadata?.invoiceNumber ?? "Unknown"} after ${metadata?.attempts ?? "several"} attempts`;
      default:
        return metadata?.fallbackDescription as string ?? "Activity event recorded";
    }
  }
}