import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  ActivityEventDto,
  ActivityFeedQuery,
  PaginatedActivityEvents,
} from "./dto/activity-event.dto";
import {
  ActivityCursor,
  decodeActivityCursor,
  encodeActivityCursor,
} from "./activity-feed.cursor";

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
   *
   * Supports both offset pagination (`page` / `pageSize` / `limit`) and
   * stable cursor-based pagination (`cursor` / `pageSize`), plus optional
   * filtering by type, invoice identifier, and date range.
   *
   * When `cursor` is provided, results are keyed by (createdAt, id) so pages
   * remain stable even as new events are inserted. Set `before: true` to page
   * backwards from a cursor.
   */
  async findAll(
    merchantId: string,
    query: ActivityFeedQuery = {},
  ): Promise<PaginatedActivityEvents> {
    const pageSize = this.resolvePageSize(query);

    if (query.cursor) {
      return this.findByCursor(merchantId, query, pageSize);
    }

    return this.findByOffset(merchantId, query, pageSize);
  }

  private async findByOffset(
    merchantId: string,
    query: ActivityFeedQuery,
    pageSize: number,
  ): Promise<PaginatedActivityEvents> {
    const page = Math.max(1, query.page ?? 1);
    const skip = (page - 1) * pageSize;
    const where = this.buildWhere(merchantId, query);

    const [items, total] = await Promise.all([
      this.prisma.activityEvent.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
      this.prisma.activityEvent.count({ where }),
    ]);

    return {
      items: items.map((event) => this.toDto(event)),
      total,
      page,
      pageSize,
      hasMore: skip + items.length < total,
      nextCursor:
        items.length > 0
          ? encodeActivityCursor(
              items[items.length - 1].createdAt,
              items[items.length - 1].id,
            )
          : null,
      prevCursor:
        items.length > 0
          ? encodeActivityCursor(items[0].createdAt, items[0].id)
          : null,
    };
  }

  private async findByCursor(
    merchantId: string,
    query: ActivityFeedQuery,
    pageSize: number,
  ): Promise<PaginatedActivityEvents> {
    const cursor: ActivityCursor = decodeActivityCursor(query.cursor!);
    const baseWhere = this.buildWhere(merchantId, query);
    const before = query.before === true;

    const cursorCondition = before
      ? {
          OR: [
            { createdAt: { gt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { gt: cursor.id } },
          ],
        }
      : {
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        };

    const where = { AND: [baseWhere, cursorCondition] };

    const [rows, total] = await Promise.all([
      this.prisma.activityEvent.findMany({
        where,
        take: pageSize + 1,
        orderBy: before
          ? [{ createdAt: "asc" }, { id: "asc" }]
          : [{ createdAt: "desc" }, { id: "desc" }],
      }),
      this.prisma.activityEvent.count({ where: baseWhere }),
    ]);

    const hasMore = rows.length > pageSize;
    const items = before
      ? rows.slice(0, pageSize).reverse()
      : rows.slice(0, pageSize);

    return {
      items: items.map((event) => this.toDto(event)),
      total,
      page: 1,
      pageSize,
      hasMore,
      nextCursor:
        items.length > 0
          ? encodeActivityCursor(
              items[items.length - 1].createdAt,
              items[items.length - 1].id,
            )
          : null,
      prevCursor:
        items.length > 0
          ? encodeActivityCursor(items[0].createdAt, items[0].id)
          : null,
    };
  }

  private buildWhere(
    merchantId: string,
    query: ActivityFeedQuery,
  ): Record<string, unknown> {
    const where: Record<string, unknown> = { merchantId };

    if (query.type && query.type !== "all") {
      where["type"] = query.type;
    }

    if (query.invoiceId) {
      where["invoiceId"] = query.invoiceId;
    }

    if (query.startDate || query.endDate) {
      where["createdAt"] = {};
      if (query.startDate) {
        const start = new Date(query.startDate);
        if (Number.isNaN(start.getTime())) {
          throw new BadRequestException("Invalid startDate");
        }
        (where["createdAt"] as Record<string, unknown>)["gte"] = start;
      }
      if (query.endDate) {
        const end = new Date(query.endDate);
        if (Number.isNaN(end.getTime())) {
          throw new BadRequestException("Invalid endDate");
        }
        (where["createdAt"] as Record<string, unknown>)["lte"] = end;
      }
      if (
        query.startDate &&
        query.endDate &&
        new Date(query.startDate) > new Date(query.endDate)
      ) {
        throw new BadRequestException("startDate must be before endDate");
      }
    }

    return where;
  }

  private resolvePageSize(query: ActivityFeedQuery): number {
    const raw = query.pageSize ?? query.limit ?? 20;
    const size = Number(raw);
    if (!Number.isInteger(size) || size < 1) {
      throw new BadRequestException("pageSize must be a positive integer");
    }
    return Math.min(size, 100);
  }

  private toDto(event: {
    id: string;
    invoiceId: string | null;
    type: string;
    description: string;
    metadata: unknown;
    createdAt: Date;
  }): ActivityEventDto {
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
