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

export interface RecordPaymentParams {
  invoiceId: string;
  payer: string;
  assetCode: string;
  assetIssuer: string;
  amount: string;
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
    const { invoiceId, payer, assetCode, assetIssuer, amount } = params;

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

  private async withRetry<T>(
    fn: () => Promise<T>,
    attempt = 1,
  ): Promise<T | null> {
    try {
      return await fn();
    } catch (error) {
      const errMsg = (error as Error).message;

      if (attempt >= this.maxRetries) {
        this.logger.error(
          `Soroban invocation failed after ${this.maxRetries} attempts: ${errMsg}`,
        );
        return null;
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
}
