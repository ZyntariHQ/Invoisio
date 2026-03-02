import { Module } from "@nestjs/common";
import { StellarService } from "./stellar.service";

/**
 * Stellar module for Horizon and Soroban interactions
 *
 * Provides:
 * - StellarService for Horizon API access
 * - Future: Soroban contract interactions
 * - Future: Payment streaming and reconciliation
 */
@Module({
  providers: [StellarService],
  exports: [StellarService],
})
export class StellarModule {}
