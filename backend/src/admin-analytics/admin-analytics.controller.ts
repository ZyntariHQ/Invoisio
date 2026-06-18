import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AdminAnalyticsService } from "./admin-analytics.service";
import { AdminGuard } from "../auth/guard/admin.guard";
import { InvoiceAnalyticsQueryDto } from "./dto/invoice-analytics.dto";
import { PaymentAnalyticsQueryDto } from "./dto/payment-analytics.dto";

@Controller("admin/analytics")
@UseGuards(AdminGuard)
export class AdminAnalyticsController {
  constructor(private readonly adminAnalyticsService: AdminAnalyticsService) {}

  @Get("invoices")
  async getInvoiceAnalytics(@Query() query: InvoiceAnalyticsQueryDto) {
    return this.adminAnalyticsService.getInvoiceAnalytics(
      query.status,
      query.startDate,
      query.endDate,
    );
  }

  @Get("payments")
  async getPaymentAnalytics(@Query() query: PaymentAnalyticsQueryDto) {
    return this.adminAnalyticsService.getPaymentAnalytics(
      query.asset,
      query.startDate,
      query.endDate,
    );
  }
}
