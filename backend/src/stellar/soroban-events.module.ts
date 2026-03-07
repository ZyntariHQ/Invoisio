import { Module } from "@nestjs/common";
import { SorobanEventsService } from "./soroban-events.service";
import { InvoicesModule } from "../invoices/invoices.module";
import { StellarModule } from "./stellar.module";

@Module({
  imports: [StellarModule, InvoicesModule],
  providers: [SorobanEventsService],
  exports: [SorobanEventsService],
})
export class SorobanEventsModule {}
