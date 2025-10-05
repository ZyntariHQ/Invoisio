import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService) {}

  async initiatePayment(userId: string, initiatePaymentDto: InitiatePaymentDto) {
    // Check if invoice exists and belongs to user
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: initiatePaymentDto.invoiceId,
        userId,
      },
    });

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    // Create payment record
    const payment = await this.prisma.payment.create({
      data: {
        invoiceId: initiatePaymentDto.invoiceId,
        userId,
        token: initiatePaymentDto.token,
        amount: initiatePaymentDto.amount,
        status: 'pending',
      },
    });

    return {
      paymentId: payment.id,
      status: payment.status,
    };
  }

  async getPaymentStatus(userId: string, id: string) {
    const payment = await this.prisma.payment.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!payment) {
      throw new Error('Payment not found');
    }

    return {
      status: payment.status,
      transactionHash: payment.transactionHash,
    };
  }

  async getRates() {
    // Mock rates - in a real implementation, you would fetch from an API
    const rates = {
      ETH: 1,
      STRK: 1,
      USDC: 1,
      USDT: 1,
    };

    return {
      rates,
      timestamp: new Date().toISOString(),
    };
  }
}