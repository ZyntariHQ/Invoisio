/**
 * DTO representing a Stellar account balance
 */
export class AccountBalanceDto {
  asset: string;
  balance: string;
}

/**
 * DTO representing Stellar account details
 */
export class AccountDetailsDto {
  id: string;
  publicKey: string;
  sequence: string;
  subentryCount: string;
  balances: AccountBalanceDto[];
  minimumBalance?: string;
}

/**
 * DTO representing a Stellar payment
 */
export class PaymentDto {
  id: string;
  sourceAccount: string;
  destinationAccount: string;
  amount: string;
  asset: string;
  memo?: string;
  transactionHash: string;
  createdAt: string;
}

/**
 * DTO for verifying a payment
 */
export class PaymentVerificationDto {
  found: boolean;
  amount?: string;
  asset?: string;
  transactionHash?: string;
  memo?: string;
}

/**
 * DTO representing a Stellar transaction
 */
export class TransactionDto {
  id: string;
  hash: string;
  ledger: string;
  createdAt: string;
  sourceAccount: string;
  feeCharged: string;
  operationCount: number;
  memo?: string;
}
