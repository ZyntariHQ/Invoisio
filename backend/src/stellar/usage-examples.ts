/**
 * USAGE EXAMPLES: Stellar Module Integration
 *
 * This file demonstrates how to use the StellarModule in other parts of the application
 */

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  StellarService,
  StellarValidator,
  StellarAccountNotFoundException,
  HorizonApiException,
} from "../stellar";

/**
 * Example 1: Payment Watcher Service
 * Monitors Stellar network for incoming payments
 */
@Injectable()
export class PaymentWatcherExample {
  private readonly logger = new Logger(PaymentWatcherExample.name);

  constructor(
    private readonly stellarService: StellarService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Start watching for payments to merchant account
   */
  async startWatching(): Promise<void> {
    const merchantKey = this.stellarService.getMerchantPublicKey();

    if (!merchantKey) {
      this.logger.warn("Merchant public key not configured");
      return;
    }

    await this.stellarService.watchPayments((payment) => {
      this.handlePayment(payment);
    });
  }

  /**
   * Handle incoming payment
   */
  private handlePayment(payment: any): void {
    this.logger.log(`Payment received: ${payment.amount}`);

    // Extract invoice ID from memo
    const invoiceId = this.stellarService.parseMemo(payment.memo);

    if (invoiceId) {
      this.logger.log(`Payment matched to invoice: ${invoiceId}`);
      // TODO: Update invoice status
    }
  }

  /**
   * Verify if specific payment was received
   */
  async verifyInvoicePayment(invoiceId: string): Promise<boolean> {
    const memo = this.stellarService.generateMemo(invoiceId);

    const result = await this.stellarService.verifyPayment(
      memo,
      this.stellarService.getMerchantPublicKey(),
    );

    return result.found;
  }
}

/**
 * Example 2: Balance Service
 * Provides balance checking functionality
 */
@Injectable()
export class BalanceServiceExample {
  constructor(private readonly stellarService: StellarService) {}

  /**
   * Get user's total balance in USD (simplified)
   */
  async getUserBalance(publicKey: string): Promise<{
    xlm: string | null;
    usdc: string | null;
    allBalances: any[];
  }> {
    try {
      // Validate address first
      this.stellarService.assertValidPublicKey(publicKey);

      // Get XLM balance
      const xlm = await this.stellarService.getXlmBalance(publicKey);

      // Get USDC balance
      const usdc = await this.stellarService.getUsdcBalance(publicKey);

      // Get all balances
      const allBalances =
        await this.stellarService.getAccountBalance(publicKey);

      return { xlm, usdc, allBalances };
    } catch (error) {
      if (error instanceof StellarAccountNotFoundException) {
        // Account doesn't exist yet
        return { xlm: "0", usdc: "0", allBalances: [] };
      }

      if (error instanceof HorizonApiException) {
        // Handle Horizon API errors
        throw error;
      }

      throw error;
    }
  }

  /**
   * Check if account has sufficient balance
   */
  async hasMinimumBalance(
    publicKey: string,
    minimum: number,
  ): Promise<boolean> {
    try {
      const accountDetails =
        await this.stellarService.getAccountDetails(publicKey);

      const xlmBalance = accountDetails.balances.find((b) => b.asset === "XLM");
      if (!xlmBalance) {
        return false;
      }

      return parseFloat(xlmBalance.balance) >= minimum;
    } catch (error) {
      this.logger.error("Error checking balance:", error);
      return false;
    }
  }

  private readonly logger = new Logger(BalanceServiceExample.name);
}

/**
 * Example 3: Invoice Service Integration
 * Shows how invoices module can use Stellar
 */
@Injectable()
export class InvoiceServiceExample {
  constructor(private readonly stellarService: StellarService) {}

  /**
   * Create payment instructions for an invoice
   */
  createPaymentInstructions(
    invoiceId: string,
    amount: number,
  ): {
    destination: string;
    amount: string;
    asset: string;
    memo: string;
  } {
    const merchantKey = this.stellarService.getMerchantPublicKey();
    const memo = this.stellarService.generateMemo(invoiceId);

    return {
      destination: merchantKey,
      amount: amount.toString(),
      asset: "USDC", // or XLM
      memo,
    };
  }

  /**
   * Check if invoice has been paid
   */
  async checkInvoicePaid(invoiceId: string): Promise<{
    paid: boolean;
    amount?: string;
    asset?: string;
  }> {
    const memo = this.stellarService.generateMemo(invoiceId);

    const verification = await this.stellarService.verifyPayment(
      memo,
      this.stellarService.getMerchantPublicKey(),
    );

    return {
      paid: verification.found,
      amount: verification.amount,
      asset: verification.asset,
    };
  }

  private readonly logger = new Logger(InvoiceServiceExample.name);
}

/**
 * Example 4: User Registration with Key Generation
 */
@Injectable()
export class UserRegistrationExample {
  constructor(private readonly stellarService: StellarService) {}

  /**
   * Generate new Stellar keypair for user
   */
  generateUserKeypair(): {
    publicKey: string;
    secretKey: string;
    isValid: boolean;
  } {
    const keypair = StellarValidator.generateKeypair();

    return {
      publicKey: keypair.publicKey,
      secretKey: keypair.secretKey,
      isValid: StellarValidator.isValidPublicKey(keypair.publicKey),
    };
  }

  /**
   * Validate user-provided public key
   */
  validateUserPublicKey(publicKey: string): boolean {
    return StellarValidator.isValidPublicKey(publicKey);
  }

  /**
   * Derive public key from secret (for recovery)
   */
  derivePublicKey(secretKey: string): string {
    return StellarValidator.getPublicKeyFromSecret(secretKey);
  }

  private readonly logger = new Logger(UserRegistrationExample.name);
}

/**
 * Example 5: Transaction Lookup Service
 */
@Injectable()
export class TransactionLookupExample {
  constructor(private readonly stellarService: StellarService) {}

  /**
   * Get transaction details by hash
   */
  async getTransaction(transactionHash: string): Promise<any> {
    try {
      return await this.stellarService.getTransactionByHash(transactionHash);
    } catch (error) {
      this.logger.error("Transaction not found:", transactionHash);
      throw error;
    }
  }

  /**
   * Get full account information
   */
  async getAccountInfo(publicKey: string): Promise<any> {
    try {
      return await this.stellarService.getAccountDetails(publicKey);
    } catch (error) {
      if (error instanceof StellarAccountNotFoundException) {
        this.logger.warn("Account not found:", publicKey);
        return null;
      }
      throw error;
    }
  }

  private readonly logger = new Logger(TransactionLookupExample.name);
}

/**
 * Example 6: Module Registration (app.module.ts)
 */
/*
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StellarModule } from './stellar';
import { APP_FILTER } from '@nestjs/core';
import { StellarExceptionFilter } from './stellar/exceptions/stellar.exceptions';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    StellarModule, // Import StellarModule
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: StellarExceptionFilter, // Global exception filter
    },
  ],
})
export class AppModule {}
*/

/**
 * Example 7: Controller Usage
 */
/*
import { Controller, Get, Param, UseFilters } from '@nestjs/common';
import { BalanceServiceExample } from './balance.service';
import { StellarExceptionFilter } from './stellar/exceptions/stellar.exceptions';

@Controller('balances')
@UseFilters(new StellarExceptionFilter()) // Apply filter to this controller
export class BalanceController {
  constructor(
    private readonly balanceService: BalanceServiceExample,
  ) {}

  @Get(':publicKey')
  async getBalance(@Param('publicKey') publicKey: string) {
    return this.balanceService.getUserBalance(publicKey);
  }
}
*/
