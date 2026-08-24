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
 * `requiresTokenAllowlist` is derived from real on-chain state: it is `true`
 * when at least one `(code, issuer)` pair has been explicitly added via
 * `allow_asset`, and `false` when the allowlist is empty or all entries have
 * been revoked. It is no longer hardcoded.
 */
export interface AllowlistMode {
  /** Whether native XLM payments are currently accepted. */
  readonly nativeAllowed: boolean;
  /**
   * `true` when at least one token pair is allowlisted (`allowlist_count > 0`).
   * Derived from real on-chain state — never hardcoded.
   */
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
  /**
   * Address awaiting acceptance via `accept_admin` after `propose_admin`, or
   * `null` when no admin transfer is in flight.
   */
  readonly pendingAdmin: string | null;
  /** Whether `initialize(admin)` has already completed. */
  readonly initialized: boolean;
  /** Version metadata describing the current stored state. */
  readonly version: ContractVersionInfo;
  /** High-level asset allowlist policy. */
  readonly allowlistMode: AllowlistMode;
  /** Whether the contract is currently paused (writes disabled). */
  readonly paused: boolean;
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
  /**
   * Normalised settlement reference (hash or reconciliation ID) used for
   * backend deduplication and idempotent settlement reconciliation.
   * Stores the value passed to `record_payment`.
   */
  readonly settlementRef: string;
}

/** Bounded page of payment history returned by the contract. */
export interface PaymentHistoryPage {
  readonly records: PaymentRecord[];
  readonly nextCursor: number;
  readonly hasMore: boolean;
  readonly archivedSkipped: number;
  readonly corruptSkipped: number;
}

// ─── Allowlist types ──────────────────────────────────────────────────────────

/** A single entry in the enumerable allowlist index. */
export interface AllowedAssetEntry {
  /** Token code, e.g. "USDC" (max 12 characters, never "XLM"). */
  readonly code: string;
  /** Stellar issuer address (G...). */
  readonly issuer: string;
}

/** Bounded, cursor-friendly slice of the allowlist returned by `list_assets()`. */
export interface AllowlistPage {
  /** Asset entries for this page. */
  readonly entries: AllowedAssetEntry[];
  /** Cursor to pass to the next `list_assets()` call. */
  readonly nextCursor: number;
  /** `true` when more entries exist after `nextCursor`. */
  readonly hasMore: boolean;
  /** Total number of allowlisted assets at the time of the call. */
  readonly total: number;
}

// ─── Error handling ───────────────────────────────────────────────────────────

// The typed contract error manifest (codes + meanings) lives in
// `./error-manifest` and is re-exported here so existing imports keep working.
import {
  CONTRACT_ERROR_CODES,
  CONTRACT_ERROR_MANIFEST,
  ContractErrorCode,
  ContractErrorManifestEntry,
  ContractErrorName,
  getContractError,
  getContractErrorCode,
} from './error-manifest';

export {
  CONTRACT_ERROR_CODES,
  CONTRACT_ERROR_MANIFEST,
  ContractErrorCode,
  ContractErrorManifestEntry,
  ContractErrorName,
  getContractError,
  getContractErrorCode,
};

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
   * Admin secret key (S...). Required for write operations: record_payment,
   * propose_admin (current admin), and accept_admin (proposed admin).
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
  /**
   * Normalised settlement reference or hash for backend deduplication and
   * idempotent reconciliation. Required — must be non-empty and at most
   * 128 characters (the contract rejects longer values with
   * `InvalidSettlementRef`).
   */
  readonly settlementRef: string;
}

/** Confirmed on-chain transaction result. */
export interface TransactionResult {
  readonly hash: string;
  readonly ledger: number;
}
