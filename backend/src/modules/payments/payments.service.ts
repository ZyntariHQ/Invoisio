import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { formatUnits } from 'ethers';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { InitiatePaymentDto } from './dto/initiate-payment.dto';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService, private config: ConfigService) {}

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
    const data: any = {
      invoiceId: initiatePaymentDto.invoiceId,
      userId,
      token: initiatePaymentDto.token,
      amount: initiatePaymentDto.amount,
      status: 'pending',
    };
    const fallbackMerchant = this.config.get<string>('evm.merchantAddress');
    const merchantAddress = initiatePaymentDto.merchantAddress || fallbackMerchant || null;
    if (merchantAddress) data.merchantAddress = merchantAddress;

    const payment = await this.prisma.payment.create({
      data,
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
    // Fetch rates from public APIs. Prefer CoinGecko for simplicity.
    try {
      const coingeckoIds = {
        ETH: 'ethereum',
        USDC: 'usd-coin',
        USDT: 'tether',
      } as const;

      const qs = `ids=${Object.values(coingeckoIds).join(',')}&vs_currencies=usd`;
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?${qs}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch rates: ${res.status}`);
      }
      const data = await res.json();
      const rates = {
        ETH: data[coingeckoIds.ETH]?.usd ?? 0,
        USDC: data[coingeckoIds.USDC]?.usd ?? 1,
        USDT: data[coingeckoIds.USDT]?.usd ?? 1,
      };
      return {
        rates,
        source: 'coingecko',
        timestamp: new Date().toISOString(),
      };
    } catch (e) {
      // Fallback to stablecoins pegged at 1 and zero for others
      return {
        rates: {
          ETH: 0,
          USDC: 1,
          USDT: 1,
        },
        source: 'fallback',
        timestamp: new Date().toISOString(),
      };
    }
  }

  async confirmPayment(userId: string, id: string, dto: ConfirmPaymentDto) {
    // Ensure payment exists and belongs to user
    const payment = await this.prisma.payment.findFirst({
      where: { id, userId },
    });
    if (!payment) {
      throw new Error('Payment not found');
    }

    let status: 'pending' | 'completed' | 'failed' = dto.status ?? 'pending';

    // Optional on-chain verification via JSON-RPC (basic checks)
    if (dto.verify && dto.transactionHash) {
      const rpcUrl = this.config.get<string>('evm.rpcUrl') || process.env.EVM_RPC_URL;
      const merchantAddress = (((payment as any).merchantAddress as string | undefined) || this.config.get<string>('evm.merchantAddress') || '').toLowerCase();
      const usdcAddress = (this.config.get<string>('evm.usdcAddress') || '').toLowerCase();
      if (rpcUrl) {
        try {
          const receiptBody = {
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_getTransactionReceipt',
            params: [dto.transactionHash],
          };
          const txBody = {
            jsonrpc: '2.0',
            id: 2,
            method: 'eth_getTransactionByHash',
            params: [dto.transactionHash],
          };
          const resReceipt = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(receiptBody),
          });
          const resTx = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(txBody),
          });
          const jsonReceipt = resReceipt.ok ? await resReceipt.json() : null;
          const jsonTx = resTx.ok ? await resTx.json() : null;
          const receipt = jsonReceipt?.result;
          const tx = jsonTx?.result;
          if (receipt && tx) {
            // ETH check: direct send to merchant with matching amount
            if (payment.token === 'ETH') {
              const toMatches = (tx.to || '').toLowerCase() === merchantAddress && !!merchantAddress;
              // Compare amount with small tolerance
              const toNumber = (s: string) => {
                const n = Number(s);
                return Number.isFinite(n) ? n : NaN;
              };
              // tx.value is hex; convert to decimal ETH accurately
              const valueWei = BigInt(tx.value || '0x0');
              const valueEth = parseFloat(formatUnits(valueWei, 18));
              const expected = toNumber(payment.amount);
              const amountMatches = Number.isFinite(expected) && Math.abs(valueEth - expected) <= 1e-6;
              status = receipt.status === '0x1' && toMatches && amountMatches ? 'completed' : 'failed';
            }
            // USDC check: transfer event to merchant
            else if (payment.token === 'USDC' && usdcAddress) {
              const toIsUsdc = (receipt.to || '').toLowerCase() === usdcAddress;
              const logs: any[] = Array.isArray(receipt.logs) ? receipt.logs : [];
              const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'; // keccak of Transfer
              const merchantTopic = merchantAddress ? ('0x000000000000000000000000' + merchantAddress.slice(2)) : '';
              const found = merchantAddress ? logs.some((log) => log.address?.toLowerCase() === usdcAddress && Array.isArray(log.topics) && log.topics[0] === transferTopic && log.topics[2]?.toLowerCase() === merchantTopic.toLowerCase()) : false;
              status = receipt.status === '0x1' && toIsUsdc && found ? 'completed' : 'failed';
            } else {
              status = receipt.status === '0x1' ? 'completed' : 'failed';
            }
          }
        } catch (e) {
          // Keep status as provided/default if verification fails
        }
      }
    }

    const updated = await this.prisma.payment.update({
      where: { id },
      data: {
        transactionHash: dto.transactionHash,
        status,
      },
    });

    return {
      paymentId: updated.id,
      status: updated.status,
      transactionHash: updated.transactionHash,
      verified: dto.verify ?? false,
    };
  }
}