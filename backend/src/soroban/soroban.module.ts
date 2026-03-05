import { Module } from '@nestjs/common';

import { SorobanService } from './soroban.service';

/**
 * Soroban contract integration module.
 *
 * Provides `SorobanService` for on-chain invoice payment recording and
 * querying. Import this module in any feature module that needs to interact
 * with the deployed `invoice-payment` Soroban contract.
 *
 * Configuration is read from `stellar.*` config namespace (stellar.config.ts):
 *   - stellar.sorobanRpcUrl
 *   - stellar.networkPassphrase
 *   - stellar.contractId
 *   - stellar.adminSecretKey
 *   - stellar.merchantPublicKey
 */
@Module({
  providers: [SorobanService],
  exports: [SorobanService],
})
export class SorobanModule {}
