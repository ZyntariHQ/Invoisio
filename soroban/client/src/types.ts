import {
  Asset,
  AssetNative,
  AssetToken,
  CONTRACT_ERROR_CODES,
  ContractErrorCode,
  ContractMeta,
  CONTRACT_METHODS,
  CONTRACT_METHOD_SIGNATURES,
  ContractMethodName,
  ContractMethodParameter,
  ContractMethodSignature,
  PaymentRecord,
} from './generated/invoice-payment-bindings';

export type {
  Asset,
  AssetNative,
  AssetToken,
  ContractErrorCode,
  ContractMeta,
  ContractMethodName,
  ContractMethodParameter,
  ContractMethodSignature,
  PaymentRecord,
};

export { CONTRACT_ERROR_CODES, CONTRACT_METHODS, CONTRACT_METHOD_SIGNATURES };

export class SorobanContractError extends Error {
  override readonly name = 'SorobanContractError';

  constructor(
    public readonly code: ContractErrorCode,
    public readonly numericCode: number,
    message: string,
  ) {
    super(message);
  }
}

// Client configuration

export interface SorobanInvoiceClientConfig {
  /** Soroban RPC URL, e.g. https://soroban-testnet.stellar.org */
  readonly rpcUrl: string;
  /** Stellar network passphrase */
  readonly networkPassphrase: string;
  /** Deployed contract ID (C...) */
  readonly contractId: string;
  /**
   * Stellar public key (G...) used as the transaction source for read-only
   * simulation calls. Falls back to the key derived from `signerSecretKey`
   * when omitted.
   */
  readonly sourcePublicKey?: string;
  /**
   * Admin secret key (S...). Required for write operations: record_payment.
   * Must be read from environment - never hard-code.
   */
  readonly signerSecretKey?: string;
}

// Operation parameters

export interface RecordPaymentParams {
  /** Unique invoice identifier, e.g. "invoisio-abc123" */
  readonly invoiceId: string;
  /** Stellar G... address of the payer */
  readonly payer: string;
  /** "XLM" or a token code such as "USDC" */
  readonly assetCode: string;
  /** Issuer G... address for token assets; empty string ("") for XLM */
  readonly assetIssuer: string;
  /** Amount in smallest denomination (must be > 0) */
  readonly amount: bigint;
}

/** Confirmed on-chain transaction result. */
export interface TransactionResult {
  readonly hash: string;
  readonly ledger: number;
}
