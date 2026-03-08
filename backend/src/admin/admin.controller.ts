import {
  Controller,
  Get,
  Query,
  UseGuards,
  BadRequestException,
  ValidationPipe,
} from "@nestjs/common";
import { AdminService } from "./admin.service";
import { AdminGuard } from "./guards/admin.guard";
import { Auth } from "../auth/guard/auth.guard";
import {
  InvoiceAnalyticsQueryDto,
  InvoiceAnalyticsResponseDto,
} from "./dtos/invoice-analytics.dto";
import {
  PaymentAnalyticsQueryDto,
  PaymentAnalyticsResponseDto,
} from "./dtos/payment-analytics.dto";

/**
 * Admin controller - provides protected analytics endpoints
 * All endpoints require admin role authentication
 */
@Controller("admin/analytics")
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  /**
   * Get invoice analytics with optional filtering by status and date range
   * GET /admin/analytics/invoices?status&startDate&endDate
   */
  @Get("invoices")
  async getInvoiceAnalytics(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: InvoiceAnalyticsQueryDto,
  ): Promise<InvoiceAnalyticsResponseDto> {
    try {
      query.validateDates();
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "Invalid date range",
      );
    }
    return this.adminService.getInvoiceAnalytics(query);
  }

  /**
   * Get payment analytics with optional filtering by asset and date range
   * GET /admin/analytics/payments?asset&startDate&endDate
   */
  @Get("payments")
  async getPaymentAnalytics(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: PaymentAnalyticsQueryDto,
  ): Promise<PaymentAnalyticsResponseDto> {
    try {
      query.validateDates();
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "Invalid date range",
      );
    }
    return this.adminService.getPaymentAnalytics(query);
  }
}
