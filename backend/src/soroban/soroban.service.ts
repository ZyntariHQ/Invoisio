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
 */
@Injectable()
export class SorobanService implements OnModuleInit {
  private readonly logger = new Logger(SorobanService.name);
  private client!: SorobanInvoiceClient;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const cfg = this.configService.get("stellar") as {
      sorobanRpcUrl: string;
      networkPassphrase: string;
      contractId: string;
      adminSecretKey: string;
      merchantPublicKey: string;
    };

    this.client = new SorobanInvoiceClient({
      rpcUrl: cfg.sorobanRpcUrl,
      networkPassphrase: cfg.networkPassphrase,
      contractId: cfg.contractId,
      // signerSecretKey enables write operations; undefined when not configured.
      signerSecretKey: cfg.adminSecretKey || undefined,
      // merchantPublicKey serves as the source account for read-only simulation.
      sourcePublicKey: cfg.merchantPublicKey || undefined,
    });

    this.logger.log(
      `SorobanService ready — contract: ${cfg.contractId || "(not configured)"}`,
    );
  }

  /**
   * Record a verified invoice payment on-chain.
   *
   * Returns the confirmed transaction hash and ledger number.
   * @throws {SorobanContractError} if the contract rejects the call
   */
  async recordInvoicePayment(
    dto: RecordPaymentDto,
  ): Promise<{ hash: string; ledger: number }> {
    this.logger.log(`Recording on-chain payment for invoice: ${dto.invoiceId}`);

    const result = await this.client.recordPayment({
      invoiceId: dto.invoiceId,
      payer: dto.payer,
      assetCode: dto.assetCode,
      assetIssuer: dto.assetIssuer,
      amount: BigInt(dto.amount),
    });

    this.logger.log(
      `Payment recorded — invoice: ${dto.invoiceId}, hash: ${result.hash}, ledger: ${result.ledger}`,
    );

    return result;
  }

  /**
   * Fetch the full on-chain payment record for an invoice.
   * @throws {SorobanContractError} with code `PaymentNotFound` if not recorded
   */
  async getInvoicePayment(invoiceId: string): Promise<PaymentRecord> {
    return this.client.getPayment(invoiceId);
  }

  /**
   * Return `true` if a payment has been recorded on-chain for the invoice.
   *
   * Use this as an idempotency check before calling `recordInvoicePayment`
   * to make reconciliation safe to retry after partial failures.
   */
  async hasInvoicePayment(invoiceId: string): Promise<boolean> {
    return this.client.hasPayment(invoiceId);
  }

  /** Re-export the typed error class so callers can `catch (e instanceof SorobanContractError)`. */
  static readonly ContractError = SorobanContractError;
}
