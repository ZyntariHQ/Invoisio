import { Module } from "@nestjs/common";
import { InvoicesController } from "./invoices.controller";
import { InvoicesService } from "./invoices.service";

/**
 * Invoices module
 * Provides invoice management functionality with in-memory storage
 */
@Module({
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
