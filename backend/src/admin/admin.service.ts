import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  InvoiceAnalyticsQueryDto,
  InvoiceAnalyticsResponseDto,
  InvoiceStatus,
} from "./dtos/invoice-analytics.dto";
import {
  PaymentAnalyticsQueryDto,
  PaymentAnalyticsResponseDto,
} from "./dtos/payment-analytics.dto";
import { Prisma } from "@prisma/client";

/**
 * Admin service - provides analytics and administrative functions
 */
@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get invoice analytics with optional filtering
   * Uses Prisma aggregations for efficient queries
   */
  async getInvoiceAnalytics(
    query: InvoiceAnalyticsQueryDto,
  ): Promise<InvoiceAnalyticsResponseDto> {
    // Validate date ranges
    query.validateDates();

    // Build the where clause
    const where: Prisma.InvoiceWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) {
        where.createdAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.createdAt.lte = new Date(query.endDate);
      }
    }

    // Get total count and sum using aggregation
    const [totalAggregation, statusBreakdown] = await Promise.all([
      this.prisma.invoice.aggregate({
        where,
        _count: {
          id: true,
        },
        _sum: {
          amount: true,
        },
      }),
      this.prisma.invoice.groupBy({
        by: ["status"],
        where,
        _count: {
          id: true,
        },
        _sum: {
          amount: true,
        },
      }),
    ]);

    // Format the response
    const byStatus = statusBreakdown.map((item) => ({
      status: item.status,
      count: item._count.id,
      amount: item._sum.amount ? Number(item._sum.amount) : 0,
    }));

    const response: InvoiceAnalyticsResponseDto = {
      totalCount: totalAggregation._count.id,
      totalAmount: totalAggregation._sum.amount
        ? Number(totalAggregation._sum.amount)
        : 0,
      byStatus,
    };

    // Add date range if filtering was applied
    if (query.startDate && query.endDate) {
      response.dateRange = {
        startDate: query.startDate,
        endDate: query.endDate,
      };
    }

    return response;
  }

  /**
   * Get payment analytics (payments derived from paid invoices)
   * Uses Prisma aggregations for efficient queries
   */
  async getPaymentAnalytics(
    query: PaymentAnalyticsQueryDto,
  ): Promise<PaymentAnalyticsResponseDto> {
    // Validate date ranges
    query.validateDates();

    // Build the where clause - payments are represented by paid invoices
    const where: Prisma.InvoiceWhereInput = {
      status: InvoiceStatus.paid,
    };

    if (query.asset) {
      where.assetCode = query.asset.toUpperCase();
    }

    if (query.startDate || query.endDate) {
      where.updatedAt = {};
      if (query.startDate) {
        where.updatedAt.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        where.updatedAt.lte = new Date(query.endDate);
      }
    }

    // Get total volume and count
    const [totalAggregation, assetBreakdown] = await Promise.all([
      this.prisma.invoice.aggregate({
        where,
        _count: {
          id: true,
        },
        _sum: {
          amount: true,
        },
      }),
      this.prisma.invoice.groupBy({
        by: ["assetCode", "assetIssuer"],
        where,
        _count: {
          id: true,
        },
        _sum: {
          amount: true,
        },
      }),
    ]);

    // Format the response
    const byAsset = assetBreakdown.map((item) => ({
      assetCode: item.assetCode,
      assetIssuer: item.assetIssuer || undefined,
      volume: item._sum.amount ? Number(item._sum.amount) : 0,
      count: item._count.id,
    }));

    const response: PaymentAnalyticsResponseDto = {
      totalVolume: totalAggregation._sum.amount
        ? Number(totalAggregation._sum.amount)
        : 0,
      totalCount: totalAggregation._count.id,
      byAsset,
    };

    // Add date range if filtering was applied
    if (query.startDate && query.endDate) {
      response.dateRange = {
        startDate: query.startDate,
        endDate: query.endDate,
      };
    }

    return response;
  }
}
