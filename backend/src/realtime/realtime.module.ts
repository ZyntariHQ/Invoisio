import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { InvoiceEventsService } from "./invoice-events.service";
import { RealtimeController } from "./realtime.controller";

@Module({
  imports: [AuthModule],
  controllers: [RealtimeController],
  providers: [InvoiceEventsService],
  exports: [InvoiceEventsService],
})
export class RealtimeModule {}
