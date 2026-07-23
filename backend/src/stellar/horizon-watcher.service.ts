import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Subject } from "rxjs";
import { StellarService } from "./stellar.service";
import { InvoicesService } from "../invoices/invoices.service";
import { InvoicePaidEvent } from "./events/invoice-paid.event";
import { SorobanService } from "./soroban.service";
import { RequestContextService } from "../observability/request-context.service";
import { StructuredLogger } from "../observability/structured-logger.service";
import { traceAsync } from "../observability/tracing.util";

@Injectable()
export class HorizonWatcherService implements OnModuleInit, OnModuleDestroy {
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private cursor = "now";
  private polling = false;

  readonly invoicePaid$ = new Subject<InvoicePaidEvent>();

  constructor(
    private readonly configService: ConfigService,
    private readonly stellarService: StellarService,
    private readonly invoicesService: InvoicesService,
    private readonly sorobanService: SorobanService,
    private readonly requestContext: RequestContextService,
    private readonly logger: StructuredLogger,
  ) {}

  onModuleInit(): void {
    const merchantKey = this.stellarService.getMerchantPublicKey();
    if (!merchantKey) {
      this.logger.warn("horizon.watcher.disabled", {
        domain: "horizon",
        reason: "missing_merchant_public_key",
      });
      return;
    }

    const intervalMs = this.getPollIntervalMs();
    this.logger.info("horizon.watcher.started", {
      domain: "horizon",
      intervalMs,
      account: merchantKey,
    });

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

    await this.requestContext.runWithWorkerContext(
      { workerName: "horizon-watcher" },
      async () => {
        this.polling = true;
        try {
          const server = this.stellarService.getServer();
          const config = this.stellarService.getConfig();
          const memoPrefix: string = config?.memoPrefix ?? "invoisio-";

          const response = await traceAsync(
            this.logger,
            {
              operation: "horizon.payments.list",
              category: "network",
              slowThresholdMs: this.getSlowNetworkThresholdMs(),
              attributes: { account: merchantKey, cursor: this.cursor },
            },
            () =>
              server
                .payments()
                .forAccount(merchantKey)
                .cursor(this.cursor)
                .order("asc")
                .limit(200)
                .call(),
          );

          this.logger.debug("horizon.poll.complete", {
            domain: "horizon",
            recordCount: response.records.length,
            cursor: this.cursor,
          });

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
          this.logger.warn("horizon.poll.error", {
            domain: "horizon",
            error: (error as Error).message,
          });
        } finally {
          this.polling = false;
        }
      },
    );
  }

  private async processPayment(record: any, memoPrefix: string): Promise<void> {
    const txHash: string = record.transaction_hash;

    await this.requestContext.runWithChildContext(
      { correlationId: `horizon:${txHash}` },
      async () => {
        try {
          const tx = await traceAsync(
            this.logger,
            {
              operation: "horizon.transaction.get",
              category: "network",
              slowThresholdMs: this.getSlowNetworkThresholdMs(),
              attributes: { txHash },
            },
            () => record.transaction(),
          );

          const rawMemo: string | undefined = (tx as { memo?: string } | null)
            ?.memo;
          if (!rawMemo) return;

          const memoId = this.resolveMemoId(rawMemo, memoPrefix);
          if (!memoId) return;

          const invoice = await this.invoicesService.findByMemo(memoId);
          if (!invoice || invoice.status === "paid") return;

          await this.invoicesService.markAsPaid(invoice.id, txHash);

          const event = new InvoicePaidEvent(
            invoice.id,
            txHash,
            memoId,
            record.amount ?? "0",
            record.asset_code ?? "XLM",
          );
          this.invoicePaid$.next(event);

          this.logger.info("horizon.payment.matched", {
            domain: "horizon",
            event: "invoice_marked_paid",
            invoiceId: invoice.id,
            txHash,
            memo: memoId,
            amount: record.amount ?? "0",
            assetCode: record.asset_code ?? "XLM",
          });

          this.anchorToSoroban(invoice, record, txHash).catch((err) =>
            this.logger.error("horizon.soroban_anchor.failed", {
              domain: "horizon",
              invoiceId: invoice.id,
              txHash,
              error: err.message,
            }),
          );
        } catch (err) {
          this.logger.warn("horizon.payment.process_failed", {
            domain: "horizon",
            paymentId: record.id,
            txHash,
            error: (err as Error).message,
          });
        }
      },
    );
  }

  private async anchorToSoroban(
    invoice: any,
    record: any,
    txHash: string,
  ): Promise<void> {
    const amount = this.convertToStroops(record.amount, record.asset_code);

    const metadata = await traceAsync(
      this.logger,
      {
        operation: "soroban.record_payment",
        category: "network",
        slowThresholdMs: this.getSlowNetworkThresholdMs(),
        attributes: { invoiceId: invoice.id, txHash },
      },
      () =>
        this.sorobanService.recordPayment({
          invoiceId: invoice.memo,
          payer: record.from,
          assetCode: record.asset_code ?? "XLM",
          assetIssuer: record.asset_issuer ?? "",
          amount,
        }),
    );

    if (metadata) {
      await this.invoicesService.updateSorobanMetadata(
        invoice.id,
        metadata.txHash,
        metadata.contractId,
      );
      this.logger.info("horizon.soroban_anchor.complete", {
        domain: "horizon",
        invoiceId: invoice.id,
        sorobanTxHash: metadata.txHash,
        contractId: metadata.contractId,
      });
    }
  }

  private convertToStroops(amount: string, assetCode: string): string {
    const num = parseFloat(amount);
    if (assetCode === "XLM") {
      return String(Math.round(num * 10_000_000));
    }
    return String(Math.round(num * 10_000_000));
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

  private getSlowNetworkThresholdMs(): number {
    return (
      this.configService.get<number>("observability.slowNetworkThresholdMs") ??
      500
    );
  }
}
