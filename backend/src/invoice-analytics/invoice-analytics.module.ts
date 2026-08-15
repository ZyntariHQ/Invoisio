import { Module } from "@nestjs/common";
import { InvoiceAnalyticsService } from "./invoice-analytics.service";
import { PrismaModule } from "../prisma/prisma.module";
import { InvoiceAnalyticsController } from "./invoice-analytics.controller";

@Module({
  imports: [PrismaModule],
  providers: [InvoiceAnalyticsService],
  controllers: [InvoiceAnalyticsController],
  exports: [InvoiceAnalyticsService],
})
export class InvoiceAnalyticsModule {}
