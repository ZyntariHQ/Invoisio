import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Subject } from "rxjs";
import { StellarService } from "./stellar.service";
import { InvoicesService } from "../invoices/invoices.service";
import { InvoicePaidEvent } from "./events/invoice-paid.event";

@Injectable()
export class HorizonWatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HorizonWatcherService.name);
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private cursor = "now";
  private polling = false;

  readonly invoicePaid$ = new Subject<InvoicePaidEvent>();

  constructor(
    private readonly configService: ConfigService,
    private readonly stellarService: StellarService,
    private readonly invoicesService: InvoicesService,
  ) {}

  onModuleInit(): void {
    const merchantKey = this.stellarService.getMerchantPublicKey();
    if (!merchantKey) {
      this.logger.warn(
        "MERCHANT_PUBLIC_KEY not configured; Horizon watcher disabled",
      );
      return;
    }

    const intervalMs = this.getPollIntervalMs();
    this.logger.log(
      `Horizon payment watcher started (interval: ${intervalMs}ms, account: ${merchantKey})`,
    );

    void this.pollPayments();
    this.pollTimer = setInterval(() => void this.pollPayments(), intervalMs);
  }

  onModuleDestroy(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.invoicePaid$.complete();
  }

  async pollPayments(): Promise<void> {
    if (this.polling) return;

    const merchantKey = this.stellarService.getMerchantPublicKey();
    if (!merchantKey) return;

    this.polling = true;
    try {
      const server = this.stellarService.getServer();
      const config = this.stellarService.getConfig();
      const memoPrefix: string = config?.memoPrefix ?? "invoisio-";

      const response = await server
        .payments()
        .forAccount(merchantKey)
        .cursor(this.cursor)
        .order("asc")
        .limit(200)
        .call();

      for (const record of response.records) {
        const type: string = (record as any).type;
        if (
          type !== "payment" &&
          type !== "path_payment_strict_receive" &&
          type !== "path_payment_strict_send"
        ) {
          continue;
        }

        if ((record as any).to !== merchantKey) {
          this.cursor = (record as any).paging_token;
          continue;
        }

        await this.processPayment(record, memoPrefix);
        this.cursor = (record as any).paging_token;
      }
    } catch (error) {
      this.logger.warn(
        `Horizon poll error (transient, will retry): ${(error as Error).message}`,
      );
    } finally {
      this.polling = false;
    }
  }

  private async processPayment(
    record: any,
    memoPrefix: string,
  ): Promise<void> {
    try {
      const tx = await record.transaction();
      const rawMemo: string | undefined = tx?.memo;
      if (!rawMemo) return;

      const memoId = this.resolveMemoId(rawMemo, memoPrefix);
      if (!memoId) return;

      const invoice = await this.invoicesService.findByMemo(memoId);
      if (!invoice || invoice.status === "paid") return;

      const txHash: string = record.transaction_hash;
      await this.invoicesService.markAsPaid(invoice.id, txHash);

      const event = new InvoicePaidEvent(
        invoice.id,
        txHash,
        memoId,
        record.amount ?? "0",
        record.asset_code ?? "XLM",
      );
      this.invoicePaid$.next(event);

      this.logger.log(
        `Invoice ${invoice.id} marked paid | tx: ${txHash} | memo: ${memoId}`,
      );
    } catch (err) {
      this.logger.warn(
        `Failed to process payment ${record.id}: ${(err as Error).message}`,
      );
    }
  }

  private resolveMemoId(rawMemo: string, memoPrefix: string): string | null {
    if (/^\d+$/.test(rawMemo)) {
      return rawMemo;
    }
    if (rawMemo.startsWith(memoPrefix)) {
      return rawMemo.slice(memoPrefix.length);
    }
    return null;
  }

  private getPollIntervalMs(): number {
    const raw = this.configService.get<string>("HORIZON_POLL_INTERVAL");
    const parsed = parseInt(raw ?? "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 15_000;
  }
}
