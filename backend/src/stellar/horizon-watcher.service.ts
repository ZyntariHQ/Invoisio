import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { Subject } from "rxjs";
import { SorobanContractError } from "@invoisio/soroban-client";
import { StellarService } from "./stellar.service";
import { InvoicesService } from "../invoices/invoices.service";
import { InvoicePaidEvent } from "./events/invoice-paid.event";
import { SorobanService } from "../soroban/soroban.service";
import { PrismaService } from "../prisma/prisma.service";
import { RequestContextService } from "../observability/request-context.service";
import { StructuredLogger } from "../observability/structured-logger.service";
import { traceAsync } from "../observability/tracing.util";

const HORIZON_WATCHER_NAME = "horizon" as const;
const FIRST_RUN_CURSOR = "now";
const DEFAULT_MAX_PROCESS_ATTEMPTS = 3;

export interface WatcherCursorState {
  watcher: typeof HORIZON_WATCHER_NAME;
  cursor: string;
  cursorUpdatedAt: Date | null;
  resumed: boolean;
}

@Injectable()
export class HorizonWatcherService implements OnModuleInit, OnModuleDestroy {
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private cursor = FIRST_RUN_CURSOR;
  private polling = false;
  private cursorUpdatedAt: Date | null = null;

  readonly invoicePaid$ = new Subject<InvoicePaidEvent>();

  constructor(
    private readonly configService: ConfigService,
    private readonly stellarService: StellarService,
    private readonly invoicesService: InvoicesService,
    private readonly sorobanService: SorobanService,
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
    private readonly logger: StructuredLogger,
  ) {}

  async onModuleInit(): Promise<void> {
    const merchantKey = this.stellarService.getMerchantPublicKey();
    if (!merchantKey) {
      this.logger.warn("horizon.watcher.disabled", {
        domain: "horizon",
        reason: "missing_merchant_public_key",
      });
      return;
    }

    await this.restoreCursor();
    const intervalMs = this.getPollIntervalMs();
    this.logger.info("horizon.watcher.started", {
      domain: "horizon",
      intervalMs,
      account: merchantKey,
      cursor: this.cursor,
    });

    void this.pollPayments();
    this.pollTimer = setInterval(() => void this.pollPayments(), intervalMs);
  }

  /**
   * Resume the paging cursor from its last durable checkpoint. Only a genuine
   * first run (no persisted row) falls back to "now" — restarting must never
   * silently skip payments that settled while the process was down.
   */
  private async restoreCursor(): Promise<void> {
    try {
      const persisted = await this.prisma.watcherCursor.findUnique({
        where: { watcher: HORIZON_WATCHER_NAME },
      });
      if (persisted) {
        this.cursor = persisted.cursor;
        this.cursorUpdatedAt = persisted.updatedAt;
        this.logger.info("horizon.watcher.cursor_resumed", {
          domain: "horizon",
          cursor: this.cursor,
          persistedAt: persisted.updatedAt,
        });
        return;
      }
    } catch (error) {
      // A transient DB outage on boot should not wedge startup; fall back to
      // "now" but make the degradation loud so drift is visible.
      this.logger.error("horizon.watcher.cursor_restore_failed", {
        domain: "horizon",
        error: (error as Error).message,
      });
    }
    this.logger.info("horizon.watcher.cursor_first_run", {
      domain: "horizon",
      cursor: this.cursor,
    });
  }

  /** Persist the cursor after every advance so restarts resume from here.
   *  Never persists the "now" boot sentinel — doing so would turn every
   *  restart into a fresh "first run" and reintroduce the downtime blind spot. */
  private async checkpointCursor(cursor: string): Promise<void> {
    if (cursor === FIRST_RUN_CURSOR) return;
    try {
      const row = await this.prisma.watcherCursor.upsert({
        where: { watcher: HORIZON_WATCHER_NAME },
        create: { watcher: HORIZON_WATCHER_NAME, cursor },
        update: { cursor },
      });
      this.cursorUpdatedAt = row.updatedAt;
    } catch (error) {
      // In-memory cursor already advanced; log loudly so a persist failure
      // (which would reintroduce the downtime blind spot) is observable.
      this.logger.error("horizon.watcher.cursor_checkpoint_failed", {
        domain: "horizon",
        cursor,
        error: (error as Error).message,
      });
    }
  }

  getCursorState(): WatcherCursorState {
    return {
      watcher: HORIZON_WATCHER_NAME,
      cursor: this.cursor,
      cursorUpdatedAt: this.cursorUpdatedAt,
      resumed: this.cursor !== FIRST_RUN_CURSOR,
    };
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

            const processed = await this.processPaymentWithRetry(
              record,
              memoPrefix,
            );
            if (!processed) {
              // The record exhausted its retry budget and was dead-lettered:
              // stop advancing here so the next poll retries from this point
              // once the operator resolves the poison record.
              break;
            }
            this.cursor = (record as any).paging_token;
          }

          await this.checkpointCursor(this.cursor);
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

  /**
   * Process a payment with a bounded retry budget. A transient failure is
   * retried in-process; a record that keeps failing is quarantined as a
   * dead letter so it cannot stall the watcher indefinitely.
   *
   * Returns true when it is safe to advance the cursor past this record
   * (processed successfully, or dead-lettered for operator review).
   * Returns false only when even the dead-letter write failed — halting
   * advancement guarantees the record is retried rather than skipped.
   */
  private async processPaymentWithRetry(
    record: any,
    memoPrefix: string,
  ): Promise<boolean> {
    const txHash: string = record.transaction_hash;
    const pagingToken: string = record.paging_token;
    const maxAttempts = this.getMaxProcessAttempts();
    const retryDelayMs = this.getRetryDelayMs();

    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.processPayment(record, memoPrefix);
        return true;
      } catch (err) {
        lastError = err;
        this.logger.warn("horizon.payment.attempt_failed", {
          domain: "horizon",
          paymentId: record.id,
          txHash,
          attempt,
          maxAttempts,
          willRetry: attempt < maxAttempts,
          error: (err as Error).message,
        });
        if (attempt < maxAttempts && retryDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
        }
      }
    }

    return this.deadLetterRecord(record, pagingToken, lastError);
  }

  /**
   * Quarantine a poison record with its raw payload so an operator can
   * inspect and replay it. Idempotent per (watcher, recordId): repeated
   * failures increment errorCount instead of duplicating rows.
   */
  private async deadLetterRecord(
    record: any,
    pagingToken: string,
    error: unknown,
  ): Promise<boolean> {
    const txHash: string = record.transaction_hash;
    const message = error instanceof Error ? error.message : String(error);

    try {
      await this.prisma.watcherDeadLetter.upsert({
        where: {
          watcher_recordId: {
            watcher: HORIZON_WATCHER_NAME,
            recordId: String(record.id ?? txHash),
          },
        },
        create: {
          watcher: HORIZON_WATCHER_NAME,
          recordId: String(record.id ?? txHash),
          recordCursor: pagingToken,
          payload: this.serializeRecord(record),
          lastError: message,
        },
        update: {
          recordCursor: pagingToken,
          payload: this.serializeRecord(record),
          lastError: message,
          errorCount: { increment: 1 },
        },
      });

      this.logger.error("horizon.payment.dead_lettered", {
        domain: "horizon",
        paymentId: record.id,
        txHash,
        error: message,
      });
      return true;
    } catch (persistErr) {
      // Cannot even quarantine the record — halt so the cursor stays put
      // and the next poll retries it instead of silently skipping it.
      this.logger.error("horizon.payment.dead_letter_persist_failed", {
        domain: "horizon",
        paymentId: record.id,
        txHash,
        originalError: message,
        persistError:
          persistErr instanceof Error ? persistErr.message : String(persistErr),
      });
      return false;
    }
  }

  private serializeRecord(record: any): any {
    try {
      return JSON.parse(JSON.stringify(record));
    } catch {
      return {
        id: record?.id,
        paging_token: record?.paging_token,
        transaction_hash: record?.transaction_hash,
      };
    }
  }

  private async processPayment(record: any, memoPrefix: string): Promise<void> {
    const txHash: string = record.transaction_hash;

    await this.requestContext.runWithChildContext(
      { correlationId: `horizon:${txHash}` },
      async () => {
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

        const { invoice } = await this.invoicesService.applyHorizonPayment({
          txHash,
          memo: memoId,
          payer: record.from,
          amount: record.amount ?? "0",
          asset_code: record.asset_code ?? "XLM",
          asset_issuer: record.asset_issuer ?? "",
          pagingToken: record.paging_token,
        });
        if (!invoice || invoice.status !== "paid") return;

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

        this.anchorToSoroban(invoice, record, txHash).catch(
          async (err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            const permanent = err instanceof SorobanContractError;

            // A silent anchoring failure leaves an invoice permanently
            // unanchored with no trace — persist it so reconciliation
            // tooling can find and act on it without grepping logs.
            await this.invoicesService
              .recordAnchoringFailure(
                invoice.id,
                permanent ? "permanent" : "transient",
              )
              .catch((persistErr: unknown) =>
                this.logger.error(
                  "horizon.soroban_anchor.failure_record_failed",
                  {
                    domain: "horizon",
                    invoiceId: invoice.id,
                    txHash,
                    error:
                      persistErr instanceof Error
                        ? persistErr.message
                        : String(persistErr),
                  },
                ),
              );

            this.logger.error("horizon.soroban_anchor.failed", {
              domain: "horizon",
              invoiceId: invoice.id,
              txHash,
              permanent,
              ...(err instanceof SorobanContractError
                ? {
                    contractErrorCode: err.code,
                    contractErrorNumericCode: err.numericCode,
                  }
                : {}),
              error: message,
            });
          },
        );
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
          // The native Stellar payment hash anchors the Soroban record to the
          // Horizon settlement it represents — the contract requires it.
          settlementRef: txHash,
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
    } else {
      // Soroban anchoring is not configured for this deployment — an
      // intentional no-op, distinct from an anchoring attempt failing
      // (which now throws and is handled by the caller's .catch()).
      this.logger.debug("horizon.soroban_anchor.skipped", {
        domain: "horizon",
        invoiceId: invoice.id,
        txHash,
        reason: "soroban_not_configured",
      });
    }
  }

  /**
   * Convert an amount string to integer stroops (1 unit = 10^7 stroops).
   * Stellar network assets (native XLM and issued tokens) standardly use 7 decimal places
   * of precision on-chain.
   *
   * Uses exact decimal arithmetic to avoid IEEE-754 binary floating-point errors.
   * Explicit rounding mode: ROUND_HALF_UP is applied if sub-stroop precision is present.
   */
  convertToStroops(amount: string, _assetCode?: string): string {
    const dec = new Prisma.Decimal(amount || "0");
    return dec.times(10_000_000).toFixed(0, Prisma.Decimal.ROUND_HALF_UP);
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

  private getMaxProcessAttempts(): number {
    const raw = this.configService.get<string>("HORIZON_MAX_PROCESS_ATTEMPTS");
    const parsed = parseInt(raw ?? "", 10);
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : DEFAULT_MAX_PROCESS_ATTEMPTS;
  }

  private getRetryDelayMs(): number {
    const raw = this.configService.get<string>("HORIZON_RETRY_DELAY_MS");
    const parsed = parseInt(raw ?? "", 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 250;
  }

  private getSlowNetworkThresholdMs(): number {
    return (
      this.configService.get<number>("observability.slowNetworkThresholdMs") ??
      500
    );
  }
}
