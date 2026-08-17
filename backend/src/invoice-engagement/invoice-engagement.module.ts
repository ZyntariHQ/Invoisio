import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { InvoiceEngagementController } from "./invoice-engagement.controller";
import { InvoiceEngagementService } from "./invoice-engagement.service";

@Module({
  imports: [PrismaModule],
  controllers: [InvoiceEngagementController],
  providers: [InvoiceEngagementService],
  exports: [InvoiceEngagementService],
})
export class InvoiceEngagementModule {}
