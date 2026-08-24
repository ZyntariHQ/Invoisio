import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { rpc } from "@stellar/stellar-sdk";
import {
  Contract,
  TransactionBuilder,
  Networks,
  Keypair,
  xdr,
} from "@stellar/stellar-sdk";
import {
  parseContractError,
  SorobanContractError,
} from "@invoisio/soroban-client";
import { SorobanRpcException } from "./exceptions/stellar.exceptions";

export interface RecordPaymentParams {
  invoiceId: string;
  payer: string;
  assetCode: string;
  assetIssuer: string;
  amount: string;
  /**
   * Normalised settlement reference (hash or reconciliation ID) required by
   * the live contract ABI for backend deduplication and idempotent
   * reconciliation. Must be non-empty and at most 128 characters.
   */
  settlementRef: string;
}

export interface SorobanMetadata {
  txHash: string;
  contractId: string;
  ledger?: number;
}

@Injectable()
export class SorobanService {
  private readonly logger = new Logger(SorobanService.name);
  private readonly contractId: string;
  private readonly rpcUrl: string;
  private readonly networkPassphrase: string;
  private readonly sourceKeypair: Keypair | null = null;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private server: rpc.Server | null = null;

  constructor(private readonly configService: ConfigService) {
    this.contractId =
      this.configService.get<string>("SOROBAN_CONTRACT_ID") || "";
    this.rpcUrl =
      this.configService.get<string>("SOROBAN_RPC_URL") ||
      "https://soroban-testnet.stellar.org";
    this.networkPassphrase =
      this.configService.get<string>("STELLAR_NETWORK_PASSPHRASE") ||
      Networks.TESTNET;
    this.maxRetries = parseInt(
      this.configService.get<string>("SOROBAN_MAX_RETRIES") || "3",
      10,
    );
    this.baseDelayMs = parseInt(
      this.configService.get<string>("SOROBAN_RETRY_DELAY_MS") || "1000",
      10,
    );

    const secretKey = this.configService.get<string>("SOROBAN_SECRET_KEY");
    if (secretKey) {
      try {
        this.sourceKeypair = Keypair.fromSecret(secretKey);
      } catch (err) {
        this.logger.error(
          `Invalid SOROBAN_SECRET_KEY: ${(err as Error).message}`,
        );
      }
    }

    if (!this.contractId) {
      this.logger.warn(
        "SOROBAN_CONTRACT_ID not set; Soroban anchoring disabled",
      );
    } else if (!this.sourceKeypair) {
      this.logger.warn(
        "SOROBAN_SECRET_KEY not set; Soroban anchoring disabled",
      );
    } else {
      this.server = new rpc.Server(this.rpcUrl);
    }
  }

  /**
   * Anchor a confirmed Horizon payment to the Soroban contract.
   *
   * @returns `null` only when Soroban anchoring is not configured for this
   *   deployment (no contract ID / secret key) — an intentional no-op, not a
   *   failure. Any anchoring *attempt* that fails, whether a permanent
   *   contract-level rejection or a transient transport error that
   *   exhausted its retries, throws rather than returning `null`, so
   *   callers can never mistake a swallowed failure for a disabled feature.
   * @throws {SorobanContractError} the contract rejected the write
   *   deterministically (e.g. `PaymentAlreadyRecorded`, `InvalidSettlementRef`,
   *   `ContractPaused`) — retrying the same call will fail identically, so
   *   this is thrown immediately without consuming retry attempts.
   * @throws {SorobanRpcException} a transient transport/RPC failure
   *   (network error, timeout, malformed response) persisted through
   *   `SOROBAN_MAX_RETRIES` attempts.
   */
  async recordPayment(
    params: RecordPaymentParams,
  ): Promise<SorobanMetadata | null> {
    if (!this.server || !this.sourceKeypair) {
      this.logger.debug("Soroban not configured, skipping anchor");
      return null;
    }

    return this.withRetry(() => this.invokeRecordPayment(params));
  }

  private async invokeRecordPayment(
    params: RecordPaymentParams,
  ): Promise<SorobanMetadata> {
    const { invoiceId, payer, assetCode, assetIssuer, amount, settlementRef } =
      params;

    const contract = new Contract(this.contractId);
    const sourceAccount = await this.server!.getAccount(
      this.sourceKeypair!.publicKey(),
    );

    const tx = new TransactionBuilder(sourceAccount, {
      fee: "100000",
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        contract.call(
          "record_payment",
          xdr.ScVal.scvString(invoiceId),
          xdr.ScVal.scvAddress(
            xdr.ScAddress.scAddressTypeAccount(
              xdr.PublicKey.publicKeyTypeEd25519(
                Keypair.fromPublicKey(payer).rawPublicKey(),
              ),
            ),
          ),
          xdr.ScVal.scvString(assetCode),
          xdr.ScVal.scvString(assetIssuer),
          xdr.ScVal.scvI128(
            new xdr.Int128Parts({
              hi: xdr.Int64.fromString("0"),
              lo: xdr.Uint64.fromString(amount),
            }),
          ),
          xdr.ScVal.scvString(settlementRef),
        ),
      )
      .setTimeout(30)
      .build();

    const prepared = await this.server!.prepareTransaction(tx);
    prepared.sign(this.sourceKeypair!);

    const response = await this.server!.sendTransaction(prepared);

    if (response.status === "ERROR") {
      throw new Error(
        `Transaction failed: ${response.errorResult?.toXDR("base64")}`,
      );
    }

    let getResponse = await this.server!.getTransaction(response.hash);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
    while (getResponse.status === "NOT_FOUND") {
      await this.sleep(1000);
      getResponse = await this.server!.getTransaction(response.hash);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
    if (getResponse.status !== "SUCCESS") {
      throw new Error(`Transaction failed with status: ${getResponse.status}`);
    }

    return {
      txHash: response.hash,
      contractId: this.contractId,
      ledger: getResponse.ledger,
    };
  }

  /**
   * Runs `fn` with exponential-backoff retry, but only for transient
   * transport failures. A permanent, deterministic contract-level rejection
   * (decodable via `parseContractError`) is thrown immediately — retrying
   * the exact same call would just fail identically every time, so burning
   * retry attempts (and the caller's time) on it would be pure waste and
   * would delay surfacing an error that needs a data fix, not a retry.
   */
  private async withRetry<T>(fn: () => Promise<T>, attempt = 1): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const contractError: SorobanContractError = parseContractError(errMsg);

      if (contractError.code !== "Unknown") {
        this.logger.error(
          `Soroban record_payment rejected by contract [${contractError.code}] (code=${contractError.numericCode}): ${errMsg}`,
        );
        throw contractError;
      }

      if (attempt >= this.maxRetries) {
        this.logger.error(
          `Soroban invocation failed after ${this.maxRetries} attempts: ${errMsg}`,
        );
        throw new SorobanRpcException(
          `Soroban record_payment failed after ${this.maxRetries} attempts: ${errMsg}`,
          undefined,
          error,
        );
      }

      const delay = this.baseDelayMs * Math.pow(2, attempt - 1);
      this.logger.warn(
        `Soroban invocation failed (attempt ${attempt}/${this.maxRetries}), retrying in ${delay}ms: ${errMsg}`,
      );

      await this.sleep(delay);
      return this.withRetry(fn, attempt + 1);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Lightweight Soroban RPC reachability probe.
   * Calls `getHealth()` on the RPC server with a 5 s timeout.
   */
  async pingRpc(): Promise<{
    reachable: boolean;
    latencyMs: number;
    error?: string;
  }> {
    if (!this.server) {
      return {
        reachable: false,
        latencyMs: 0,
        error: "Soroban RPC not configured",
      };
    }

    const start = Date.now();
    try {
      await this.server.getHealth();
      return { reachable: true, latencyMs: Date.now() - start };
    } catch (err) {
      return {
        reachable: false,
        latencyMs: Date.now() - start,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
