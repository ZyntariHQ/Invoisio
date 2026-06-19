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
}
