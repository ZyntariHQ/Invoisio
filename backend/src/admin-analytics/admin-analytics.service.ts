import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { InvoiceStatus } from "@prisma/client";

@Injectable()
export class AdminAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getInvoiceAnalytics(
    status?: InvoiceStatus,
    startDate?: string,
    endDate?: string,
  ) {
    const where: any = {};

    if (status) {
      where.status = status;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        if (isNaN(start.getTime())) {
          throw new BadRequestException("Invalid startDate");
        }
        where.createdAt.gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        if (isNaN(end.getTime())) {
          throw new BadRequestException("Invalid endDate");
        }
        where.createdAt.lte = end;
      }
      if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
        throw new BadRequestException("startDate must be before endDate");
      }
    }

    const [countResult, totalResult, statusBreakdown] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.aggregate({
        where,
        _sum: { amount: true },
      }),
      this.prisma.invoice.groupBy({
        where,
        by: ["status"],
        _count: true,
        _sum: { amount: true },
      }),
    ]);

    return {
      count: countResult,
      totalAmount: totalResult._sum.amount?.toNumber() || 0,
      statusBreakdown: statusBreakdown.map((item) => ({
        status: item.status,
        count: item._count,
        totalAmount: item._sum.amount?.toNumber() || 0,
      })),
    };
  }

  async getPaymentAnalytics(
    asset?: string,
    startDate?: string,
    endDate?: string,
  ) {
    const where: any = { status: InvoiceStatus.paid };

    if (asset) {
      where.assetCode = asset;
    }

    if (startDate || endDate) {
      where.updatedAt = {};
      if (startDate) {
        const start = new Date(startDate);
        if (isNaN(start.getTime())) {
          throw new BadRequestException("Invalid startDate");
        }
        where.updatedAt.gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        if (isNaN(end.getTime())) {
          throw new BadRequestException("Invalid endDate");
        }
        where.updatedAt.lte = end;
      }
      if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
        throw new BadRequestException("startDate must be before endDate");
      }
    }

    const [countResult, totalResult, assetBreakdown] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.aggregate({
        where,
        _sum: { amount: true },
      }),
      this.prisma.invoice.groupBy({
        where,
        by: ["assetCode", "assetIssuer"],
        _count: true,
        _sum: { amount: true },
      }),
    ]);

    return {
      count: countResult,
      totalVolume: totalResult._sum.amount?.toNumber() || 0,
      assetBreakdown: assetBreakdown.map((item) => ({
        assetCode: item.assetCode,
        assetIssuer: item.assetIssuer,
        count: item._count,
        volume: item._sum.amount?.toNumber() || 0,
      })),
    };
  }

  async getMerchantAnalytics(
    merchantId: string,
    asset?: string,
    startDate?: string,
    endDate?: string,
  ) {
    const where: any = {
      merchantId,
      status: InvoiceStatus.paid,
    };

    if (asset) {
      where.assetCode = asset;
    }

    if (startDate || endDate) {
      where.updatedAt = {};
      if (startDate) {
        const start = new Date(startDate);
        if (isNaN(start.getTime())) {
          throw new BadRequestException("Invalid startDate");
        }
        where.updatedAt.gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        if (isNaN(end.getTime())) {
          throw new BadRequestException("Invalid endDate");
        }
        where.updatedAt.lte = end;
      }
      if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
        throw new BadRequestException("startDate must be before endDate");
      }
    }

    const [countResult, totalResult, assetBreakdown] = await Promise.all([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.aggregate({
        where,
        _sum: { amount: true },
      }),
      this.prisma.invoice.groupBy({
        where,
        by: ["assetCode", "assetIssuer"],
        _count: true,
        _sum: { amount: true },
      }),
    ]);

    return {
      count: countResult,
      totalVolume: totalResult._sum.amount?.toNumber() || 0,
      assetBreakdown: assetBreakdown.map((item) => ({
        assetCode: item.assetCode,
        assetIssuer: item.assetIssuer,
        count: item._count,
        volume: item._sum.amount?.toNumber() || 0,
      })),
    };
  }

  /**
   * Merchant-scoped dashboard KPI snapshot: paid, overdue, draft, and
   * outstanding invoice totals.
   *
   * Great for the merchant dashboard's headline cards — one round-trip for
   * the four core metrics. All buckets are scoped to `merchantId`.
   *
   * - `paid`       — fully paid invoices (`status = paid`)
   * - `overdue`    — past due, unpaid invoices (`status = overdue`)
   * - `draft`      — not-yet-issued drafts (`status = draft`)
   * - `outstanding`— issued but not fully paid (`pending`, `partially_paid`,
   *                  `overdue`); totals the remaining `amountDue`
   *
   * An account with no invoices returns the same shape with every bucket at
   * `{ count: 0, totalAmount: 0 }`.
   */
  async getMerchantAnalyticsOverview(merchantId: string) {
    const merchantWhere: any = { merchantId };

    const [paid, overdue, draft, outstanding] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: { ...merchantWhere, status: InvoiceStatus.paid },
        _count: true,
        _sum: { amount: true },
      }),
      this.prisma.invoice.aggregate({
        where: { ...merchantWhere, status: InvoiceStatus.overdue },
        _count: true,
        _sum: { amount: true },
      }),
      this.prisma.invoice.aggregate({
        where: { ...merchantWhere, status: InvoiceStatus.draft },
        _count: true,
        _sum: { amount: true },
      }),
      this.prisma.invoice.aggregate({
        where: {
          ...merchantWhere,
          status: {
            in: [
              InvoiceStatus.pending,
              InvoiceStatus.partially_paid,
              InvoiceStatus.overdue,
            ],
          },
        },
        _count: true,
        _sum: { amountDue: true },
      }),
    ]);

    return {
      paid: {
        count: paid._count,
        totalAmount: paid._sum.amount?.toNumber() || 0,
      },
      overdue: {
        count: overdue._count,
        totalAmount: overdue._sum.amount?.toNumber() || 0,
      },
      draft: {
        count: draft._count,
        totalAmount: draft._sum.amount?.toNumber() || 0,
      },
      outstanding: {
        count: outstanding._count,
        totalAmount: outstanding._sum.amountDue?.toNumber() || 0,
      },
    };
  }
}
