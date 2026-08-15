import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CaptureEngagementEventDto } from "./dto/capture-engagement-event.dto";
import {
  InvoiceEngagementEventType,
  Merchant,
  Prisma,
} from "@prisma/client";
import crypto from "crypto";

const PRIVACY_MAX_STRING_FIELDS: Record<string, number> = {
  referrer: 2048,
  userAgent: 512,
  locale: 16,
  deviceCategory: 16,
  sessionId: 64,
};

const FUNNEL_STEP_BY_EVENT: Record<InvoiceEngagementEventType, number> = {
  [InvoiceEngagementEventType.impression]: 1,
  [InvoiceEngagementEventType.expand_payment_instructions]: 2,
  [InvoiceEngagementEventType.copy_destination]: 3,
  [InvoiceEngagementEventType.copy_memo]: 3,
  [InvoiceEngagementEventType.copy_payment_uri]: 3,
  [InvoiceEngagementEventType.copy_asset]: 3,
  [InvoiceEngagementEventType.qr_scan_attempt]: 3,
  [InvoiceEngagementEventType.wallet_launch]: 4,
  [InvoiceEngagementEventType.payment_intent_click]: 4,
  [InvoiceEngagementEventType.print]: 3,
};

/**
 * Deterministically truncate + redact long or risky strings before they reach
 * the database.  We never store IPs and we discard any fields that look like
 * they contain emails or Stellar public keys outside of the canonical
 * merchant/invoice join columns.
 */
function sanitizeField(raw: string | undefined, maxLen: number): string | undefined {
  if (!raw) return undefined;
  if (typeof raw !== "string") return undefined;
  let clean = raw.replace(/\s+/g, " ").trim();
  if (clean.length > maxLen) clean = clean.slice(0, maxLen);
  if (/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(clean)) {
    return "[REDACTED_EMAIL]";
  }
  if (/^G[A-Z2-7]{55}$/.test(clean)) {
    return "[REDACTED_PUBKEY]";
  }
  return clean;
}

function sanitizeMetadata(
  raw: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const keysToDrop = new Set([
    "ip",
    "ipAddress",
    "email",
    "clientEmail",
    "payerEmail",
    "phone",
    "fullName",
    "address",
    "stellarPublicKey",
    "destination",
  ]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (keysToDrop.has(k)) continue;
    if (typeof v === "string") {
      const clean = sanitizeField(v, 512);
      if (!clean) continue;
      out[k] = clean;
    } else if (
      typeof v === "number" ||
      typeof v === "boolean" ||
      v === null ||
      typeof v === "undefined"
    ) {
      out[k] = v;
    }
  }
  if (Object.keys(out).length === 0) return undefined;
  return out;
}

function inferDeviceCategory(raw: string | undefined): string | undefined {
  const ua = (raw || "").toLowerCase();
  if (/(bot|crawl|spider|headless|prerender|phantom|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|curl|wget|python-requests|go-http-client|axios|okhttp)/.test(ua)) {
    return "bot";
  }
  if (/(mobile|android|iphone|ipad|ipod|webos|blackberry|windows phone|opera mini|iemobile)/.test(ua)) {
    if (/(ipad|tablet|playbook|silk|kindle)/.test(ua)) return "tablet";
    return "mobile";
  }
  if (/tablet|ipad|playbook|silk|kindle/.test(ua)) return "tablet";
  return "desktop";
}

@Injectable()
export class InvoiceAnalyticsService {
  private readonly logger = new Logger(InvoiceAnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  private hashAnonymousVisitor(raw: string): string {
    if (!raw || typeof raw !== "string") {
      throw new BadRequestException("anonymizedVisitorId is required");
    }
    if (raw.length <= 64 && /^[A-Za-z0-9_-]+$/.test(raw)) return raw;
    return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 64);
  }

  private async resolveInvoiceAndMerchant(invoiceId: string): Promise<{
    invoiceId: string;
    merchantId: string;
  }> {
    const inv = await this.prisma.invoice.findFirst({
      where: { id: invoiceId },
      select: { id: true, merchantId: true },
    });
    if (!inv) {
      throw new NotFoundException(`Invoice ${invoiceId} not found`);
    }
    return { invoiceId: inv.id, merchantId: inv.merchantId };
  }

  async captureEvent(
    dto: CaptureEngagementEventDto,
  ): Promise<{ id: string; eventType: InvoiceEngagementEventType; capturedAt: Date }> {
    const anonVisitorId = this.hashAnonymousVisitor(dto.anonymizedVisitorId);
    const { invoiceId, merchantId } = await this.resolveInvoiceAndMerchant(
      dto.invoiceId,
    );

    const sanitizedUserAgent = sanitizeField(
      dto.userAgent,
      PRIVACY_MAX_STRING_FIELDS.userAgent,
    );
    const deviceCategory =
      sanitizeField(dto.deviceCategory, PRIVACY_MAX_STRING_FIELDS.deviceCategory) ??
      inferDeviceCategory(dto.userAgent);

    const data: Prisma.InvoiceEngagementEventCreateInput = {
      merchant: { connect: { id: merchantId } },
      invoice: { connect: { id: invoiceId } },
      eventType: dto.eventType,
      anonymizedVisitorId: anonVisitorId,
      referrer: sanitizeField(dto.referrer, PRIVACY_MAX_STRING_FIELDS.referrer),
      userAgent: sanitizedUserAgent,
      viewportWidth: dto.viewportWidth,
      viewportHeight: dto.viewportHeight,
      locale: sanitizeField(dto.locale, PRIVACY_MAX_STRING_FIELDS.locale),
      clientCreatedAt: dto.clientCreatedAt ? new Date(dto.clientCreatedAt) : undefined,
      deviceCategory,
      sessionId: sanitizeField(dto.sessionId, PRIVACY_MAX_STRING_FIELDS.sessionId),
      funnelStep:
        dto.funnelStep ?? FUNNEL_STEP_BY_EVENT[dto.eventType] ?? 1,
      metadata: sanitizeMetadata(dto.metadata),
    };

    try {
      const row = await this.prisma.invoiceEngagementEvent.create({
        data,
        select: { id: true, eventType: true, createdAt: true },
      });
      return {
        id: row.id,
        eventType: row.eventType,
        capturedAt: row.createdAt,
      };
    } catch (err) {
      this.logger.error(
        `Failed to capture engagement event for invoice=${invoiceId}: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  async listEventsForMerchant(
    merchantId: string,
    params: {
      invoiceId?: string;
      eventType?: InvoiceEngagementEventType;
      startDate?: string;
      endDate?: string;
      limit?: number;
      anonymizedVisitorId?: string;
    },
  ) {
    const where: Prisma.InvoiceEngagementEventWhereInput = {
      merchantId: { equals: merchantId },
    };
    if (params.invoiceId) where.invoiceId = params.invoiceId;
    if (params.eventType) where.eventType = params.eventType;
    if (params.anonymizedVisitorId)
      where.anonymizedVisitorId = params.anonymizedVisitorId;
    if (params.startDate || params.endDate) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (params.startDate) createdAt.gte = new Date(params.startDate);
      if (params.endDate) createdAt.lte = new Date(params.endDate);
      if (params.startDate && params.endDate && new Date(params.startDate) > new Date(params.endDate)) {
        throw new BadRequestException("startDate must be <= endDate");
      }
      where.createdAt = createdAt;
    }

    const take = Math.min(params.limit ?? 100, 500);
    const [items, total] = await Promise.all([
      this.prisma.invoiceEngagementEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        select: {
          id: true,
          invoiceId: true,
          eventType: true,
          anonymizedVisitorId: true,
          deviceCategory: true,
          sessionId: true,
          funnelStep: true,
          locale: true,
          viewportWidth: true,
          viewportHeight: true,
          clientCreatedAt: true,
          createdAt: true,
        },
      }),
      this.prisma.invoiceEngagementEvent.count({ where }),
    ]);

    return { items, total, limit: take };
  }

  async getEngagementSummary(
    merchantId: string,
    params: {
      invoiceId?: string;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<{
    totalEvents: number;
    uniqueVisitors: number;
    totalInvoicesEngaged: number;
    eventsByType: Record<string, number>;
    funnel: Array<{ step: number; label: string; count: number; uniqueVisitors: number }>;
    avgTimeToWalletLaunchMs: number | null;
    conversionRates: {
      impressionToWalletLaunch: number;
      impressionToAnyCopyAction: number;
    };
  }> {
    if (params.startDate && params.endDate && new Date(params.startDate) > new Date(params.endDate)) {
      throw new BadRequestException("startDate must be <= endDate");
    }

    const baseWhere: Prisma.InvoiceEngagementEventWhereInput = {
      merchantId: { equals: merchantId },
    };
    if (params.invoiceId) baseWhere.invoiceId = params.invoiceId;
    if (params.startDate || params.endDate) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (params.startDate) createdAt.gte = new Date(params.startDate);
      if (params.endDate) createdAt.lte = new Date(params.endDate);
      baseWhere.createdAt = createdAt;
    }

    const [totalEvents, uniqueVisitors, totalInvoicesEngaged, byTypeGroup, perVisitorEvents] =
      await Promise.all([
        this.prisma.invoiceEngagementEvent.count({ where: baseWhere }),
        this.prisma.invoiceEngagementEvent
          .findMany({
            where: baseWhere,
            distinct: ["anonymizedVisitorId"],
            select: { anonymizedVisitorId: true },
          })
          .then((rows) => rows.length),
        this.prisma.invoiceEngagementEvent
          .findMany({
            where: baseWhere,
            distinct: ["invoiceId"],
            select: { invoiceId: true },
          })
          .then((rows) => rows.length),
        this.prisma.invoiceEngagementEvent.groupBy({
          by: ["eventType"],
          where: baseWhere,
          _count: { eventType: true },
        }),
        this.prisma.invoiceEngagementEvent.findMany({
          where: baseWhere,
          orderBy: { createdAt: "asc" },
          select: {
            anonymizedVisitorId: true,
            eventType: true,
            createdAt: true,
          },
        }),
      ]);

    const eventsByType: Record<string, number> = {};
    for (const row of byTypeGroup) eventsByType[row.eventType] = row._count.eventType;

    const impressions = eventsByType[InvoiceEngagementEventType.impression] ?? 0;
    const walletLaunches = eventsByType[InvoiceEngagementEventType.wallet_launch] ?? 0;
    const copyActions =
      (eventsByType[InvoiceEngagementEventType.copy_destination] ?? 0) +
      (eventsByType[InvoiceEngagementEventType.copy_memo] ?? 0) +
      (eventsByType[InvoiceEngagementEventType.copy_payment_uri] ?? 0) +
      (eventsByType[InvoiceEngagementEventType.copy_asset] ?? 0);

    const impressionToWalletLaunch = impressions > 0 ? walletLaunches / impressions : 0;
    const impressionToAnyCopyAction = impressions > 0 ? copyActions / impressions : 0;

    const eventsByVisitor = new Map<string, Array<{ eventType: InvoiceEngagementEventType; createdAt: Date }>>();
    for (const ev of perVisitorEvents) {
      const list = eventsByVisitor.get(ev.anonymizedVisitorId) ?? [];
      list.push({ eventType: ev.eventType, createdAt: ev.createdAt });
      eventsByVisitor.set(ev.anonymizedVisitorId, list);
    }

    const uniqueVisitorCount = (step: number) => {
      const eventsForStep = new Set<string>();
      for (const [vid, events] of eventsByVisitor.entries()) {
        if (events.some((e) => (FUNNEL_STEP_BY_EVENT[e.eventType] ?? 0) >= step)) {
          eventsForStep.add(vid);
        }
      }
      return eventsForStep.size;
    };

    const funnel: Array<{ step: number; label: string; count: number; uniqueVisitors: number }> = [
      {
        step: 1,
        label: "Viewed invoice",
        count: eventsByType[InvoiceEngagementEventType.impression] ?? 0,
        uniqueVisitors: uniqueVisitorCount(1),
      },
      {
        step: 2,
        label: "Expanded payment instructions",
        count: eventsByType[InvoiceEngagementEventType.expand_payment_instructions] ?? 0,
        uniqueVisitors: uniqueVisitorCount(2),
      },
      {
        step: 3,
        label: "Interacted with payment details (copy/print)",
        count: copyActions + (eventsByType[InvoiceEngagementEventType.print] ?? 0),
        uniqueVisitors: uniqueVisitorCount(3),
      },
      {
        step: 4,
        label: "Launched wallet or confirmed pay intent",
        count:
          walletLaunches +
          (eventsByType[InvoiceEngagementEventType.payment_intent_click] ?? 0),
        uniqueVisitors: uniqueVisitorCount(4),
      },
    ];

    const deltaList: number[] = [];
    for (const events of eventsByVisitor.values()) {
      const impressionsSorted = events
        .filter((e) => e.eventType === InvoiceEngagementEventType.impression)
        .map((e) => e.createdAt.getTime())
        .sort((a, b) => a - b);
      const walletLaunchesSorted = events
        .filter((e) => e.eventType === InvoiceEngagementEventType.wallet_launch)
        .map((e) => e.createdAt.getTime())
        .sort((a, b) => a - b);
      if (!impressionsSorted.length || !walletLaunchesSorted.length) continue;
      const firstImpression = impressionsSorted[0];
      const firstWalletLaunch = walletLaunchesSorted.find((t) => t >= firstImpression);
      if (firstWalletLaunch) deltaList.push(firstWalletLaunch - firstImpression);
    }
    const avgTimeToWalletLaunchMs = deltaList.length
      ? deltaList.reduce((a, b) => a + b, 0) / deltaList.length
      : null;

    return {
      totalEvents,
      uniqueVisitors,
      totalInvoicesEngaged,
      eventsByType,
      funnel,
      avgTimeToWalletLaunchMs,
      conversionRates: {
        impressionToWalletLaunch,
        impressionToAnyCopyAction,
      },
    };
  }

  async assertMerchantOwnsInvoice(merchantId: string, invoiceId: string) {
    const inv = await this.prisma.invoice.findFirst({
      where: { id: invoiceId },
      select: { merchantId: true },
    });
    if (!inv) throw new NotFoundException(`Invoice ${invoiceId} not found`);
    if (inv.merchantId !== merchantId) {
      throw new ForbiddenException(
        "Invoice does not belong to the current merchant",
      );
    }
  }

  async getInvoiceFunnel(
    merchantId: string,
    invoiceId: string,
  ): Promise<{
    invoiceId: string;
    merchantId: string;
    funnel: Array<{ step: number; label: string; count: number; uniqueVisitors: number }>;
    eventsByType: Record<string, number>;
  }> {
    await this.assertMerchantOwnsInvoice(merchantId, invoiceId);
    const summary = await this.getEngagementSummary(merchantId, { invoiceId });
    return {
      invoiceId,
      merchantId,
      funnel: summary.funnel,
      eventsByType: summary.eventsByType,
    };
  }
}
