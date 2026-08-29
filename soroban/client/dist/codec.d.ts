import { xdr } from '@stellar/stellar-sdk';
import { AllowlistPage, ContractConfig, PaymentHistoryPage, PaymentRecord, SettlementRefIndexStatus, SettlementRefPage, SorobanContractError } from './types';
export type NamedEventPayload = Record<string, unknown>;
/** Decode contract-event data without treating declaration order as a schema. */
export declare function decodeNamedEventPayload(value: unknown): NamedEventPayload;
/** Apply the single schema-version policy shared by every contract event. */
export declare function validateEventSchemaVersion(payload: NamedEventPayload, expectedVersion: number): {
    schemaVersion: number;
} | {
    reason: string;
};
/** Maximum length of `invoiceId` accepted by `record_payment` on-chain. */
export declare const MAX_INVOICE_ID_LEN = 64;
/** Maximum length of `settlementRef` accepted by `record_payment` on-chain. */
export declare const MAX_SETTLEMENT_REF_LEN = 128;
/**
 * Maximum number of invoice ids accepted in one `migrateLegacyPayments`
 * call. Mirrors `storage::MAX_LEGACY_MIGRATION_BATCH` — exceeding it fails
 * on-chain with `LegacyPaymentMigrationBatchTooLarge` rather than silently
 * truncating; split a larger backlog across multiple calls instead.
 */
export declare const MAX_LEGACY_MIGRATION_BATCH = 20;
/**
 * Returns `true` if `value` is non-empty, at most `maxLen` characters, and
 * consists solely of ASCII lowercase letters, digits, and hyphens.
 */
export declare function isCanonicalIdentifier(value: string, maxLen: number): boolean;
/**
 * Throw a descriptive `Error` if `value` is not a canonical identifier —
 * empty, too long, or containing anything other than lowercase letters,
 * digits, and hyphens (e.g. uppercase, whitespace, or other punctuation).
 *
 * @param fieldName - used only in the thrown message, e.g. `"invoiceId"`.
 */
export declare function assertCanonicalIdentifier(value: string, maxLen: number, fieldName: string): void;
export declare function encodeString(value: string): xdr.ScVal;
export declare function encodeAddress(address: string): xdr.ScVal;
/**
 * Encode the contract `Asset` enum for `record_payment`.
 *
 * Native XLM is the `Native` unit variant — an empty `issuer` maps here, so
 * callers can keep passing `assetCode: 'XLM', assetIssuer: ''`. A token is
 * `Token(code, Address)`: a malformed issuer fails at `new Address(...)`
 * rather than being written on-chain.
 */
export declare function encodeAsset(code: string, issuer: string): xdr.ScVal;
/**
 * Encode a BigInt as a Soroban i128 ScVal.
 * Soroban stores token amounts as i128 to safely cover the full range of
 * 7-decimal fixed-point values without floating-point rounding.
 */
export declare function encodeI128(value: bigint): xdr.ScVal;
export declare function encodeU32(value: number): xdr.ScVal;
export declare function encodeBool(value: boolean): xdr.ScVal;
/** Encode a `Vec<String>` argument, e.g. for `migrate_legacy_payments`. */
export declare function encodeStringVec(values: string[]): xdr.ScVal;
/**
 * Encode a hex-encoded 32-byte hash (e.g. a WASM hash) as a Soroban
 * `BytesN<32>` ScVal. Accepts an optional `0x` prefix.
 */
export declare function encodeBytes32(hexHash: string): xdr.ScVal;
/**
 * Decode a `PaymentRecord` ScVal returned by `get_payment()`.
 *
 * The Rust struct fields are snake_case: invoice_id, payer, asset, amount,
 * timestamp, settlement_ref.
 * Time:  O(1) — fixed number of fields.
 * Space: O(1) — fixed-size output struct.
 */
export declare function decodePaymentRecord(scVal: xdr.ScVal): PaymentRecord;
/**
 * Decode a bounded payment-history page returned by `payment_history()`.
 */
export declare function decodePaymentHistoryPage(scVal: xdr.ScVal): PaymentHistoryPage;
/**
 * Decode the stable `config()` response returned by the contract.
 *
 * Rust fields are snake_case:
 * - admin
 * - pending_admin
 * - initialized
 * - version.contract_version
 * - version.storage_schema_version
 * - allowlist_mode.native_allowed
 */
export declare function decodeContractConfig(scVal: xdr.ScVal): ContractConfig;
/**
 * Decode the `Option<String>` returned by `settlement_ref_owner()`.
 *
 * `scValToNative` resolves an absent Soroban `Option` to `null` or
 * `undefined` depending on SDK version; both map to `null` here so callers
 * get a single, unambiguous "not found" sentinel rather than an error (issue
 * #495) — the same convention `getPendingAdmin()` already uses.
 */
export declare function decodeSettlementRefOwner(scVal: xdr.ScVal): string | null;
/**
 * Decode a bounded settlement-reference page returned by
 * `settlement_ref_history()`.
 */
export declare function decodeSettlementRefPage(scVal: xdr.ScVal): SettlementRefPage;
/**
 * Decode a bounded allowlist page returned by `allowed_assets()`.
 */
export declare function decodeAllowlistPage(scVal: xdr.ScVal): AllowlistPage;
/**
 * Decode the `(u32, u32, bool)` tuple returned by
 * `settlement_ref_index_status()`.
 */
export declare function decodeSettlementRefIndexStatus(scVal: xdr.ScVal): SettlementRefIndexStatus;
/**
 * Parse a Soroban simulation or host error string into a typed `SorobanContractError`.
 * The numeric code is resolved against `CONTRACT_ERROR_MANIFEST`; returns code
 * `Unknown` (-1) when the numeric code is not in the known set.
 */
export declare function parseContractError(errorString: string): SorobanContractError;
//# sourceMappingURL=codec.d.ts.map