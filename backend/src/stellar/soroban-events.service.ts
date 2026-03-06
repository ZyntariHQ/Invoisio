import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InvoicesService } from "../invoices/invoices.service";
import https from "node:https";
import { URL } from "node:url";

type Json = Record<string, any>;

@Injectable()
export class SorobanEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SorobanEventsService.name);
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private cursor: string | undefined = undefined;
  private backoffMs = 1000;

  constructor(
    private readonly config: ConfigService,
    private readonly invoices: InvoicesService,
  ) {}

  onModuleInit(): void {
    const rpcUrl = this.getRpcUrl();
    const contractId = this.getContractId();
    if (!rpcUrl || !contractId) {
      this.logger.warn(
        "Soroban events disabled (missing SOROBAN_RPC_URL or SOROBAN_CONTRACT_ID)",
      );
      return;
    }
    this.running = true;
    this.logger.log(
      `Soroban event subscriber started (rpc: ${rpcUrl}, contract: ${contractId})`,
    );
    this.scheduleNext(0);
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
    try {
      const resp = await this.fetchEvents();
      const events: any[] = resp?.result?.events ?? [];
      for (const ev of events) {
        await this.handleEvent(ev);
        this.cursor = ev?.pagingToken ?? ev?.paging_token ?? this.cursor;
      }
      this.backoffMs = 1000;
      this.scheduleNext(events.length > 0 ? 50 : 500);
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.warn(`Soroban getEvents error: ${msg}`);
      this.backoffMs = Math.min(this.backoffMs * 2, 30000);
      this.scheduleNext(this.backoffMs);
    }
  }

  async handleEvent(ev: any): Promise<void> {
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
      return;
    }

    await this.invoices.applySorobanPaymentEvent({
      eventId: String(ev?.id ?? ev?.eventId ?? ev?.pagingToken ?? Date.now()),
      contractId: this.getContractId(),
      ledger:
        Number(ev?.ledger ?? ev?.inLedger ?? ev?.ledgers ?? 0) || undefined,
      invoice_id: String(payload.invoice_id),
      payer: payload.payer ? String(payload.payer) : undefined,
      asset_code: payload.asset_code ? String(payload.asset_code) : undefined,
      asset_issuer: payload.asset_issuer
        ? String(payload.asset_issuer)
        : undefined,
      amount:
        payload.amount !== undefined
          ? (payload.amount as any).toString()
          : undefined,
    });
  }

  private coercePaymentRecorded(obj: any): {
    invoice_id?: string;
    payer?: string;
    asset_code?: string;
    asset_issuer?: string;
    amount?: string | number;
  } | null {
    if (!obj || typeof obj !== "object") return null;
    if ("invoice_id" in obj) return obj;
    if (Array.isArray(obj?.map)) {
      const out: Record<string, any> = {};
      for (const entry of obj.map) {
        const key =
          entry?.key?.symbol ?? entry?.key?.string ?? entry?.key ?? undefined;
        const val =
          entry?.val?.string ??
          entry?.val?.address ??
          entry?.val?.i128 ??
          entry?.val?.u64 ??
          entry?.val ??
          undefined;
        if (key !== undefined) {
          out[String(key)] = val;
        }
      }
      return out as any;
    }
    return null;
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

    return await this.postJson(rpc, body);
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
}
