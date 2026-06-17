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

/**
 * Stable summary of the contract's asset-acceptance policy.
 *
 * `requiresTokenAllowlist` is currently always `true`: issued Stellar assets
 * must be explicitly allowlisted on-chain before `record_payment` accepts them.
 */
export interface AllowlistMode {
  /** Whether native XLM payments are currently accepted. */
  readonly nativeAllowed: boolean;
  /** Whether non-native assets must be explicitly allowlisted. */
  readonly requiresTokenAllowlist: boolean;
}

/** On-chain version metadata attached to contract state. */
export interface ContractVersionInfo {
  /** Packed semver: MAJOR * 1_000_000 + MINOR * 1_000 + PATCH */
  readonly contractVersion: number;
  /** Storage schema version for the persisted state layout. */
  readonly storageSchemaVersion: number;
}

/**
 * Stable high-level configuration snapshot returned by the contract `config()`
 * view. This is the preferred single-call read for clients and ops tooling.
 */
export interface ContractConfig {
  /** Admin Stellar account (G...) after initialization; `null` before. */
  readonly admin: string | null;
  /** Whether `initialize(admin)` has already completed. */
  readonly initialized: boolean;
  /** Version metadata describing the current stored state. */
  readonly version: ContractVersionInfo;
  /** High-level asset allowlist policy. */
  readonly allowlistMode: AllowlistMode;
}

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

/** Bounded page of payment history returned by the contract. */
export interface PaymentHistoryPage {
  readonly records: PaymentRecord[];
  readonly nextCursor: number;
  readonly hasMore: boolean;
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
  8: 'AssetNotAllowed',
  9: 'Unauthorized',
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
