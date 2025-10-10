import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { StarknetService } from '../../infra/starknet/starknet.service';
import { logger } from '../../common/utils/logger';

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService, private starknet: StarknetService) {}

  private ratesCache: { data: any; ts: number } | null = null;
  private readonly ratesTtlMs = 60_000; // 1 minute

  async initiatePayment(userId: string, initiatePaymentDto: InitiatePaymentDto) {
    // Check if invoice exists and belongs to user
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: initiatePaymentDto.invoiceId,
        userId,
      },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    // Create payment record in processing status and call Starknet
    const payment = await this.prisma.payment.create({
      data: {
        invoiceId: initiatePaymentDto.invoiceId,
        userId,
        token: initiatePaymentDto.token,
        amount: initiatePaymentDto.amount,
        status: 'processing',
      },
    });

    // In real flow, `from` would be payer's account; using user's wallet address is safest when held
    // Backend cannot sign; we return a placeholder tx hash from StarknetService
    const { transactionHash } = await this.starknet.transferToken({
      from: 'backend',
      to: invoice.userId,
      token: initiatePaymentDto.token,
      amount: initiatePaymentDto.amount,
    });

    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: { transactionHash },
    });

    logger.log(`Payment initiated: paymentId=${payment.id} tx=${transactionHash}`);
    return {
      paymentId: updated.id,
      status: updated.status,
      transactionHash: updated.transactionHash,
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
      throw new NotFoundException('Payment not found');
    }

    if (payment.transactionHash) {
      const { status } = await this.starknet.getTxStatus(payment.transactionHash);
      if (status !== payment.status && (status === 'completed' || status === 'failed' || status === 'processing')) {
        await this.prisma.payment.update({ where: { id }, data: { status } });
        payment.status = status;
      }
    }

    return {
      status: payment.status,
      transactionHash: payment.transactionHash,
    };
  }

  async getRates() {
    const now = Date.now();
    if (this.ratesCache && now - this.ratesCache.ts < this.ratesTtlMs) {
      return this.ratesCache.data;
    }

    const url = 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum,starknet,tether,usd-coin&vs_currencies=usd';
    try {
      const res = await fetch(url, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`Failed to fetch rates: ${res.status}`);
      const data = await res.json();
      const mapped = {
        rates: {
          ETH: data.ethereum?.usd ?? null,
          STRK: data.starknet?.usd ?? null,
          USDC: data['usd-coin']?.usd ?? 1,
          USDT: data.tether?.usd ?? 1,
        },
        timestamp: new Date().toISOString(),
      };
      this.ratesCache = { data: mapped, ts: now };
      return mapped;
    } catch (e) {
      const fallback = {
        rates: { ETH: 0, STRK: 0, USDC: 1, USDT: 1 },
        timestamp: new Date().toISOString(),
      };
      this.ratesCache = { data: fallback, ts: now };
      return fallback;
    }
  }
}