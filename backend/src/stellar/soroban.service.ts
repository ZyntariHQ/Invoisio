import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

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
  private readonly network: string;
  private readonly identity: string;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;

  constructor(private readonly configService: ConfigService) {
    this.contractId =
      this.configService.get<string>("SOROBAN_CONTRACT_ID") || "";
    this.network =
      this.configService.get<string>("STELLAR_NETWORK") || "testnet";
    this.identity =
      this.configService.get<string>("SOROBAN_IDENTITY") || "invoisio-admin";
    this.maxRetries = parseInt(
      this.configService.get<string>("SOROBAN_MAX_RETRIES") || "3",
      10,
    );
    this.baseDelayMs = parseInt(
      this.configService.get<string>("SOROBAN_RETRY_DELAY_MS") || "1000",
      10,
    );

    if (!this.contractId) {
      this.logger.warn(
        "SOROBAN_CONTRACT_ID not set; Soroban anchoring disabled",
      );
    }
  }

  async recordPayment(
    params: RecordPaymentParams,
  ): Promise<SorobanMetadata | null> {
    if (!this.contractId) {
      this.logger.debug("Soroban contract not configured, skipping anchor");
      return null;
    }

    return this.withRetry(() => this.invokeRecordPayment(params));
  }

  private async invokeRecordPayment(
    params: RecordPaymentParams,
  ): Promise<SorobanMetadata> {
    const { invoiceId, payer, assetCode, assetIssuer, amount } = params;

    const cmd = [
      "stellar",
      "contract",
      "invoke",
      `--id ${this.contractId}`,
      `--network ${this.network}`,
      `--source ${this.identity}`,
      "--",
      "record_payment",
      `--invoice_id ${invoiceId}`,
      `--payer ${payer}`,
      `--asset_code ${assetCode}`,
      `--asset_issuer "${assetIssuer}"`,
      `--amount ${amount}`,
    ].join(" ");

    this.logger.debug(`Invoking Soroban: ${cmd}`);

    const { stdout, stderr } = await execAsync(cmd);

    if (stderr && !stderr.includes("warning")) {
      throw new Error(`Soroban invocation failed: ${stderr}`);
    }

    const txHash = this.extractTxHash(stdout);

    return {
      txHash,
      contractId: this.contractId,
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

  private extractTxHash(output: string): string {
    const match = output.match(/[A-Fa-f0-9]{64}/);
    return match ? match[0] : "unknown";
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
