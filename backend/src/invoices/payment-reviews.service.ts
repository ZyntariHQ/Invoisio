import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentReview } from "@prisma/client";

export class ResolveReviewDto {
  action: "attach" | "ignore" | "manually_handled";
  invoiceId?: string;
  resolutionNote?: string;
}

@Injectable()
export class PaymentReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(merchantId: string, status?: string): Promise<PaymentReview[]> {
    const where: any = { merchantId };
    if (status) {
      where.status = status;
    }
    return this.prisma.paymentReview.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { invoice: true },
    });
  }

  async findOne(id: string, merchantId: string): Promise<PaymentReview> {
    const review = await this.prisma.paymentReview.findFirst({
      where: { id, merchantId },
      include: { invoice: true },
    });
    if (!review) {
      throw new NotFoundException(`Payment review not found`);
    }
    return review;
  }

  async resolve(
    id: string,
    merchantId: string,
    data: ResolveReviewDto,
  ): Promise<PaymentReview> {
    const review = await this.findOne(id, merchantId);

    if (data.action === "attach" && !data.invoiceId) {
      throw new Error("invoiceId is required to attach");
    }

    return this.prisma.paymentReview.update({
      where: { id },
      data: {
        status: "resolved",
        invoiceId: data.invoiceId ?? review.invoiceId,
        resolutionNote: data.resolutionNote,
        resolvedAt: new Date(),
      },
    });
  }
}
