/**
 * Stellar Module - Public API
 *
 * This module provides comprehensive Stellar blockchain integration
 */

// Service
export { StellarService } from "./stellar.service";
export { SorobanService } from "./soroban.service";
export { HorizonWatcherService } from "./horizon-watcher.service";

// Module
export { StellarModule } from "./stellar.module";

// DTOs
export {
  AccountBalanceDto,
  AccountDetailsDto,
  PaymentDto,
  PaymentVerificationDto,
  TransactionDto,
} from "./dto/stellar.dto";

// Exceptions
export {
  StellarException,
  StellarAccountNotFoundException,
  StellarPaymentNotFoundException,
  StellarAddressInvalidException,
  HorizonApiException,
  SorobanRpcException,
  StellarNetworkConfigException,
  StellarExceptionFilter,
} from "./exceptions/stellar.exceptions";

// Utilities
export { StellarValidator } from "./utils/stellar.validator";
