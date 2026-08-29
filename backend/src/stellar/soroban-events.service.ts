import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { scValToNative, xdr } from "@stellar/stellar-sdk";
import { InvoicesService } from "../invoices/invoices.service";
import { PrismaService } from "../prisma/prisma.service";
import https from "node:https";
import { URL } from "node:url";
import { RequestContextService } from "../observability/request-context.service";
import { StructuredLogger } from "../observability/structured-logger.service";
import { traceAsync } from "../observability/tracing.util";
import {
  EVENT_SCHEMA_VERSION,
  SorobanInvoiceClient,
} from "@invoisio/soroban-client";

type Json = Record<string, any>;

const SOROBAN_WATCHER_NAME = "soroban" as const;
const DEFAULT_MAX_PROCESS_ATTEMPTS = 3;

export interface WatcherCursorState {
  watcher: typeof SOROBAN_WATCHER_NAME;
  cursor: string | undefined;
  cursorUpdatedAt: Date | null;
  resumed: boolean;
}

@Injectable()
export class SorobanEventsService implements OnModuleInit, OnModuleDestroy {
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private cursor: string | undefined = undefined;
  private backoffMs = 1000;
  private cursorUpdatedAt: Date | null = null;
  /**
   * Lazily-built read-only client used to fetch full payment details for an
   * event. As of issue #512 `InvoicePaymentRecorded` carries only
   * `invoice_id` — payer/asset/amount are no longer in the public event
   * payload, so this watcher must call `get_payment(invoice_id)` (an
   * unauthenticated read, gated only on already knowing the id) to recover
   * them for reconciliation.
   */
  private sorobanReadClient: SorobanInvoiceClient | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly invoices: InvoicesService,
    private readonly prisma: PrismaService,
    private readonly requestContext: RequestContextService,
    private readonly logger: StructuredLogger,
  ) {}

  async onModuleInit(): Promise<void> {
    const rpcUrl = this.getRpcUrl();
    const contractId = this.getContractId();
    if (!rpcUrl || !contractId) {
      this.logger.warn("soroban.events.disabled", {
        domain: "soroban",
        reason: "missing_rpc_or_contract",
      });
      return;
    }
    await this.restoreCursor();
    this.running = true;
    this.logger.info("soroban.events.started", {
      domain: "soroban",
      rpcUrl,
      contractId,
      cursor: this.cursor,
    });
    this.scheduleNext(0);
  }

  /**
   * Resume the event cursor from its last durable checkpoint. Only a genuine
   * first run (no persisted row) starts with no cursor — restarting must
   * never re-derive a start point that skips events settled during downtime.
   */
  private async restoreCursor(): Promise<void> {
    try {
      const persisted = await this.prisma.watcherCursor.findUnique({
        where: { watcher: SOROBAN_WATCHER_NAME },
      });
      if (persisted) {
        this.cursor = persisted.cursor;
        this.cursorUpdatedAt = persisted.updatedAt;
        this.logger.info("soroban.events.cursor_resumed", {
          domain: "soroban",
          cursor: this.cursor,
          persistedAt: persisted.updatedAt,
        });
        return;
      }
    } catch (error) {
      // A transient DB outage on boot should not wedge startup; fall back to
      // a derived start point but make the degradation loud.
      this.logger.error("soroban.events.cursor_restore_failed", {
        domain: "soroban",
        error: (error as Error).message,
      });
    }
    this.logger.info("soroban.events.cursor_first_run", {
      domain: "soroban",
      cursor: this.cursor ?? "(none)",
    });
  }

  /** Persist the cursor after every advance so restarts resume from here. */
  private async checkpointCursor(cursor: string): Promise<void> {
    try {
      const row = await this.prisma.watcherCursor.upsert({
        where: { watcher: SOROBAN_WATCHER_NAME },
        create: { watcher: SOROBAN_WATCHER_NAME, cursor },
        update: { cursor },
      });
      this.cursorUpdatedAt = row.updatedAt;
    } catch (error) {
      // In-memory cursor already advanced; log loudly so a persist failure
      // (which would reintroduce the downtime blind spot) is observable.
      this.logger.error("soroban.events.cursor_checkpoint_failed", {
        domain: "soroban",
        cursor,
        error: (error as Error).message,
      });
    }
  }

  getCursorState(): WatcherCursorState {
    return {
      watcher: SOROBAN_WATCHER_NAME,
      cursor: this.cursor,
      cursorUpdatedAt: this.cursorUpdatedAt,
      resumed: this.cursor !== undefined,
    };
  }

  onModuleDestroy(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext(delayMs: number) {
    if (!this.running) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.tick(), delayMs);
  }

  private async tick(): Promise<void> {
    if (!this.running) return;

    await this.requestContext.runWithWorkerContext(
      { workerName: "soroban-events" },
      async () => {
        try {
          const resp = await this.fetchEvents();
          const events: any[] = resp?.result?.events ?? [];

          this.logger.debug("soroban.events.poll.complete", {
            domain: "soroban",
            eventCount: events.length,
            cursor: this.cursor,
          });

          for (const ev of events) {
            const pagingToken: string | undefined =
              ev?.pagingToken ?? ev?.paging_token;
            const safeToAdvance = await this.handleEventWithRetry(ev);
            if (!safeToAdvance) {
              // Even dead-lettering failed — halt so this event is retried
              // on the next poll instead of being silently skipped.
              break;
            }
            if (pagingToken) {
              this.cursor = pagingToken;
              await this.checkpointCursor(this.cursor);
            }
          }
          this.backoffMs = 1000;
          this.scheduleNext(events.length > 0 ? 50 : 500);
        } catch (err) {
          const msg = (err as Error).message;
          this.logger.warn("soroban.events.poll.error", {
            domain: "soroban",
            error: msg,
            backoffMs: this.backoffMs,
          });
          this.backoffMs = Math.min(this.backoffMs * 2, 30000);
          this.scheduleNext(this.backoffMs);
        }
      },
    );
  }

  /**
   * Handle a single event with a bounded retry budget. A transient failure
   * is retried in-process; an event that keeps failing is quarantined as a
   * dead letter so it cannot stall the watcher indefinitely.
   *
   * Returns true when it is safe to advance the cursor past this event
   * (handled successfully, or dead-lettered for operator review).
   * Returns false only when even the dead-letter write failed.
   */
  private async handleEventWithRetry(ev: any): Promise<boolean> {
    const eventId = String(
      ev?.id ?? ev?.eventId ?? ev?.pagingToken ?? Date.now(),
    );
    const maxAttempts = this.getMaxProcessAttempts();
    const retryDelayMs = this.getRetryDelayMs();

    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.handleEvent(ev);
        return true;
      } catch (err) {
        lastError = err;
        this.logger.warn("soroban.event.attempt_failed", {
          domain: "soroban",
          eventId,
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

    return this.deadLetterEvent(ev, eventId, lastError);
  }

  /**
   * Quarantine a poison event with its raw payload so an operator can
   * inspect and replay it. Idempotent per (watcher, recordId): repeated
   * failures increment errorCount instead of duplicating rows.
   */
  private async deadLetterEvent(
    ev: any,
    eventId: string,
    error: unknown,
  ): Promise<boolean> {
    const message = error instanceof Error ? error.message : String(error);
    const pagingToken: string | undefined = ev?.pagingToken ?? ev?.paging_token;

    try {
      await this.prisma.watcherDeadLetter.upsert({
        where: {
          watcher_recordId: {
            watcher: SOROBAN_WATCHER_NAME,
            recordId: eventId,
          },
        },
        create: {
          watcher: SOROBAN_WATCHER_NAME,
          recordId: eventId,
          recordCursor: pagingToken,
          payload: this.serializeEvent(ev),
          lastError: message,
        },
        update: {
          recordCursor: pagingToken,
          payload: this.serializeEvent(ev),
          lastError: message,
          errorCount: { increment: 1 },
        },
      });

      this.logger.error("soroban.event.dead_lettered", {
        domain: "soroban",
        eventId,
        error: message,
      });
      return true;
    } catch (persistErr) {
      // Cannot even quarantine the event — halt so the cursor stays put
      // and the next poll retries it instead of silently skipping it.
      this.logger.error("soroban.event.dead_letter_persist_failed", {
        domain: "soroban",
        eventId,
        originalError: message,
        persistError:
          persistErr instanceof Error ? persistErr.message : String(persistErr),
      });
      return false;
    }
  }

  private serializeEvent(ev: any): any {
    try {
      return JSON.parse(JSON.stringify(ev));
    } catch {
      return { id: ev?.id, pagingToken: ev?.pagingToken };
    }
  }

  async handleEvent(ev: any): Promise<void> {
    const eventId = String(
      ev?.id ?? ev?.eventId ?? ev?.pagingToken ?? Date.now(),
    );

    await this.requestContext.runWithChildContext(
      { correlationId: `soroban:${eventId}` },
      async () => {
        const topic = ev?.topic ?? ev?.topics ?? ev?.event?.topics ?? null;
        const expect = this.getTopic();
        if (Array.isArray(topic) && expect && topic.length > 0) {
          const flat = topic.map((t: any) =>
            typeof t === "string" ? t : String(t?.symbol ?? t),
          );
          const hasTopic =
            flat.includes(expect) ||
            flat.includes(expect.toLowerCase()) ||
            flat.includes(expect.toUpperCase());
          if (!hasTopic) {
            return;
          }
        }

        const val =
          ev?.value ??
          ev?.event?.value ??
          ev?.data ??
          ev?.event?.data ??
          ev?.body ??
          {};

        const payload = this.coercePaymentRecorded(val);
          if (!payload || !payload.invoice_id) {
            this.logger.warn("soroban.event.schema_mismatch_or_unparseable", {
              domain: "soroban",
              eventId,
              rawSchemaVersion: (val as any)?.schema_version,
              expectedSchemaVersion: EVENT_SCHEMA_VERSION,
            });
            return;
          }

        const invoiceId = String(payload.invoice_id);
        const ledger =
          Number(ev?.ledger ?? ev?.inLedger ?? ev?.ledgers ?? 0) || undefined;

        this.logger.info("soroban.event.received", {
          domain: "soroban",
          event: "payment_recorded",
          eventId,
          invoiceId,
          ledger,
        });

        // As of issue #512 the event carries only invoice_id — fetch the
        // full record via get_payment(invoice_id) for reconciliation.
        const record = await this.fetchPaymentRecord(invoiceId);

        await this.invoices.applySorobanPaymentEvent({
          eventId,
          contractId: this.getContractId(),
          ledger,
          invoice_id: invoiceId,
          payer: record?.payer,
          asset_code: record?.asset_code,
          asset_issuer: record?.asset_issuer,
          amount: record?.amount,
        });
      },
    );
  }

  private coercePaymentRecorded(obj: any): {
    invoice_id?: string;
    schema_version?: number;
  } | null {
    if (typeof obj === "string") {
      try {
        const parsed = xdr.ScVal.fromXDR(obj, "base64");
        obj = scValToNative(parsed);
      } catch {
        return null;
      }
    }

    if (!obj || typeof obj !== "object") return null;
    if ("invoice_id" in obj) {
      return Number(obj.schema_version) === EVENT_SCHEMA_VERSION ? obj : null;
    }
    if (Array.isArray(obj?.map)) {
      const out: Record<string, any> = {};
      for (const entry of obj.map) {
        const key =
          entry?.key?.symbol ?? entry?.key?.string ?? entry?.key ?? undefined;
        const rawVal = entry?.val;
        const val =
          rawVal?.string ??
          rawVal?.address ??
          rawVal?.i128 ??
          rawVal?.i64 ??
          rawVal?.u64 ??
          rawVal?.u32 ??
          rawVal?.bool ??
          rawVal?.symbol ??
          rawVal?.bytes ??
          rawVal ??
          undefined;
        if (key !== undefined) {
          out[String(key)] = val;
        }
      }
      return Number(out.schema_version) === EVENT_SCHEMA_VERSION ? (out as any) : null;
    }
    return null;
  }

  /**
   * Fetch the full payment record for `invoiceId` via `get_payment` —
   * unauthenticated, gated only on already knowing the invoice_id, exactly
   * the "know the ID, verify it" property the minimized event (issue #512)
   * relies on. Returns `undefined` fields (not a thrown error swallowed
   * silently) only when Soroban reads aren't configured at all; a genuine
   * RPC failure propagates so the retry/dead-letter path in
   * `handleEventWithRetry` can do its job instead of silently reconciling
   * with missing payer/asset/amount data.
   */
  private async fetchPaymentRecord(invoiceId: string): Promise<
    | {
        payer?: string;
        asset_code?: string;
        asset_issuer?: string;
        amount?: string;
      }
    | undefined
  > {
    const client = this.getSorobanReadClient();
    if (!client) {
      return undefined;
    }

    const record = await client.getPayment(invoiceId);
    const assetCode =
      record.asset.type === "native" ? "XLM" : record.asset.code;
    const assetIssuer =
      record.asset.type === "native" ? "" : record.asset.issuer;
    return {
      payer: record.payer,
      asset_code: assetCode,
      asset_issuer: assetIssuer,
      amount: record.amount.toString(),
    };
  }

  private getSorobanReadClient(): SorobanInvoiceClient | null {
    if (this.sorobanReadClient) {
      return this.sorobanReadClient;
    }
    const conf = this.config.get("stellar");
    const rpcUrl = this.getRpcUrl();
    const contractId = this.getContractId();
    const sourcePublicKey: string | undefined = conf?.merchantPublicKey;
    const networkPassphrase: string | undefined = conf?.networkPassphrase;
    if (!rpcUrl || !contractId || !sourcePublicKey || !networkPassphrase) {
      return null;
    }
    this.sorobanReadClient = new SorobanInvoiceClient({
      rpcUrl,
      contractId,
      networkPassphrase,
      sourcePublicKey,
    });
    return this.sorobanReadClient;
  }

  private async fetchEvents(): Promise<Json> {
    const rpc = this.getRpcUrl();
    const topic = this.getTopic();
    const contractId = this.getContractId();

    const params: Json = {
      startLedger: 1,
      filters: [
        {
          type: "contract",
          contractIds: [contractId],
          ...(topic ? { topics: [[topic]] } : {}),
        },
      ],
      pagination: {
        ...(this.cursor ? { cursor: this.cursor } : {}),
        limit: 100,
      },
    };

    const body: Json = {
      jsonrpc: "2.0",
      id: 1,
      method: "getEvents",
      params,
    };

    return traceAsync(
      this.logger,
      {
        operation: "soroban.rpc.getEvents",
        category: "network",
        slowThresholdMs: this.getSlowNetworkThresholdMs(),
        attributes: { contractId, cursor: this.cursor },
      },
      () => this.postJson(rpc, body),
    );
  }

  private postJson(rpcUrl: string, body: Json): Promise<Json> {
    const url = new URL(rpcUrl);
    const data = Buffer.from(JSON.stringify(body));
    const isHttps = url.protocol === "https:";
    const options: https.RequestOptions = {
      method: "POST",
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname || "/",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": data.length,
      },
    };

    return new Promise<Json>((resolve, reject) => {
      const req = https.request(options, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (d) => chunks.push(d));
        res.on("end", () => {
          const txt = Buffer.concat(chunks).toString("utf8");
          try {
            resolve(JSON.parse(txt));
          } catch (e) {
            reject(
              new Error(
                `Invalid JSON from Soroban RPC (status ${res.statusCode}): ${txt.slice(0, 200)}`,
              ),
            );
          }
        });
      });
      req.on("error", (e) => reject(e));
      req.write(data);
      req.end();
    });
  }

  private getRpcUrl(): string {
    const conf = this.config.get("stellar");
    return conf?.sorobanRpcUrl || "";
  }

  private getContractId(): string {
    const conf = this.config.get("stellar");
    return conf?.sorobanContractId || "";
  }

  private getTopic(): string {
    const conf = this.config.get("stellar");
    return conf?.sorobanEventTopic || "InvoicePaymentRecorded";
  }

  private getMaxProcessAttempts(): number {
    const raw = this.config.get<string>("SOROBAN_MAX_PROCESS_ATTEMPTS");
    const parsed = parseInt(raw ?? "", 10);
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : DEFAULT_MAX_PROCESS_ATTEMPTS;
  }

  private getRetryDelayMs(): number {
    const raw = this.config.get<string>("SOROBAN_RETRY_DELAY_MS");
    const parsed = parseInt(raw ?? "", 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 250;
  }

  private getSlowNetworkThresholdMs(): number {
    return (
      this.config.get<number>("observability.slowNetworkThresholdMs") ?? 500
    );
  }
}
export { EVENT_SCHEMA_VERSION };

