import { Controller, Post, Body, BadRequestException } from "@nestjs/common";
import { InvoiceAnalyticsService } from "./invoice-analytics.service";
import { CaptureEngagementEventDto } from "./dto/capture-engagement-event.dto";

@Controller("public/invoice-engagement")
export class InvoiceAnalyticsController {
  constructor(private readonly analytics: InvoiceAnalyticsService) {}

  @Post()
  async capture(@Body() dto: CaptureEngagementEventDto) {
    try {
      const res = await this.analytics.captureEvent(dto);
      return { success: true, id: res.id, eventType: res.eventType, capturedAt: res.capturedAt };
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }
}
