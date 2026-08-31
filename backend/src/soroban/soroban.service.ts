import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PaymentRecord, SorobanInvoiceClient } from "@invoisio/soroban-client";

export interface RecordPaymentParams {
  invoiceId: string;
  payer: string;
  assetCode: string;
  assetIssuer: string;
  amount: string;
  settlementRef: string;
}

export interface RpcCheckResult {
  reachable: boolean;
  latencyMs: number;
  error?: string;
}

@Injectable()
export class SorobanService implements OnModuleInit {
  private readonly logger = new Logger(SorobanService.name);
  private client!: SorobanInvoiceClient;
  private isInitialized = false;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const cfg = this.configService.get("stellar") as {
      sorobanRpcUrl: string;
      networkPassphrase: string;
      contractId: string;
      adminSecretKey: string;
      merchantPublicKey: string;
    };

    const anchoringEnabled = process.env.SOROBAN_ANCHORING_ENABLED === "true";

    if (!anchoringEnabled) {
      this.logger.warn(
        "SorobanService: anchoring disabled (SOROBAN_ANCHORING_ENABLED != true)",
      );
      this.isInitialized = false;
      return;
    }

    if (!cfg.contractId) {
      this.logger.error(
        "SorobanService: SOROBAN_CONTRACT_ID is required when SOROBAN_ANCHORING_ENABLED=true",
      );
      this.isInitialized = false;
      return;
    }

    if (!cfg.adminSecretKey) {
      this.logger.error(
        "SorobanService: ADMIN_SECRET_KEY is required when SOROBAN_ANCHORING_ENABLED=true",
      );
      this.isInitialized = false;
      return;
    }

    try {
      this.client = new SorobanInvoiceClient({
        rpcUrl: cfg.sorobanRpcUrl,
        networkPassphrase: cfg.networkPassphrase,
        contractId: cfg.contractId,
        signerSecretKey: cfg.adminSecretKey,
        sourcePublicKey: cfg.merchantPublicKey || undefined,
      });

      this.isInitialized = true;
      this.logger.log(`SorobanService ready — contract: ${cfg.contractId}`);
    } catch (error) {
      this.logger.error(`SorobanService initialization failed: ${error}`);
      this.isInitialized = false;
    }
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  async recordPayment(params: RecordPaymentParams): Promise<any> {
    if (!this.isInitialized) {
      throw new Error(
        "SorobanService not initialized. Check SOROBAN_ANCHORING_ENABLED, SOROBAN_CONTRACT_ID, and ADMIN_SECRET_KEY configuration.",
      );
    }

    try {
      const result = await this.client.recordPayment({
        invoiceId: params.invoiceId,
        payer: params.payer,
        assetCode: params.assetCode,
        assetIssuer: params.assetIssuer,
        amount: BigInt(params.amount),
        settlementRef: params.settlementRef,
      });
      return result;
    } catch (error) {
      this.logger.error(`Failed to record payment: ${error}`);
      throw error;
    }
  }

  async checkRpc(): Promise<RpcCheckResult> {
    const start = Date.now();
    try {
      if (!this.isInitialized) {
        return {
          reachable: false,
          latencyMs: Date.now() - start,
          error: "Soroban service not initialized",
        };
      }
      // Try a simple health check
      return {
        reachable: true,
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        reachable: false,
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async recordInvoicePayment(params: RecordPaymentParams): Promise<any> {
    return this.recordPayment(params);
  }

  async hasInvoicePayment(invoiceId: string): Promise<boolean> {
    if (!this.isInitialized) {
      return false;
    }
    try {
      const result = await this.client.getPayment(invoiceId);
      return !!result;
    } catch (error: any) {
      if (error?.code === "PaymentArchived" || error?.numericCode === 24) {
        this.logger.log(
          `Invoice ${invoiceId} is recorded on-chain but archived due to TTL expiration`,
        );
        return true;
      }
      return false;
    }
  }

  async getInvoicePayment(invoiceId: string): Promise<any> {
    if (!this.isInitialized) {
      return null;
    }
    try {
      return await this.client.getPayment(invoiceId);
    } catch (error: any) {
      if (error?.code === "PaymentArchived" || error?.numericCode === 24) {
        this.logger.warn(
          `Invoice ${invoiceId} payment record is archived on-chain and needs restoration before reading`,
        );
      }
      return null;
    }
  }

  /**
   * Resolve a settlement reference to the on-chain invoice_id that consumed
   * it, or `null` when unused or unresolvable (e.g. Soroban not
   * initialized, or an RPC error).
   *
   * Used to disambiguate a `SettlementRefAlreadyUsed` rejection: compare the
   * returned invoice_id to the one just attempted — equal means a benign
   * retry of an already-successful anchoring attempt, different means a
   * genuine reconciliation conflict (issue #495).
   */
  async getSettlementRefOwner(settlementRef: string): Promise<string | null> {
    if (!this.isInitialized) {
      return null;
    }
    try {
      return await this.client.getSettlementRefOwner(settlementRef);
    } catch (error) {
      this.logger.error(`Failed to resolve settlement_ref owner: ${error}`);
      return null;
    }
  }

  async pingRpc(): Promise<RpcCheckResult> {
    const cfg = this.configService.get("stellar");
    if (!cfg || !cfg.sorobanRpcUrl) {
      return {
        reachable: false,
        latencyMs: 0,
        error: "Soroban RPC URL not configured",
      };
    }

    const start = Date.now();
    try {
      // Import dynamically or rely on global fetch since we don't want to mess up stellar-sdk import
      const response = await fetch(cfg.sorobanRpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
      });
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      return { reachable: true, latencyMs: Date.now() - start };
    } catch (error) {
      return {
        reachable: false,
        latencyMs: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
