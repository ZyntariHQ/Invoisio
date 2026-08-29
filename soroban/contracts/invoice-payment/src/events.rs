use soroban_sdk::{contractevent, Address, BytesN, Env, String};

/// Schema version for the `invoice_payment_recorded` event payload.
/// Bumped only when the payload shape changes in a breaking way so that
/// off-chain indexers can detect and adapt to the event format.
///
/// Bumped to 2 for issue #512: the payload shrank from the full
/// `PaymentRecord` (payer, asset, amount, asset_decimals, settlement_ref
/// included) down to just `invoice_id`. A public event carrying the full
/// record completely bypassed every read-method access-control decision in
/// this contract — anyone streaming `getEvents` could reconstruct the whole
/// payment ledger regardless of what the read methods allowed. The event now
/// only signals *that* an invoice_id was recorded; a consumer who wants the
/// full record (including `asset_decimals`, added independently for asset
/// precision — see `PaymentRecord::asset_decimals`) must already know
/// `invoice_id` and call `get_payment(invoice_id)`.
pub const EVENT_SCHEMA_VERSION: u32 = 2;

#[contractevent]
#[derive(Clone, Debug, PartialEq)]
pub struct InvoicePaymentRecorded {
    pub schema_version: u32,
    pub invoice_id: String,
}

/// Emit an `"invoice_payment_recorded"` Soroban event carrying only
/// `schema_version` and `invoice_id` as event data (issue #512).
///
/// Off-chain consumers can filter by this topic via the Soroban RPC
/// [`getEvents`](https://developers.stellar.org/docs/data/rpc/api-reference/methods/getEvents)
/// endpoint or the `stellar events` CLI, but this event alone does **not**
/// reveal payer, asset, amount, or settlement reference — a consumer that
/// needs those must already know `invoice_id` and call
/// `get_payment(invoice_id)`, an unauthenticated read gated only on already
/// possessing the identifier.
///
/// ## Consuming events off-chain
/// ```sh
/// # Stream all "invoice_payment_recorded" events for CONTRACT_ID on testnet
/// stellar events \
///   --id <CONTRACT_ID> \
///   --network testnet \
///   --type contract \
///   --start-ledger 1
/// ```
pub fn emit_payment_recorded(env: &Env, invoice_id: String) {
    let payload = InvoicePaymentRecorded {
        schema_version: EVENT_SCHEMA_VERSION,
        invoice_id,
    };

    payload.publish(env);
}

#[contractevent]
#[derive(Clone, Debug, PartialEq)]
pub struct AssetAllowlisted {
    pub code: String,
    pub issuer: Address,
}

#[contractevent]
#[derive(Clone, Debug, PartialEq)]
pub struct AssetRevoked {
    pub code: String,
    pub issuer: Address,
}

#[contractevent]
#[derive(Clone, Debug, PartialEq)]
pub struct NativeAllowChanged {
    pub allowed: bool,
}

pub fn emit_asset_allowlisted(env: &Env, code: String, issuer: Address) {
    let payload = AssetAllowlisted { code, issuer };
    payload.publish(env);
}

pub fn emit_asset_revoked(env: &Env, code: String, issuer: Address) {
    let payload = AssetRevoked { code, issuer };
    payload.publish(env);
}

pub fn emit_native_allow_changed(env: &Env, allowed: bool) {
    let payload = NativeAllowChanged { allowed };
    payload.publish(env);
}

#[contractevent]
#[derive(Clone, Debug, PartialEq)]
pub struct StorageSchemaUpgraded {
    pub from_version: u32,
    pub to_version: u32,
    pub upgraded_at: u64,
}

pub fn emit_storage_schema_upgraded(env: &Env, from_version: u32, to_version: u32) {
    let payload = StorageSchemaUpgraded {
        from_version,
        to_version,
        upgraded_at: env.ledger().timestamp(),
    };
    payload.publish(env);
}

#[contractevent]
#[derive(Clone, Debug, PartialEq)]
pub struct ContractPaused {
    pub paused: bool,
    pub triggered_by: Address,
    pub timestamp: u64,
}

pub fn emit_contract_paused(env: &Env, paused: bool, triggered_by: Address) {
    let payload = ContractPaused {
        paused,
        triggered_by,
        timestamp: env.ledger().timestamp(),
    };
    payload.publish(env);
}

#[contractevent]
#[derive(Clone, Debug, PartialEq)]
pub struct AdminTransferProposed {
    /// Admin that initiated the handoff.
    pub current_admin: Address,
    /// Address proposed to become the next admin.
    pub new_admin: Address,
    pub timestamp: u64,
}

pub fn emit_admin_transfer_proposed(env: &Env, current_admin: Address, new_admin: Address) {
    let payload = AdminTransferProposed {
        current_admin,
        new_admin,
        timestamp: env.ledger().timestamp(),
    };
    payload.publish(env);
}

#[contractevent]
#[derive(Clone, Debug, PartialEq)]
pub struct AdminTransferAccepted {
    /// Admin that relinquished the role.
    pub previous_admin: Address,
    /// Address that accepted and is now the contract admin.
    pub new_admin: Address,
    pub timestamp: u64,
}

pub fn emit_admin_transfer_accepted(env: &Env, previous_admin: Address, new_admin: Address) {
    let payload = AdminTransferAccepted {
        previous_admin,
        new_admin,
        timestamp: env.ledger().timestamp(),
    };
    payload.publish(env);
}

/// Event emitted when the current admin revokes a pending admin transfer
/// proposal via `cancel_admin_transfer()`.
#[contractevent]
#[derive(Clone, Debug, PartialEq)]
pub struct AdminTransferCancelled {
    /// Admin that cancelled the pending handoff.
    pub current_admin: Address,
    /// Address that had been proposed and is no longer in line for the role.
    pub cancelled_admin: Address,
    pub timestamp: u64,
}

pub fn emit_admin_transfer_cancelled(env: &Env, current_admin: Address, cancelled_admin: Address) {
    let payload = AdminTransferCancelled {
        current_admin,
        cancelled_admin,
        timestamp: env.ledger().timestamp(),
    };
    payload.publish(env);
}

/// Event emitted when the history index is rebuilt.
#[contractevent]
#[derive(Clone, Debug, PartialEq)]
pub struct HistoryIndexRebuilt {
    pub record_count: u32,
    pub rebuilt_at: u64,
}

/// Emit a history index rebuilt event.
pub fn emit_history_index_rebuilt(env: &Env, record_count: u32) {
    let payload = HistoryIndexRebuilt {
        record_count,
        rebuilt_at: env.ledger().timestamp(),
    };
    payload.publish(env);
}

/// Event emitted when settlement references are migrated during upgrade.
///
/// `conflicts_skipped` counts payments whose settlement_ref was already
/// owned by a different invoice in the index and was therefore left
/// untouched rather than overwritten (issue #495) — a non-zero value here
/// means genuine pre-existing duplicate settlement references were found and
/// need operator investigation, not that the migration failed.
#[contractevent]
#[derive(Clone, Debug, PartialEq)]
pub struct SettlementRefsMigrated {
    pub count: u32,
    pub conflicts_skipped: u32,
    pub migrated_at: u64,
}

/// Emit settlement references migrated event.
pub fn emit_settlement_refs_migrated(env: &Env, count: u32, conflicts_skipped: u32) {
    let payload = SettlementRefsMigrated {
        count,
        conflicts_skipped,
        migrated_at: env.ledger().timestamp(),
    };
    payload.publish(env);
}

/// Emitted by `migrate_schema_v3_to_v4` (issue #464) after backfilling the
/// allowlist enumeration index from payment history. `discovered` counts
/// distinct, still-allowed `(code, issuer)` pairs newly indexed. It is not
/// necessarily the deployment's full allowlist — see that migration's doc
/// comment for the recovery limit (an asset allowlisted but never paid with
/// before the upgrade is not discoverable this way).
#[contractevent]
#[derive(Clone, Debug, PartialEq)]
pub struct AllowlistIndexBackfilled {
    pub discovered: u32,
    pub migrated_at: u64,
}

pub fn emit_allowlist_index_backfilled(env: &Env, discovered: u32) {
    let payload = AllowlistIndexBackfilled {
        discovered,
        migrated_at: env.ledger().timestamp(),
    };
    payload.publish(env);
}

/// Emitted by `migrate_schema_v5_to_v6` after rewriting Token issuers from
/// unvalidated strings into [`Address`] values on payment records, history
/// slots, and allowlist keys. `skipped_malformed` counts string issuers that
/// were not a well-formed Stellar address and were therefore left on the
/// legacy key rather than dropped.
#[contractevent]
#[derive(Clone, Debug, PartialEq)]
pub struct IssuersMigrated {
    pub payments: u32,
    pub allowlist: u32,
    pub skipped_malformed: u32,
    pub migrated_at: u64,
}

pub fn emit_issuers_migrated(env: &Env, payments: u32, allowlist: u32, skipped_malformed: u32) {
    let payload = IssuersMigrated {
        payments,
        allowlist,
        skipped_malformed,
        migrated_at: env.ledger().timestamp(),
    };
    payload.publish(env);
}
/// `Payment(invoice_id)` entry was migrated to `PaymentV1` and its legacy
/// copy removed. `migrated` counts entries actually migrated in this call —
/// it excludes ids that were already current or not found (issue #508).
#[contractevent]
#[derive(Clone, Debug, PartialEq)]
pub struct LegacyPaymentsMigrated {
    pub migrated: u32,
    pub migrated_at: u64,
}

pub fn emit_legacy_payments_migrated(env: &Env, migrated: u32) {
    let payload = LegacyPaymentsMigrated {
        migrated,
        migrated_at: env.ledger().timestamp(),
    };
    payload.publish(env);
}

/// Event emitted by `upgrade()` when the contract admin swaps the deployed
/// WASM in place via `env.deployer().update_current_contract_wasm(...)`.
///
/// Lets off-chain indexers detect a code transition without polling
/// `contract_version()`. `previous_version` is the packed semver of the code
/// that was running when `upgrade()` was called; `new_version` is the
/// caller-supplied packed semver of the code being deployed (not verified
/// on-chain — see `upgrade()`'s doc comment in `lib.rs`).
#[contractevent]
#[derive(Clone, Debug, PartialEq)]
pub struct ContractUpgraded {
    pub previous_version: u32,
    pub new_version: u32,
    pub new_wasm_hash: BytesN<32>,
    pub upgraded_by: Address,
    pub upgraded_at: u64,
}

/// Emit a contract-upgraded event.
pub fn emit_contract_upgraded(
    env: &Env,
    previous_version: u32,
    new_version: u32,
    new_wasm_hash: BytesN<32>,
    upgraded_by: Address,
) {
    let payload = ContractUpgraded {
        previous_version,
        new_version,
        new_wasm_hash,
        upgraded_by,
        upgraded_at: env.ledger().timestamp(),
    };
    payload.publish(env);
}
