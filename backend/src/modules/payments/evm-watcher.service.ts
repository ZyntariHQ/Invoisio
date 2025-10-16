import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { JsonRpcProvider, Interface, formatUnits, id, type Log, type Filter } from 'ethers';

@Injectable()
export class EvmWatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EvmWatcherService.name);
  private provider?: JsonRpcProvider;
  private stopFns: (() => void)[] = [];

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    const rpcUrl = this.config.get<string>('evm.rpcUrl');
    const chainId = this.config.get<number>('evm.chainId');
    const usdcAddress = (this.config.get<string>('evm.usdcAddress') || '').toLowerCase();
    const routerAddress = (this.config.get<string>('evm.routerAddress') || '').toLowerCase();

    if (!rpcUrl || !chainId) {
      this.logger.warn('EVM watcher disabled: rpcUrl/chainId missing');
      return;
    }
    // If merchant address is not set, we still proceed and match per-payment merchantAddress.

    this.provider = new JsonRpcProvider(rpcUrl, chainId);
    this.logger.log(`EVM watcher connected: chainId=${chainId}`);

    // ETH transfers: scan blocks and match txs where to == merchant
    const onBlock = async (blockNumber: number) => {
      try {
        const block = await this.provider!.getBlock(blockNumber);
        if (!block?.transactions?.length) return;
        for (const txHash of block.transactions) {
          try {
            const tx = await this.provider!.getTransaction(txHash);
            if (!tx) continue;
            if (!tx.to) continue;
            if (tx.value === 0n) continue;
            const fromAddr = tx.from ? tx.from.toLowerCase() : '';
            const toAddr = tx.to.toLowerCase();
            await this.handleEthPayment(fromAddr, toAddr, tx.hash, tx.value);
          } catch (innerErr: any) {
            this.logger.warn(`Tx fetch error: ${innerErr?.message || innerErr}`);
          }
        }
      } catch (err: any) {
        this.logger.warn(`Block scan error: ${err?.message || err}`);
      }
    };
    this.provider.on('block', onBlock);
    this.stopFns.push(() => this.provider?.off('block', onBlock));

    // USDC Transfer events (match per-payment merchantAddress)
    if (usdcAddress) {
      const ERC20_TRANSFER = id('Transfer(address,address,uint256)');
      const filter: Filter = {
        address: usdcAddress,
        topics: [ERC20_TRANSFER],
      };
      const iface = new Interface(['event Transfer(address indexed from, address indexed to, uint256 value)']);

      const onLog = async (log: Log) => {
        try {
          const parsed = iface.parseLog(log);
          if (!parsed) return;
          const from = (parsed.args.from as string).toLowerCase();
          const to = (parsed.args.to as string).toLowerCase();
          const value = parsed.args.value as bigint;
          if (!log.transactionHash) return;
          await this.handleTokenPayment('USDC', from, to, log.transactionHash, value, 6);
        } catch (err: any) {
          this.logger.warn(`USDC log parse error: ${err?.message || err}`);
        }
      };
      this.provider.on(filter, onLog);
      this.stopFns.push(() => this.provider?.off(filter, onLog));
    }

    // PaymentRouter events: match ETH via router and USDC via router using emitted merchant
    if (routerAddress) {
      const PAYMENT_RECEIVED = id('PaymentReceived(bytes32,address,address,address,uint256)');
      const routerFilter: Filter = { address: routerAddress, topics: [PAYMENT_RECEIVED] };
      const routerIface = new Interface(['event PaymentReceived(bytes32 indexed invoiceId, address indexed payer, address indexed token, address merchant, uint256 amount)']);

      const onRouterLog = async (log: Log) => {
        try {
          const parsed = routerIface.parseLog(log);
          if (!parsed || !log.transactionHash) return;
          const payer = (parsed.args.payer as string).toLowerCase();
          const tokenAddr = (parsed.args.token as string).toLowerCase();
          const merchant = (parsed.args.merchant as string).toLowerCase();
          const amount = parsed.args.amount as bigint;

          // ETH via router
          if (tokenAddr === '0x0000000000000000000000000000000000000000') {
            await this.handleEthPayment(payer, merchant, log.transactionHash, amount);
          }
          // USDC via router
          else if (usdcAddress && tokenAddr === usdcAddress) {
            await this.handleTokenPayment('USDC', payer, merchant, log.transactionHash, amount, 6);
          }
        } catch (err: any) {
          this.logger.warn(`Router log parse error: ${err?.message || err}`);
        }
      };
      this.provider.on(routerFilter, onRouterLog);
      this.stopFns.push(() => this.provider?.off(routerFilter, onRouterLog));
    }
  }

  async onModuleDestroy() {
    for (const stop of this.stopFns) {
      try { stop(); } catch {}
    }
    this.stopFns = [];
  }

  private async handleEthPayment(from: string, to: string, txHash: string, valueWei: bigint) {
    const amountEth = formatUnits(valueWei, 18);
    await this.matchAndCompletePayment({ token: 'ETH', from, to, amountStr: amountEth, txHash });
  }

  private async handleTokenPayment(token: 'USDC' | 'USDT', from: string, to: string, txHash: string, value: bigint, decimals: number) {
    const amount = formatUnits(value, decimals);
    await this.matchAndCompletePayment({ token, from, to, amountStr: amount, txHash });
  }

  private async matchAndCompletePayment(params: { token: 'ETH' | 'USDC' | 'USDT'; from: string; to?: string; amountStr: string; txHash: string; }) {
    try {
      const user = await this.prisma.user.findFirst({ where: { walletAddress: params.from } });
      if (!user) return;

      // Find the most recent pending payment for this user & token with close amount
      const pending = await this.prisma.payment.findMany({
        where: { userId: user.id, status: 'pending', token: params.token },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
      if (!pending.length) return;

      const matchTolerance = 1e-6; // accept minor rounding differences

      const toNumber = (s: string) => {
        const n = Number(s);
        return Number.isFinite(n) ? n : NaN;
      };

      const defaultMerchant = (this.config.get<string>('evm.merchantAddress') || '').toLowerCase();
      let matched: { id: string } | null = null;
      for (const p of pending) {
        const pMerchant = (((p as any).merchantAddress as string | undefined) || defaultMerchant).toLowerCase();
        if (params.to) {
          const toLower = params.to.toLowerCase();
          if (!pMerchant || pMerchant !== toLower) continue;
        }
        const a = toNumber(p.amount);
        const b = toNumber(params.amountStr);
        if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
        if (Math.abs(a - b) <= matchTolerance) { matched = { id: p.id }; break; }
      }
      if (!matched) return;

      await this.prisma.payment.update({
        where: { id: matched.id },
        data: { status: 'completed', transactionHash: params.txHash },
      });

      this.logger.log(`Payment matched & completed: token=${params.token} user=${user.id} tx=${params.txHash}`);
    } catch (err: any) {
      this.logger.warn(`matchAndCompletePayment error: ${err?.message || err}`);
    }
  }
}