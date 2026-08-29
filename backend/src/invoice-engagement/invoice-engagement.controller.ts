import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { Public } from "../auth/guard/auth.guard";
import { InvoiceEngagementService } from "./invoice-engagement.service";
import { CreateInvoiceEngagementEventDto } from "./dto/create-invoice-engagement-event.dto";

/**
 * Public endpoint for capturing invoice-page engagement (impressions,
 * wallet-launch, copy actions) from anonymous payers. No JWT is required —
 * the payer viewing a shared invoice link is never an authenticated user.
 */
@Controller("invoices/:invoiceId/events")
export class InvoiceEngagementController {
  constructor(private readonly engagementService: InvoiceEngagementService) {}

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } }) // 30 events per minute per IP
  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async create(
    @Param("invoiceId") invoiceId: string,
    @Body() dto: CreateInvoiceEngagementEventDto,
  ): Promise<{ status: "recorded" }> {
    await this.engagementService.recordEvent(invoiceId, dto);
    return { status: "recorded" };
  }
}
