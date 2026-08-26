import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { MerchantsController } from "./merchants.controller";
import { MerchantProfileAliasController } from "./merchant-profile-alias.controller";
import { MerchantsService } from "./merchants.service";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [MerchantsController, MerchantProfileAliasController],
  providers: [MerchantsService],
  exports: [MerchantsService],
})
export class MerchantsModule {}

export { MerchantsModule as MerchantModule };
