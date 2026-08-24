use soroban_sdk::contracterror;

/// Typed error codes for the Invoisio invoice-payment contract.
///
/// Using `#[contracterror]` means the Soroban host converts these into
/// `ScError::Contract(u32)` values on the ledger, which are:
/// - Surfaced as structured errors in Horizon `/operations` responses
/// - Inspectable via `stellar contract invoke --sim`
/// - Matchable in tests with `client.try_method()` → `Err(Ok(ContractError::*))`
///
/// **Never reorder or remove codes** once deployed — error codes are part of
/// the on-chain ABI. Only add new variants at the end.
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum ContractError {
    /// `initialize()` was called on a contract that is already set up.
    AlreadyInitialized = 1,

    /// A method that requires admin was called before `initialize()`.
    NotInitialized = 2,

    /// `record_payment()` was called with an `invoice_id` that was already
    /// recorded. Each invoice may be recorded exactly once.
    PaymentAlreadyRecorded = 3,

    /// `get_payment()` was called for an `invoice_id` that has no record.
    PaymentNotFound = 4,

    /// `amount` was zero or negative. All payments must be strictly positive.
    InvalidAmount = 5,

    /// `invoice_id` was an empty string. Every payment must reference a
    /// non-empty invoice identifier.
    InvalidInvoiceId = 6,

    /// `asset_code` was empty, or a non-XLM asset was supplied without an
    /// `asset_issuer`. Every payment must identify the asset unambiguously.
    InvalidAsset = 7,

    /// The asset (code, issuer pair) is not in the admin-controlled allowlist.
    AssetNotAllowed = 8,

    /// The caller is not authorized to perform this operation.
    Unauthorized = 9,

    /// `upgrade_storage()` was called on a deployment whose on-chain
    /// `storage_schema_version` is newer than this WASM knows about.
    StorageSchemaTooNew = 10,

    /// `upgrade_storage()` was called but the schema is already at or beyond
    /// the version this WASM implements — nothing to do.
    StorageSchemaTooOld = 11,

    /// The contract is paused and cannot perform the requested operation.
    ContractPaused = 12,

    /// `settlement_ref` was empty or exceeded the maximum allowed length.
    InvalidSettlementRef = 13,

    /// `accept_admin()` was called but no admin transfer proposal is pending.
    NoPendingAdmin = 14,

    /// `propose_admin()` was called while an admin transfer proposal is
    /// already pending. Only one handoff may be in flight at a time.
    PendingAdminExists = 15,

    /// `propose_admin()` was called with an invalid proposed admin — for
    /// example, the current admin re-proposing themselves. A transfer must
    /// hand the role to a different address.
    InvalidProposedAdmin = 16,

    /// History index rebuild failed - check storage consistency
    HistoryIndexRebuildFailed = 17,

    /// Migration required before rebuilding history index
    MigrationRequired = 18,

    /// History index is incomplete - rebuild required
    HistoryIndexIncomplete = 19,

    /// The settlement reference has already been used for a different invoice.
    /// Each settlement reference must be globally unique across all payments.
    SettlementRefAlreadyUsed = 20,

    /// `revoke_asset()` was called for a `(code, issuer)` pair that was never
    /// allowlisted. Callers can use this to distinguish a no-op revoke from a
    /// successful removal.
    AssetNotFound = 21,
}
