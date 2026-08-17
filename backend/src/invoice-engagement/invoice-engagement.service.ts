import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateInvoiceEngagementEventDto } from "./dto/create-invoice-engagement-event.dto";

/**
 * Records public invoice engagement events (impressions, wallet launches,
 * copy actions) scoped to the owning invoice and merchant, for later
 * merchant-facing funnel analytics.
 */
@Injectable()
export class InvoiceEngagementService {
  constructor(private readonly prisma: PrismaService) {}

  async recordEvent(
    invoiceId: string,
    dto: CreateInvoiceEngagementEventDto,
  ): Promise<void> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, merchantId: true },
    });
    if (!invoice) {
      throw new NotFoundException(`Invoice with ID "${invoiceId}" not found`);
    }

    await this.prisma.invoiceEngagementEvent.create({
      data: {
        invoiceId: invoice.id,
        merchantId: invoice.merchantId,
        type: dto.type,
        target: dto.target,
      },
    });
  }
}
