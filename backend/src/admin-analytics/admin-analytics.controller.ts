import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AdminAnalyticsService } from "./admin-analytics.service";
import { AdminGuard } from "../auth/guard/admin.guard";
import { InvoiceAnalyticsQueryDto } from "./dto/invoice-analytics.dto";
import { PaymentAnalyticsQueryDto } from "./dto/payment-analytics.dto";
import { MerchantAnalyticsQueryDto } from "./dto/merchant-analytics.dto";
import { Auth, CurrentUser } from "../auth/guard/auth.guard";
import { User } from "../users/user.entity";
import { PrismaService } from "../prisma/prisma.service";

@Controller("admin/analytics")
@UseGuards(AdminGuard)
export class AdminAnalyticsController {
  constructor(
    private readonly adminAnalyticsService: AdminAnalyticsService,
  ) {}

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

@Controller("merchant/analytics")
export class MerchantAnalyticsController {
  constructor(
    private readonly adminAnalyticsService: AdminAnalyticsService,
    private readonly prisma: PrismaService,
  ) {}

  @Auth()
  @Get("payments")
  async getMerchantAnalytics(
    @CurrentUser() user: User,
    @Query() query: MerchantAnalyticsQueryDto,
  ) {
    return this.prisma.runWithMerchantScope(user.merchantId, () =>
      this.adminAnalyticsService.getMerchantAnalytics(
        user.merchantId,
        query.asset,
        query.startDate,
        query.endDate,
      ),
    );
  }
}
