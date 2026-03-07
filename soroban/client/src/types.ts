// ─── Asset ───────────────────────────────────────────────────────────────────

export type AssetNative = { readonly type: 'native' };

export type AssetToken = {
  readonly type: 'token';
  /** Token code, e.g. "USDC" */
  readonly code: string;
  /** Issuer Stellar address (G...) */
  readonly issuer: string;
};

export type Asset = AssetNative | AssetToken;

// ─── Contract return types ────────────────────────────────────────────────────

/** On-chain record stored for each invoice payment. */
export interface PaymentRecord {
  readonly invoiceId: string;
  /** Stellar account (G...) that made the payment */
  readonly payer: string;
  readonly asset: Asset;
  /**
   * Amount in smallest denomination.
   * - XLM: stroops — 1 XLM = 10_000_000 stroops
   * - Token: 7-decimal units — 1 USDC = 10_000_000 units
   */
  readonly amount: bigint;
  /** Unix seconds at which the ledger included this record */
  readonly timestamp: bigint;
}

// ─── Error handling ───────────────────────────────────────────────────────────

/** Numeric codes matching the Rust `ContractError` enum. */
export const CONTRACT_ERROR_CODES = {
  1: 'AlreadyInitialized',
  2: 'NotInitialized',
  3: 'PaymentAlreadyRecorded',
  4: 'PaymentNotFound',
  5: 'InvalidAmount',
  6: 'InvalidInvoiceId',
  7: 'InvalidAsset',
} as const;

export type ContractErrorCode =
  | (typeof CONTRACT_ERROR_CODES)[keyof typeof CONTRACT_ERROR_CODES]
  | 'Unknown';

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

// ─── Client configuration ─────────────────────────────────────────────────────

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
   * Must be read from environment — never hard-code.
   */
  readonly signerSecretKey?: string;
}

// ─── Operation parameters ─────────────────────────────────────────────────────

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
