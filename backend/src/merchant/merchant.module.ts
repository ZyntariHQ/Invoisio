import { Module } from "@nestjs/common";
import { MerchantController } from "./merchant.controller";
import { MerchantService } from "./merchant.service";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";

/**
 * MerchantModule
 * Provides merchant profile and settings management.
 */
@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [MerchantController],
  providers: [MerchantService],
  exports: [MerchantService],
})
export class MerchantModule {}
