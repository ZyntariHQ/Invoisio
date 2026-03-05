import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as StellarSdk from "@stellar/stellar-sdk";
import {
  StellarException,
  StellarAccountNotFoundException,
  StellarPaymentNotFoundException,
  HorizonApiException,
  StellarNetworkConfigException,
  StellarAddressInvalidException,
} from "./exceptions/stellar.exceptions";
import {
  AccountDetailsDto,
  AccountBalanceDto,
  PaymentVerificationDto,
  TransactionDto,
} from "./dto/stellar.dto";
import { StellarValidator } from "./utils/stellar.validator";

/**
 * Stellar service for Horizon API interactions
 *
 * Provides comprehensive Stellar blockchain integration including:
 * - Account management and balance queries
 * - Payment verification and monitoring
 * - Address and contract validation
 * - Error handling with custom exceptions
 */
@Injectable()
export class StellarService {
  private readonly logger = new Logger(StellarService.name);
  private server: StellarSdk.Horizon.Server | null = null;

  constructor(private readonly configService: ConfigService) {
    this.initializeServer();
  }

  /**
   * Initialize Stellar SDK Server with configured Horizon URL
   */
  private initializeServer() {
    try {
      const horizonUrl = this.getHorizonUrl();
      this.server = new StellarSdk.Horizon.Server(horizonUrl, {
        allowHttp: false,
      });
      this.logger.log(
        `Stellar server initialized with Horizon URL: ${horizonUrl}`,
      );
    } catch (error) {
      this.logger.error("Failed to initialize Stellar server", error);
      throw new StellarNetworkConfigException(
        `Failed to initialize Stellar server: ${error.message}`,
      );
    }
  }

  getConfig() {
    return this.configService.get("stellar");
  }

  getHorizonUrl(): string {
    const config = this.getConfig();
    return config?.horizonUrl || "https://horizon-testnet.stellar.org";
  }

  getMerchantPublicKey(): string {
    const config = this.getConfig();
    return config?.merchantPublicKey || "";
  }

  getNetworkPassphrase(): string {
    const config = this.getConfig();
    return config?.networkPassphrase || "Test SDF Network ; September 2015";
  }

  isTestnet(): boolean {
    return this.getNetworkPassphrase().includes("Test");
  }

  getServer(): StellarSdk.Horizon.Server {
    if (!this.server) {
      throw new StellarNetworkConfigException(
        "Stellar server not initialized. Check your Horizon URL configuration.",
      );
    }
    return this.server;
  }

  isValidPublicKey(publicKey: string): boolean {
    return StellarValidator.isValidPublicKey(publicKey);
  }

  isValidContractAddress(contractAddress: string): boolean {
    return StellarValidator.isValidContractAddress(contractAddress);
  }

  assertValidPublicKey(publicKey: string): void {
    if (!StellarValidator.isValidPublicKey(publicKey)) {
      throw new StellarAddressInvalidException(publicKey, "account");
    }
  }

  assertValidContractAddress(contractAddress: string): void {
    if (!StellarValidator.isValidContractAddress(contractAddress)) {
      throw new StellarAddressInvalidException(contractAddress, "contract");
    }
  }

  async getAccountDetails(publicKey: string): Promise<AccountDetailsDto> {
    this.assertValidPublicKey(publicKey);

    try {
      const server = this.getServer();
      const accountResponse = await server.loadAccount(publicKey);

      const balances: AccountBalanceDto[] = accountResponse.balances.map(
        (balance: any) => ({
          asset: this.formatAsset(balance.asset_code, balance.asset_issuer),
          balance: balance.balance,
        }),
      );

      // Calculate minimum balance based on subentries
      const baseReserve = 0.5; // 0.5 XLM per base reserve
      const subentryCount = parseInt(
        String(accountResponse.subentry_count),
        10,
      );
      const minimumBalance = (baseReserve * (2 + subentryCount)).toString();

      return {
        id: accountResponse.id,
        publicKey:
          (accountResponse as any).public_key ||
          (accountResponse as any).account_id,
        sequence: accountResponse.sequence,
        subentryCount: String(accountResponse.subentry_count),
        balances,
        minimumBalance,
      };
    } catch (error) {
      if (error.isAxiosError && error.response?.status === 404) {
        throw new StellarAccountNotFoundException(publicKey);
      }

      if (error.isAxiosError) {
        throw new HorizonApiException(
          `Horizon API error fetching account: ${error.message}`,
          error.response?.status || 500,
          error,
        );
      }

      throw new StellarException(
        `Failed to fetch account details: ${error.message}`,
        "STELLAR_ACCOUNT_FETCH_ERROR",
      );
    }
  }

  async getAccountBalance(publicKey: string): Promise<AccountBalanceDto[]> {
    const accountDetails = await this.getAccountDetails(publicKey);
    return accountDetails.balances;
  }

  async verifyPayment(
    memo: string,
    destinationAccount?: string,
  ): Promise<PaymentVerificationDto> {
    try {
      const server = this.getServer();

      // Build query to search for payments with this memo
      // @ts-expect-error - memo filter not in types but available in API
      const callBuilder = server.payments().memo(memo).order("desc").limit(1);

      // Filter by destination if provided
      if (destinationAccount) {
        callBuilder.destination(destinationAccount);
      }

      const payments = await callBuilder.call();

      if (payments.records.length === 0) {
        return { found: false };
      }

      const payment = payments.records[0];

      return {
        found: true,
        amount: payment.amount,
        asset: this.formatAsset(payment.asset_code, payment.asset_issuer),
        transactionHash: payment.transaction_hash,
        memo,
      };
    } catch (error) {
      if (error.isAxiosError) {
        throw new HorizonApiException(
          `Horizon API error verifying payment: ${error.message}`,
          error.response?.status || 500,
          error,
        );
      }

      throw new StellarException(
        `Failed to verify payment: ${error.message}`,
        "STELLAR_PAYMENT_VERIFICATION_ERROR",
      );
    }
  }

  async watchPayments(
    callback: (payment: any) => void,
    memo?: string,
  ): Promise<void> {
    const merchantPublicKey = this.getMerchantPublicKey();

    if (!merchantPublicKey) {
      this.logger.warn(
        "Cannot start payment watch: MERCHANT_PUBLIC_KEY not configured",
      );
      return;
    }

    try {
      const server = this.getServer();
      let callBuilder = server
        .payments()
        .forAccount(merchantPublicKey)
        .cursor("now");

      if (memo) {
        // @ts-expect-error - memo filter not in types but available in API
        callBuilder = callBuilder.memo(memo);
      }

      callBuilder.stream({
        onmessage: (paymentRecord: any) => {
          this.logger.log(
            `Payment received: ${paymentRecord.amount} ${paymentRecord.asset_code || "XLM"}`,
          );
          callback(paymentRecord);
        },
        onerror: (error: any) => {
          this.logger.error("Payment stream error:", error);

          if (error.isAxiosError) {
            throw new HorizonApiException(
              `Payment stream error: ${error.message}`,
              error.status,
              error,
            );
          }
        },
      });

      this.logger.log("Payment watch started");
    } catch (error) {
      this.logger.error("Failed to start payment watch:", error);
      throw error;
    }
  }

  async getTransactionByHash(transactionHash: string): Promise<TransactionDto> {
    try {
      const server = this.getServer();
      const transaction = await server
        .transactions()
        .transaction(transactionHash)
        .call();

      return {
        id: transaction.id,
        hash: transaction.hash,
        ledger: String((transaction as any).ledger_attr),
        createdAt: transaction.created_at,
        sourceAccount: transaction.source_account,
        feeCharged: String(transaction.fee_charged),
        operationCount: Number(transaction.operation_count),
        memo: transaction.memo || undefined,
      };
    } catch (error) {
      if (error.isAxiosError && error.response?.status === 404) {
        throw new StellarPaymentNotFoundException(undefined, transactionHash);
      }

      if (error.isAxiosError) {
        throw new HorizonApiException(
          `Horizon API error fetching transaction: ${error.message}`,
          error.response?.status || 500,
          error,
        );
      }

      throw new StellarException(
        `Failed to fetch transaction: ${error.message}`,
        "STELLAR_TRANSACTION_FETCH_ERROR",
      );
    }
  }

  generateMemo(invoiceId: string): string {
    const config = this.getConfig();
    const prefix = config?.memoPrefix || "invoisio-";
    return `${prefix}${invoiceId}`;
  }

  parseMemo(memo: string): string | null {
    const config = this.getConfig();
    const prefix = config?.memoPrefix || "invoisio-";

    if (memo.startsWith(prefix)) {
      return memo.slice(prefix.length);
    }
    return null;
  }

  private formatAsset(assetCode?: string, issuer?: string): string {
    if (!assetCode) {
      return "XLM";
    }
    if (issuer) {
      return `${assetCode}:${issuer}`;
    }
    return assetCode;
  }

  async getXlmBalance(publicKey: string): Promise<string | null> {
    const balances = await this.getAccountBalance(publicKey);
    const xlmBalance = balances.find((b) => b.asset === "XLM");
    return xlmBalance?.balance || null;
  }

  async getUsdcBalance(publicKey: string): Promise<string | null> {
    const balances = await this.getAccountBalance(publicKey);
    const usdcIssuer = this.getConfig()?.usdcIssuer;
    const usdcAssetCode = this.getConfig()?.usdcAssetCode || "USDC";

    const usdcBalance = balances.find(
      (b) => b.asset === `${usdcAssetCode}:${usdcIssuer}`,
    );
    return usdcBalance?.balance || null;
  }
}
