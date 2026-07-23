import { Module } from "@nestjs/common";
import { AdminAnalyticsController, MerchantAnalyticsController } from "./admin-analytics.controller";
import { AdminAnalyticsService } from "./admin-analytics.service";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [AdminAnalyticsController, MerchantAnalyticsController],
  providers: [AdminAnalyticsService],
})
export class AdminAnalyticsModule {}
