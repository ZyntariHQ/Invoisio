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
 * There is no `requiresTokenAllowlist` field: every non-native asset always
 * requires allowlisting in this contract, so a field for it would only ever
 * report a constant, never real state (issue #464). Use
 * `getAllowedAssets()`/`getAllowlistCount()` to inspect the actual allowlist.
 */
export interface AllowlistMode {
  /** Whether native XLM payments are currently accepted. */
  readonly nativeAllowed: boolean;
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
  * Amount in the asset's smallest denomination. Divide by 10^assetDecimals
  * to format it; `0` means legacy precision is unknown.
   */
  readonly amount: bigint;
  /** Decimal places for `amount`; legacy records expose 0 (unknown). */
  readonly assetDecimals: number;
  /** Unix seconds at which the ledger included this record */
  readonly timestamp: bigint;
  /**
   * SHA-256 **commitment** of the settlement reference passed to
   * `record_payment` — not the plaintext value itself (issue #512). A
   * caller that already holds the plaintext (typically the Invoisio
   * backend, which generated it) can still deduplicate/verify by hashing
   * its own copy the same way, or by calling `getSettlementRefOwner` with
   * the plaintext directly. The plaintext is not recoverable from this
   * field.
   */
  readonly settlementRef: string;
}

/** Bounded page of payment history returned by the contract. */
export interface PaymentHistoryPage {
  readonly records: PaymentRecord[];
  readonly nextCursor: number;
  readonly hasMore: boolean;
}

/**
 * A single settlement-reference → invoice_id mapping, as recorded by
 * `record_payment` or backfilled by migration.
 */
export interface SettlementRefEntry {
  /** SHA-256 commitment of the settlement reference — never the plaintext. */
  readonly settlementRef: string;
  readonly invoiceId: string;
}

/**
 * Bounded, cursor-friendly page of the settlement-reference index returned
 * by `settlement_ref_history()`. Mirrors `PaymentHistoryPage`'s pagination
 * conventions.
 */
export interface SettlementRefPage {
  readonly records: SettlementRefEntry[];
  readonly nextCursor: number;
  readonly hasMore: boolean;
  /** Number of index slots in this page's range that were expected to hold
   * an entry but did not (e.g. a corrupted or partially-rebuilt index). */
  readonly gapsSkipped: number;
}

/**
 * A single allowlisted `(code, issuer)` pair, as recorded by `allow_asset`
 * or backfilled by migration.
 */
export interface AllowlistEntry {
  readonly code: string;
  readonly issuer: string;
}

/**
 * Bounded, cursor-friendly page of the currently-allowlisted assets returned
 * by `getAllowedAssets()`/`allowed_assets()`. Mirrors `SettlementRefPage`'s
 * pagination conventions, except a hole here is a normal outcome of
 * `revokeAsset()`, not only a sign of corruption.
 */
export interface AllowlistPage {
  readonly records: AllowlistEntry[];
  readonly nextCursor: number;
  readonly hasMore: boolean;
  /** Number of log slots in this page's range that have been revoked (or,
   * on a legacy pre-migration deployment, not yet backfilled). */
  readonly gapsSkipped: number;
}

/**
 * Quick consistency summary for the settlement-reference index, returned by
 * `settlement_ref_index_status()`.
 *
 * `isConsistent` is `true` only when every recorded payment has a
 * corresponding settlement-reference mapping. It reads `false` when some
 * payment's settlement_ref was never recorded — e.g. an empty settlement_ref
 * on legacy (pre-guard) data, or a duplicate reference that migration
 * deliberately left unresolved rather than silently overwrite. Use
 * `getSettlementRefHistory` together with `getPaymentHistory` to find the
 * affected payments.
 */
export interface SettlementRefIndexStatus {
  readonly settlementRefCount: number;
  readonly paymentCount: number;
  readonly isConsistent: boolean;
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
  /**
   * Unique invoice identifier, e.g. "invoisio-abc123". Must be in
   * **canonical form** — lowercase letters, digits, and hyphens only — and
   * at most `MAX_INVOICE_ID_LEN` (64) characters. `recordPayment` validates
   * this locally and throws before submitting a transaction if it isn't;
   * the contract enforces the same rule with `InvalidInvoiceId`.
   */
  readonly invoiceId: string;
  /** Stellar G... address of the payer */
  readonly payer: string;
  /** "XLM" or a token code such as "USDC" */
  readonly assetCode: string;
  /** Issuer G... address for token assets; empty string ("") for native XLM (`Asset::Native`). Must be a well-formed Stellar address when non-empty. */
  readonly assetIssuer: string;
  /** Amount in smallest denomination (must be > 0) */
  readonly amount: bigint;
  /** Decimal places recorded for the asset. Defaults to Stellar's 7. */
  readonly assetDecimals?: number;
  /**
   * Normalised settlement reference or hash for backend deduplication and
   * idempotent reconciliation. Required — must be in **canonical form**
   * (lowercase letters, digits, and hyphens only) and at most
   * `MAX_SETTLEMENT_REF_LEN` (128) characters. `recordPayment` validates
   * this locally and throws before submitting a transaction if it isn't;
   * the contract enforces the same rule with `InvalidSettlementRef`.
   */
  readonly settlementRef: string;
}

/** Confirmed on-chain transaction result. */
export interface TransactionResult {
  readonly hash: string;
  readonly ledger: number;
}
