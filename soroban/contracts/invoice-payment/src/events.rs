use soroban_sdk::{contractevent, Address, Env, String};

/// Schema version for the `invoice_payment_recorded` event payload.
/// Bumped only when the payload shape changes in a breaking way so that
/// off-chain indexers can detect and adapt to the event format.
pub const EVENT_SCHEMA_VERSION: u32 = 1;

#[contractevent]
#[derive(Clone, Debug, PartialEq)]
pub struct InvoicePaymentRecorded {
    pub schema_version: u32,
    pub invoice_id: String,
    pub payer: Address,
    pub asset_code: String,
    pub asset_issuer: String,
    pub amount: i128,
    pub settlement_ref: String,
}

/// Emit an `"invoice_payment_recorded"` Soroban event carrying the flattened
/// `InvoicePaymentRecorded` as event data.
///
/// Off-chain consumers can filter by this topic via the Soroban RPC
/// [`getEvents`](https://developers.stellar.org/docs/data/rpc/api-reference/methods/getEvents)
/// endpoint or the `stellar events` CLI.
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
pub fn emit_payment_recorded(
    env: &Env,
    invoice_id: String,
    payer: Address,
    asset_code: String,
    asset_issuer: String,
    amount: i128,
    settlement_ref: String,
) {
    let payload = InvoicePaymentRecorded {
        schema_version: EVENT_SCHEMA_VERSION,
        invoice_id,
        payer,
        asset_code,
        asset_issuer,
        amount,
        settlement_ref,
    };

    payload.publish(env);
}

#[contractevent]
#[derive(Clone, Debug, PartialEq)]
pub struct AssetAllowlisted {
    pub code: String,
    pub issuer: String,
}

#[contractevent]
#[derive(Clone, Debug, PartialEq)]
pub struct AssetRevoked {
    pub code: String,
    pub issuer: String,
}

#[contractevent]
#[derive(Clone, Debug, PartialEq)]
pub struct NativeAllowChanged {
    pub allowed: bool,
}

pub fn emit_asset_allowlisted(env: &Env, code: String, issuer: String) {
    let payload = AssetAllowlisted { code, issuer };
    payload.publish(env);
}

pub fn emit_asset_revoked(env: &Env, code: String, issuer: String) {
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
#[contractevent]
#[derive(Clone, Debug, PartialEq)]
pub struct SettlementRefsMigrated {
    pub count: u32,
    pub migrated_at: u64,
}

/// Emit settlement references migrated event.
pub fn emit_settlement_refs_migrated(env: &Env, count: u32) {
    let payload = SettlementRefsMigrated {
        count,
        migrated_at: env.ledger().timestamp(),
    };
    payload.publish(env);
}
