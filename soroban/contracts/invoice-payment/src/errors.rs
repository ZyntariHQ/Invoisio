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

    /// `invoice_id` was empty, exceeded the maximum allowed length, or was
    /// not in canonical form (ASCII lowercase letters, digits, and hyphens
    /// only — no uppercase, no whitespace). Every payment must reference a
    /// non-empty, bounded, canonical invoice identifier so the on-chain
    /// idempotency guard's byte-exact comparison cannot be defeated by
    /// case or whitespace variants of the same invoice.
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
    ///
    /// # Scope
    /// `ContractPaused` is returned by the following entrypoints when the
    /// contract has been paused via `set_paused(true)`:
    ///
    /// | Entrypoint              | Covered | Reason                                              |
    /// |-------------------------|---------|-----------------------------------------------------|
    /// | `record_payment`        | yes     | Payment log is frozen during incident investigation |
    /// | `propose_admin`         | yes     | Admin role cannot be transferred out while paused   |
    /// | `accept_admin`          | yes     | Admin role cannot be claimed while paused           |
    /// | `cancel_admin_transfer` | yes     | Control-plane changes are frozen while paused       |
    /// | `allow_asset`           | yes     | Asset allowlist cannot be rewritten while paused    |
    /// | `revoke_asset`          | yes     | Asset allowlist cannot be rewritten while paused    |
    /// | `set_allow_native`      | yes     | Native-asset policy cannot change while paused      |
    ///
    /// The following entrypoints are **intentionally exempt** and remain
    /// callable while paused, with admin-only access where applicable:
    ///
    /// | Entrypoint               | Exempt? | Rationale                                                                 |
    /// |--------------------------|---------|---------------------------------------------------------------------------|
    /// | `set_paused`             | yes     | Must be able to unpause the contract to lift containment                 |
    /// | `upgrade`                | yes     | The WASM-upgrade runbook *requires* `set_paused(true)` first             |
    /// | `upgrade_storage`        | yes     | Storage migration must run between `upgrade()` and the final unpause      |
    /// | `rebuild_history_index`  | yes     | Administrative recovery, may run during the upgrade window or standalone |
    /// | `migrate_legacy_payments`| yes     | Administrative cleanup of legacy keys, not a control-plane change (#508) |
    /// | All read entrypoints     | yes     | Investigation and auditing must remain possible during containment        |
    ContractPaused = 12,

    /// `settlement_ref` was empty, exceeded the maximum allowed length, or
    /// was not in canonical form (ASCII lowercase letters, digits, and
    /// hyphens only — no uppercase, no whitespace). This enforces the
    /// "normalised" contract documented on `settlement_ref` and keeps case
    /// or whitespace variants of the same reference from defeating the
    /// on-chain settlement-reference uniqueness guard.
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

    /// `record_payment()` was called with a `settlement_ref` that is already
    /// recorded. Each settlement reference must be globally unique across
    /// all payments.
    ///
    /// This alone does not say whether the rejection is a benign retry of
    /// an already-successful attempt for the *same* invoice, or a genuine
    /// reconciliation conflict from a *different* invoice — a caller needs
    /// `settlement_ref_owner(settlement_ref)` to tell the two apart (issue
    /// #495; see the doc comment on `record_payment` in `lib.rs`).
    SettlementRefAlreadyUsed = 20,

    /// `upgrade()` was called while the contract is not paused. The contract
    /// must stay paused for the entire `upgrade()` → `upgrade_storage()`
    /// window so no write can land on the new code before storage has been
    /// migrated — see the doc comment on `upgrade()` in `lib.rs`.
    MustBePausedForUpgrade = 21,

    /// `migrate_legacy_payments()` was called with more invoice_ids than
    /// `storage::MAX_LEGACY_MIGRATION_BATCH` in one call. Split the batch
    /// across multiple calls — each invoice_id migrates independently and
    /// idempotently, so the operation is safely resumable (issue #508).
    LegacyPaymentMigrationBatchTooLarge = 22,
}
