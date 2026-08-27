import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { SorobanModule } from "../soroban/soroban.module";
import { InvoicesModule } from "../invoices/invoices.module";
import { AuthModule } from "../auth/auth.module";
import { BackfillService } from "./backfill.service";
import { BackfillController } from "./backfill.controller";

@Module({
  imports: [PrismaModule, SorobanModule, InvoicesModule, AuthModule],
  providers: [BackfillService],
  controllers: [BackfillController],
  exports: [BackfillService],
})
export class BackfillModule {}
