import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { MerchantContextService } from "./merchant-context.service";

@Global()
@Module({
  providers: [PrismaService, MerchantContextService],
  exports: [PrismaService, MerchantContextService],
})
export class PrismaModule {}
