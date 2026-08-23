import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  PaymentRecord,
  SorobanContractError,
  SorobanInvoiceClient,
} from "@invoisio/soroban-client";

import { RecordPaymentDto } from "./dto/soroban-payment.dto";

/**
 * NestJS service wrapping the `@invoisio/soroban-client` library.
 *
 * A single `SorobanInvoiceClient` instance is created in `onModuleInit()` and
 * reused for the lifetime of the process — the underlying RPC server connection
 * and admin keypair are both initialised once rather than per-call.
 *
 * All Soroban logic (XDR codec, polling, error parsing) lives in the client
 * library. This service is a thin adapter that maps NestJS config and DTOs
 * to the library's typed API.
 *
 * Defensive boot: if the required Stellar configuration is missing
 * (no admin secret key AND no merchant public key, OR no contract ID), the
 * service stays dormant and `onModuleInit` does NOT throw. Methods become
 * no-ops that return `null` / `false` and log a warning. This mirrors the
 * behaviour of the older sibling at `src/stellar/soroban.service.ts` and
 * keeps the dev server bootable without a deployed Soroban contract.
 *
 * The original behaviour of the `@invoisio/soroban-client` constructor —
 * which throws when keys are missing — is preserved at the library level
 * (we don't monkey-patch it). We just guard the construction site and the
 * call sites here.
 */
@Injectable()
export class SorobanService implements OnModuleInit {
  private readonly logger = new Logger(SorobanService.name);
  private client: SorobanInvoiceClient | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const cfg = this.configService.get("stellar") as {
      sorobanRpcUrl: string;
      networkPassphrase: string;
      contractId: string;
      adminSecretKey: string;
      merchantPublicKey: string;
    };

    if (!cfg.adminSecretKey && !cfg.merchantPublicKey) {
      this.logger.warn(
        "SorobanService disabled — neither ADMIN_SECRET_KEY nor MERCHANT_PUBLIC_KEY is configured. " +
          "On-chain anchoring endpoints will return null until keys are provided.",
      );
      return;
    }

    if (!cfg.contractId) {
      this.logger.warn(
        "SorobanService disabled — SOROBAN_CONTRACT_ID is not configured. " +
          "On-chain anchoring endpoints will return null until a contract ID is provided.",
      );
      return;
    }

    try {
      this.client = new SorobanInvoiceClient({
        rpcUrl: cfg.sorobanRpcUrl,
        networkPassphrase: cfg.networkPassphrase,
        contractId: cfg.contractId,
        // signerSecretKey enables write operations; undefined when not configured.
        signerSecretKey: cfg.adminSecretKey || undefined,
        // merchantPublicKey serves as the source account for read-only simulation.
        sourcePublicKey: cfg.merchantPublicKey || undefined,
      });
      this.logger.log(`SorobanService ready — contract: ${cfg.contractId}`);
    } catch (err) {
      this.logger.error(
        `SorobanService initialization failed: ${(err as Error).message}. ` +
          `On-chain anchoring endpoints will return null.`,
      );
      this.client = null;
    }
  }

  /**
   * Record a verified invoice payment on-chain.
   *
   * @returns the confirmed transaction hash and ledger number, or `null`
   *   when Soroban anchoring is not configured (dormant mode). The null
   *   return is an intentional no-op, not a failure — callers can
   *   distinguish "disabled" from "attempted and rejected" by checking for
   *   the returned `SorobanContractError` thrown on the rejection path.
   * @throws {SorobanContractError} if the contract rejects the call
   */
  async recordInvoicePayment(
    dto: RecordPaymentDto,
  ): Promise<{ hash: string; ledger: number } | null> {
    if (!this.client) {
      this.logger.debug(
        "Soroban not configured — skipping recordInvoicePayment",
      );
      return null;
    }

    this.logger.log(`Recording on-chain payment for invoice: ${dto.invoiceId}`);

    const result = await this.client.recordPayment({
      invoiceId: dto.invoiceId,
      payer: dto.payer,
      assetCode: dto.assetCode,
      assetIssuer: dto.assetIssuer,
      amount: BigInt(dto.amount),
      settlementRef: dto.settlementRef,
    });

    this.logger.log(
      `Payment recorded — invoice: ${dto.invoiceId}, hash: ${result.hash}, ledger: ${result.ledger}`,
    );

    return result;
  }

  /**
   * Fetch the full on-chain payment record for an invoice.
   *
   * @returns the payment record, or `null` when Soroban anchoring is not
   *   configured (dormant mode).
   * @throws {SorobanContractError} with code `PaymentNotFound` if not recorded
   */
  async getInvoicePayment(invoiceId: string): Promise<PaymentRecord | null> {
    if (!this.client) {
      this.logger.debug(
        "Soroban not configured — skipping getInvoicePayment",
      );
      return null;
    }
    return this.client.getPayment(invoiceId);
  }

  /**
   * Return `true` if a payment has been recorded on-chain for the invoice.
   *
   * Use this as an idempotency check before calling `recordInvoicePayment`
   * to make reconciliation safe to retry after partial failures. Returns
   * `false` when Soroban anchoring is not configured (dormant mode) — so
   * a caller that needs to record on-chain will attempt the write, get
   * `null` back, and skip silently.
   */
  async hasInvoicePayment(invoiceId: string): Promise<boolean> {
    if (!this.client) {
      return false;
    }
    return this.client.hasPayment(invoiceId);
  }

  /** Re-export the typed error class so callers can `catch (e instanceof SorobanContractError)`. */
  static readonly ContractError = SorobanContractError;
}
