import { Controller, Sse } from "@nestjs/common";
import { Observable } from "rxjs";
import { Auth, CurrentUser } from "../auth/guard/auth.guard";
import { User } from "../users/user.entity";
import {
  InvoiceEventsService,
  InvoiceStatusEvent,
} from "./invoice-events.service";

@Controller("realtime")
export class RealtimeController {
  constructor(private readonly invoiceEvents: InvoiceEventsService) {}

  @Auth()
  @Sse("invoices")
  streamInvoices(
    @CurrentUser() user: User,
  ): Observable<{ data: InvoiceStatusEvent }> {
    return this.invoiceEvents.streamForMerchant(user.merchantId);
  }
}
