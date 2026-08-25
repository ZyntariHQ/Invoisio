export type AssetNative = {
    readonly type: 'native';
};
export type AssetToken = {
    readonly type: 'token';
    /** Token code, e.g. "USDC" */
    readonly code: string;
    /** Issuer Stellar address (G...) */
    readonly issuer: string;
};
export type Asset = AssetNative | AssetToken;
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
}
/**
 * A single settlement-reference → invoice_id mapping, as recorded by
 * `record_payment` or backfilled by migration.
 */
export interface SettlementRefEntry {
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
import { CONTRACT_ERROR_CODES, CONTRACT_ERROR_MANIFEST, ContractErrorCode, ContractErrorManifestEntry, ContractErrorName, getContractError, getContractErrorCode } from './error-manifest';
export { CONTRACT_ERROR_CODES, CONTRACT_ERROR_MANIFEST, ContractErrorCode, ContractErrorManifestEntry, ContractErrorName, getContractError, getContractErrorCode, };
export declare class SorobanContractError extends Error {
    readonly code: ContractErrorCode;
    readonly numericCode: number;
    readonly name = "SorobanContractError";
    constructor(code: ContractErrorCode, numericCode: number, message: string);
}
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
    /** Issuer G... address for token assets; empty string ("") for XLM */
    readonly assetIssuer: string;
    /** Amount in smallest denomination (must be > 0) */
    readonly amount: bigint;
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
//# sourceMappingURL=types.d.ts.map