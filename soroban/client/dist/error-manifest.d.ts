/** A single stable contract error: its on-chain numeric code, name, and meaning. */
export interface ContractErrorManifestEntry {
    /**
     * Numeric code surfaced as `ScError::Contract(u32)` — stable part of the
     * on-chain ABI. Never reused.
     */
    readonly code: number;
    /** Stable name matching the Rust `ContractError` variant (camelCase). */
    readonly name: string;
    /** Human-readable meaning: the condition under which the contract raises this error. */
    readonly meaning: string;
}
/**
 * Typed manifest of every error the invoice-payment contract can return.
 * Keep in sync with `soroban/contracts/invoice-payment/src/errors.rs`.
 */
export declare const CONTRACT_ERROR_MANIFEST: readonly [{
    readonly code: 1;
    readonly name: "AlreadyInitialized";
    readonly meaning: "initialize() was called on a contract that is already set up.";
}, {
    readonly code: 2;
    readonly name: "NotInitialized";
    readonly meaning: "A method that requires admin was called before initialize().";
}, {
    readonly code: 3;
    readonly name: "PaymentAlreadyRecorded";
    readonly meaning: "record_payment() was called with an invoice_id that was already recorded; each invoice may be recorded exactly once.";
}, {
    readonly code: 4;
    readonly name: "PaymentNotFound";
    readonly meaning: "get_payment() was called for an invoice_id that has no record.";
}, {
    readonly code: 5;
    readonly name: "InvalidAmount";
    readonly meaning: "amount was zero or negative; all payments must be strictly positive.";
}, {
    readonly code: 6;
    readonly name: "InvalidInvoiceId";
    readonly meaning: "invoice_id was an empty string; every payment must reference a non-empty invoice identifier.";
}, {
    readonly code: 7;
    readonly name: "InvalidAsset";
    readonly meaning: "token code was empty, exceeded 12 characters, or was the reserved code \"XLM\" on Asset::Token; native XLM must use Asset::Native. Token issuers are Address values, so a malformed issuer cannot reach this error.";
}, {
    readonly code: 8;
    readonly name: "AssetNotAllowed";
    readonly meaning: "The asset (code, issuer pair) is not in the admin-controlled allowlist.";
}, {
    readonly code: 9;
    readonly name: "Unauthorized";
    readonly meaning: "The caller is not authorized to perform this operation.";
}, {
    readonly code: 10;
    readonly name: "StorageSchemaTooNew";
    readonly meaning: "upgrade_storage() was called on a deployment whose on-chain storage_schema_version is newer than this WASM knows about.";
}, {
    readonly code: 11;
    readonly name: "StorageSchemaTooOld";
    readonly meaning: "upgrade_storage() was called but the schema is already at or beyond the version this WASM implements — nothing to do.";
}, {
    readonly code: 12;
    readonly name: "ContractPaused";
    readonly meaning: "The contract is paused (emergency-stop containment window). Returned by record_payment, propose_admin, accept_admin, cancel_admin_transfer, allow_asset, revoke_asset, and set_allow_native. Does NOT block set_paused (unpausing), upgrade, upgrade_storage, rebuild_history_index, or any read method — see setPaused() JSDoc for the full scope table.";
}, {
    readonly code: 13;
    readonly name: "InvalidSettlementRef";
    readonly meaning: "settlement_ref was empty or exceeded the maximum allowed length.";
}, {
    readonly code: 14;
    readonly name: "NoPendingAdmin";
    readonly meaning: "accept_admin() was called but no admin transfer proposal is pending.";
}, {
    readonly code: 15;
    readonly name: "PendingAdminExists";
    readonly meaning: "propose_admin() was called while an admin transfer proposal is already pending; only one handoff may be in flight at a time.";
}, {
    readonly code: 16;
    readonly name: "InvalidProposedAdmin";
    readonly meaning: "propose_admin() was called with an invalid proposed admin, e.g. the current admin re-proposing themselves.";
}, {
    readonly code: 17;
    readonly name: "HistoryIndexRebuildFailed";
    readonly meaning: "rebuild_history_index() failed to rebuild the payment history index; check storage consistency.";
}, {
    readonly code: 18;
    readonly name: "MigrationRequired";
    readonly meaning: "rebuild_history_index() was called on a deployment whose storage schema is not yet current; run upgrade_storage() first.";
}, {
    readonly code: 19;
    readonly name: "HistoryIndexIncomplete";
    readonly meaning: "The payment history index is incomplete and must be rebuilt via rebuild_history_index().";
}, {
    readonly code: 20;
    readonly name: "SettlementRefAlreadyUsed";
    readonly meaning: "The settlement reference has already been used for a different invoice; each settlement reference must be globally unique across all payments.";
}, {
    readonly code: 21;
    readonly name: "MustBePausedForUpgrade";
    readonly meaning: "upgrade() was called while the contract is not paused; the contract must stay paused for the whole upgrade() -> upgrade_storage() window.";
}, {
    readonly code: 22;
    readonly name: "LegacyPaymentMigrationBatchTooLarge";
    readonly meaning: "migrate_legacy_payments() was called with more invoice_ids than MAX_LEGACY_MIGRATION_BATCH in one call; split the batch across multiple calls.";
}, {
    readonly code: 23;
    readonly name: "IssuerMigrationIncomplete";
    readonly meaning: "upgrade_storage() rewrote a bounded batch of Token issuers from String to Address and has more payment-log slots left; call upgrade_storage() again. Stay paused until storage_schema_version is current.";
}];
/** Union of every known contract error name (excludes the `Unknown` fallback). */
export type ContractErrorName = (typeof CONTRACT_ERROR_MANIFEST)[number]['name'];
/** A known contract error name, or `Unknown` when the numeric code is not mapped. */
export type ContractErrorCode = ContractErrorName | 'Unknown';
/**
 * Numeric code → stable name, derived from `CONTRACT_ERROR_MANIFEST`.
 * Kept for backward compatibility with existing consumers.
 */
export declare const CONTRACT_ERROR_CODES: Readonly<Record<number, ContractErrorName>>;
/** Look up the full manifest entry for a numeric code; `undefined` if unmapped. */
export declare function getContractError(code: number): ContractErrorManifestEntry | undefined;
/**
 * Map a numeric contract error code to its stable name.
 * Returns `'Unknown'` when the code is not in the manifest.
 */
export declare function getContractErrorCode(code: number): ContractErrorCode;
//# sourceMappingURL=error-manifest.d.ts.map