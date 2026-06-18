use soroban_sdk::{contracttype, Address, Env, String, Vec};

use crate::errors::ContractError;
use crate::events;

// TTL budget
// At ~5-second ledger close times:
//   MIN_TTL  = 17 280 ledgers ≈ 1 day   (extend when remaining TTL falls below this)
//   BUMP_TTL = 518 400 ledgers ≈ 30 days (target TTL after extension)

const MIN_TTL: u32 = 17_280;
const BUMP_TTL: u32 = 518_400;

// Versioning

/// Packed semver for this WASM build: `MAJOR * 1_000_000 + MINOR * 1_000 + PATCH`.
pub const CONTRACT_VERSION_MAJOR: u32 = 1;
pub const CONTRACT_VERSION_MINOR: u32 = 0;
pub const CONTRACT_VERSION_PATCH: u32 = 0;
pub const STORAGE_SCHEMA_VERSION: u32 = 1;

/// Legacy deployments (before explicit version metadata existed).
pub const LEGACY_CONTRACT_VERSION: u32 = 0;
pub const LEGACY_STORAGE_SCHEMA_VERSION: u32 = 0;

pub const fn pack_version(major: u32, minor: u32, patch: u32) -> u32 {
    major * 1_000_000 + minor * 1_000 + patch
}

pub const CONTRACT_VERSION: u32 = pack_version(
    CONTRACT_VERSION_MAJOR,
    CONTRACT_VERSION_MINOR,
    CONTRACT_VERSION_PATCH,
);

/// Maximum number of payment records returned in one history page.
pub const MAX_PAYMENT_HISTORY_PAGE_SIZE: u32 = 25;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractMeta {
    /// Contract code version that most recently wrote state.
    pub contract_version: u32,
    /// Storage layout/schema version in this contract instance.
    pub storage_schema_version: u32,
}

pub fn current_contract_meta() -> ContractMeta {
    ContractMeta {
        contract_version: CONTRACT_VERSION,
        storage_schema_version: STORAGE_SCHEMA_VERSION,
    }
}

/// Stable, high-level summary of allowlist policy for integration consumers.
///
/// `requires_token_allowlist` is currently always `true`: issued assets must be
/// explicitly added via `allow_asset(code, issuer)` before `record_payment`
/// accepts them. `native_allowed` reflects the mutable XLM toggle controlled by
/// `set_allow_native`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AllowlistMode {
    pub native_allowed: bool,
    pub requires_token_allowlist: bool,
}

/// Stable read model for ops tooling and client integrations.
///
/// Returned by the contract `config()` view so consumers can inspect
/// initialization status, admin ownership, version metadata, and allowlist
/// policy in a single permissionless call.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractConfig {
    /// `Some(admin)` once `initialize(admin)` has been called; `None` before.
    pub admin: Option<Address>,
    /// Whether the contract has been initialised and can accept admin-gated writes.
    pub initialized: bool,
    /// On-chain version metadata associated with the current stored state.
    pub version: ContractMeta,
    /// High-level asset policy snapshot for native XLM and issued tokens.
    pub allowlist_mode: AllowlistMode,
}

// Storage keys

/// All keys used in this contract's instance and persistent storage.
///
/// `#[contracttype]` encodes each variant as an XDR `ScVal`, which Soroban
/// uses as the raw storage key on the ledger.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Stores the admin [`Address`] in **instance** storage.
    Admin,
    /// Running count of recorded payments in **instance** storage.
    PaymentCount,
    /// Running count of history-indexed payment records in **instance** storage.
    PaymentHistoryCount,
    /// Contract-level version metadata in **instance** storage.
    ContractMeta,
    /// Legacy pre-versioning key: kept for backward-compatible reads.
    Payment(String),
    /// Schema v1 key: active write path for payment records.
    PaymentV1(String),
    /// Append-only history index used for deterministic paging.
    PaymentHistory(u32),
    /// Append-only per-payer history index used for deterministic paging.
    /// Key: PayerHistory(payer, index)
    PayerHistory(Address, u32),
    /// Running count of history-indexed entries for a specific payer.
    /// Lives in **persistent** storage (not instance) because it is keyed
    /// per payer and would otherwise grow the bounded instance footprint
    /// loaded on every invocation.
    PayerHistoryCount(Address),
    /// Allowlist entry for a token in **persistent** storage.
    /// Key: AllowList(asset_code, issuer)
    AllowList(String, String),
    /// Flag for allowing native XLM in **instance** storage.
    AllowNative,
}

// Data structures

/// Asset type enum for multi-asset support.
///
/// This enum distinguishes between native XLM and Stellar-issued tokens,
/// providing a type-safe way to handle different asset types in the contract.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum Asset {
    /// Native XLM asset (no issuer required).
    Native,
    /// Stellar-issued token with code and issuer.
    /// Format: (asset_code, issuer_address)
    /// Example: ("USDC", "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5")
    Token(String, String),
}

/// On-chain snapshot of a single invoice payment.
///
/// ## Asset encoding
/// Uses the [`Asset`] enum to provide type-safe multi-asset support.
///
/// ## Amount units
/// - **XLM**: stroops — 1 XLM = 10 000 000 stroops.
/// - **Other tokens**: the token's own smallest unit
///   (USDC on Stellar uses 7 decimal places).
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct PaymentRecord {
    /// Unique invoice identifier.
    ///
    /// Matches the native Stellar Payment memo used by Invoisio:
    /// `"invoisio-<invoiceId>"`.
    pub invoice_id: String,

    /// Stellar account address that sent the payment.
    pub payer: Address,

    /// Asset type and details.
    pub asset: Asset,

    /// Payment amount in the asset's smallest unit (must be > 0).
    pub amount: i128,

    /// Unix timestamp (seconds) sourced from the ledger at recording time.
    pub timestamp: u64,
}

/// A bounded, cursor-friendly slice of payment history.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct PaymentHistoryPage {
    /// Records returned for this page.
    pub records: Vec<PaymentRecord>,
    /// Cursor to pass to the next call.
    pub next_cursor: u32,
    /// True when more entries are available after `next_cursor`.
    pub has_more: bool,
}

// Version helpers (instance storage)

pub fn get_contract_meta(env: &Env) -> Option<ContractMeta> {
    env.storage().instance().get(&DataKey::ContractMeta)
}

pub fn set_contract_meta(env: &Env, meta: &ContractMeta) {
    env.storage().instance().set(&DataKey::ContractMeta, meta);
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
}

/// Ensure metadata exists and reflects the current contract build/schema.
pub fn ensure_current_contract_meta(env: &Env) {
    let expected = current_contract_meta();
    match get_contract_meta(env) {
        Some(meta) if meta == expected => {
            env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
        }
        _ => set_contract_meta(env, &expected),
    }
}

pub fn get_storage_schema_version(env: &Env) -> u32 {
    get_contract_meta(env)
        .map(|meta| meta.storage_schema_version)
        .unwrap_or(LEGACY_STORAGE_SCHEMA_VERSION)
}

pub fn get_state_contract_version(env: &Env) -> u32 {
    get_contract_meta(env)
        .map(|meta| meta.contract_version)
        .unwrap_or(LEGACY_CONTRACT_VERSION)
}

pub fn get_contract_config(env: &Env) -> ContractConfig {
    ContractConfig {
        admin: env.storage().instance().get(&DataKey::Admin),
        initialized: has_admin(env),
        version: ContractMeta {
            contract_version: get_state_contract_version(env),
            storage_schema_version: get_storage_schema_version(env),
        },
        allowlist_mode: AllowlistMode {
            native_allowed: is_native_allowed(env),
            requires_token_allowlist: true,
        },
    }
}

// Admin helpers (instance storage)

/// Return `true` if the contract has been initialised.
pub fn has_admin(env: &Env) -> bool {
    env.storage().instance().has(&DataKey::Admin)
}

/// Read the admin address.
///
/// Returns [`ContractError::NotInitialized`] if `initialize()` was never called.
pub fn get_admin(env: &Env) -> Result<Address, ContractError> {
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .ok_or(ContractError::NotInitialized)
}

/// Persist a new admin address and extend instance TTL.
pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
}

// Payment helpers (persistent storage)

fn payment_key_legacy(invoice_id: &String) -> DataKey {
    DataKey::Payment(invoice_id.clone())
}

fn payment_key_v1(invoice_id: &String) -> DataKey {
    DataKey::PaymentV1(invoice_id.clone())
}

fn payment_history_key(index: u32) -> DataKey {
    DataKey::PaymentHistory(index)
}

/// Return `true` if a [`PaymentRecord`] exists for `invoice_id`.
pub fn has_payment(env: &Env, invoice_id: &String) -> bool {
    let v1_key = payment_key_v1(invoice_id);
    if env.storage().persistent().has(&v1_key) {
        return true;
    }
    env.storage()
        .persistent()
        .has(&payment_key_legacy(invoice_id))
}

/// Read a stored [`PaymentRecord`].
///
/// Returns [`ContractError::PaymentNotFound`] if nothing has been recorded for
/// `invoice_id`.
pub fn get_payment(env: &Env, invoice_id: &String) -> Result<PaymentRecord, ContractError> {
    let v1_key = payment_key_v1(invoice_id);
    let v1_record: Option<PaymentRecord> = env.storage().persistent().get(&v1_key);
    if let Some(record) = v1_record {
        env.storage()
            .persistent()
            .extend_ttl(&v1_key, MIN_TTL, BUMP_TTL);
        return Ok(record);
    }

    let legacy_key = payment_key_legacy(invoice_id);
    let legacy_record: Option<PaymentRecord> = env.storage().persistent().get(&legacy_key);
    match legacy_record {
        Some(record) => {
            // Legacy compatibility path: read old key and copy it into the
            // versioned schema key so future lookups are on the new layout.
            env.storage()
                .persistent()
                .extend_ttl(&legacy_key, MIN_TTL, BUMP_TTL);
            env.storage().persistent().set(&v1_key, &record);
            env.storage()
                .persistent()
                .extend_ttl(&v1_key, MIN_TTL, BUMP_TTL);
            Ok(record)
        }
        None => Err(ContractError::PaymentNotFound),
    }
}

/// Persist a new [`PaymentRecord`] and bump its TTL.
pub fn set_payment(env: &Env, record: &PaymentRecord) {
    let key = payment_key_v1(&record.invoice_id);
    env.storage().persistent().set(&key, record);
    env.storage()
        .persistent()
        .extend_ttl(&key, MIN_TTL, BUMP_TTL);
}

/// Append a record to the deterministic history index.
pub fn append_payment_history(env: &Env, record: &PaymentRecord) {
    let index = get_history_count(env);
    let key = payment_history_key(index);
    env.storage().persistent().set(&key, record);
    env.storage()
        .persistent()
        .extend_ttl(&key, MIN_TTL, BUMP_TTL);
}

// Payment counter helpers (instance storage)

/// Return the current payment count (0 if not yet set).
pub fn get_count(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::PaymentCount)
        .unwrap_or(0u32)
}

/// Increment the payment counter and extend instance TTL.
pub fn bump_count(env: &Env) {
    let count = get_count(env);
    env.storage()
        .instance()
        .set(&DataKey::PaymentCount, &(count + 1u32));
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
}

// Payment history helpers (instance storage)

/// Return the number of indexed payment history entries.
pub fn get_history_count(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::PaymentHistoryCount)
        .unwrap_or(0u32)
}

/// Increment the history index counter and extend instance TTL.
pub fn bump_history_count(env: &Env) {
    let count = get_history_count(env);
    env.storage()
        .instance()
        .set(&DataKey::PaymentHistoryCount, &(count + 1u32));
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
}

fn get_history_record(env: &Env, index: u32) -> Option<PaymentRecord> {
    let key = payment_history_key(index);
    let record: Option<PaymentRecord> = env.storage().persistent().get(&key);
    if record.is_some() {
        env.storage()
            .persistent()
            .extend_ttl(&key, MIN_TTL, BUMP_TTL);
    }
    record
}

/// Read a bounded page of history starting at `cursor`.
pub fn get_payment_history_page(env: &Env, cursor: u32, limit: u32) -> PaymentHistoryPage {
    let total = get_history_count(env);
    let capped_limit = core::cmp::min(limit, MAX_PAYMENT_HISTORY_PAGE_SIZE);
    let start = core::cmp::min(cursor, total);
    let end = start.saturating_add(capped_limit).min(total);

    let mut records: Vec<PaymentRecord> = Vec::new(env);
    let mut index = start;
    while index < end {
        match get_history_record(env, index) {
            Some(record) => records.push_back(record),
            None => break,
        }
        index += 1;
    }

    PaymentHistoryPage {
        records,
        next_cursor: index,
        has_more: index < total,
    }
}

// Payer history helpers (persistent storage)
//
// Keyed per `payer` so the index can grow without inflating the bounded
// instance storage footprint that is loaded on every contract invocation.

fn payer_history_key(payer: &Address, index: u32) -> DataKey {
    DataKey::PayerHistory(payer.clone(), index)
}

fn payer_history_count_key(payer: &Address) -> DataKey {
    DataKey::PayerHistoryCount(payer.clone())
}

/// Return the number of indexed history entries for `payer` (0 if none).
pub fn get_payer_history_count(env: &Env, payer: &Address) -> u32 {
    env.storage()
        .persistent()
        .get(&payer_history_count_key(payer))
        .unwrap_or(0u32)
}

/// Increment `payer`'s history index counter and extend its TTL.
pub fn bump_payer_history_count(env: &Env, payer: &Address) {
    let key = payer_history_count_key(payer);
    let count = get_payer_history_count(env, payer);
    env.storage().persistent().set(&key, &(count + 1u32));
    env.storage()
        .persistent()
        .extend_ttl(&key, MIN_TTL, BUMP_TTL);
}

/// Append a record to `payer`'s deterministic history index.
pub fn append_payer_history(env: &Env, payer: &Address, record: &PaymentRecord) {
    let index = get_payer_history_count(env, payer);
    let key = payer_history_key(payer, index);
    env.storage().persistent().set(&key, record);
    env.storage()
        .persistent()
        .extend_ttl(&key, MIN_TTL, BUMP_TTL);
}

fn get_payer_history_record(env: &Env, payer: &Address, index: u32) -> Option<PaymentRecord> {
    let key = payer_history_key(payer, index);
    let record: Option<PaymentRecord> = env.storage().persistent().get(&key);
    if record.is_some() {
        env.storage()
            .persistent()
            .extend_ttl(&key, MIN_TTL, BUMP_TTL);
    }
    record
}

/// Read a bounded page of `payer`'s history starting at `cursor`.
///
/// Mirrors [`get_payment_history_page`] but scoped to a single payer, using
/// the same cursor/limit semantics and the same page-size cap.
pub fn get_payer_history_page(
    env: &Env,
    payer: &Address,
    cursor: u32,
    limit: u32,
) -> PaymentHistoryPage {
    let total = get_payer_history_count(env, payer);
    let capped_limit = core::cmp::min(limit, MAX_PAYMENT_HISTORY_PAGE_SIZE);
    let start = core::cmp::min(cursor, total);
    let end = start.saturating_add(capped_limit).min(total);

    let mut records: Vec<PaymentRecord> = Vec::new(env);
    let mut index = start;
    while index < end {
        match get_payer_history_record(env, payer, index) {
            Some(record) => records.push_back(record),
            None => break,
        }
        index += 1;
    }

    PaymentHistoryPage {
        records,
        next_cursor: index,
        has_more: index < total,
    }
}

// Allowlist helpers

/// Return `true` if native XLM is allowed.
pub fn is_native_allowed(env: &Env) -> bool {
    env.storage()
        .instance()
        .get(&DataKey::AllowNative)
        .unwrap_or(false)
}

/// Set allow flag for native XLM.
pub fn set_native_allowed(env: &Env, allowed: bool) {
    env.storage()
        .instance()
        .set(&DataKey::AllowNative, &allowed);
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
}

/// Return `true` if the specific token is allowlisted.
pub fn is_asset_allowed(env: &Env, code: &String, issuer: &String) -> bool {
    let key = DataKey::AllowList(code.clone(), issuer.clone());
    env.storage().persistent().has(&key)
}

/// Add an asset to the allowlist.
pub fn allow_asset(env: &Env, code: &String, issuer: &String) {
    let key = DataKey::AllowList(code.clone(), issuer.clone());
    // We store a unit value since we only care about existence.
    env.storage().persistent().set(&key, &());
    env.storage()
        .persistent()
        .extend_ttl(&key, MIN_TTL, BUMP_TTL);
}

/// Remove an asset from the allowlist.
pub fn revoke_asset(env: &Env, code: &String, issuer: &String) {
    let key = DataKey::AllowList(code.clone(), issuer.clone());
    env.storage().persistent().remove(&key);
}

// ─── Storage Schema Migration ───────────────────────────────────────────────

/// Error returned when migration is not supported.
#[derive(Debug)]
pub struct MigrationError;

/// Upgrade storage schema from current version to target version.
///
/// This is the main entry point for schema migrations. It handles all
/// version upgrades from V0 (legacy) to the current schema version.
///
/// # Idempotency
/// Safe to call multiple times - checks current version first.
///
/// # Events
/// Emits `StorageSchemaUpgraded` event on successful migration.
pub fn upgrade_storage_schema(env: &Env, target_version: u32) -> Result<(), ContractError> {
    let current = get_storage_schema_version(env);

    if current == target_version {
        return Ok(());
    }

    if current > target_version {
        return Err(ContractError::StorageSchemaTooNew);
    }

    // Migrate step by step from current to target
    let mut version = current;
    while version < target_version {
        match version {
            0 => migrate_schema_v0_to_v1(env)?,
            // Future migrations:
            // 1 => migrate_schema_v1_to_v2(env)?,
            // 2 => migrate_schema_v2_to_v3(env)?,
            _ => return Err(ContractError::StorageSchemaTooOld),
        }
        version += 1;
    }

    // Update metadata to reflect new schema version
    let old_version = current;
    let mut meta = get_contract_meta(env).unwrap_or_else(current_contract_meta);
    meta.storage_schema_version = target_version;
    set_contract_meta(env, &meta);

    // Emit upgrade event
    events::emit_storage_schema_upgraded(env, old_version, target_version);

    Ok(())
}

/// Migration from schema version 0 (legacy) to version 1.
///
/// Schema V0: No ContractMeta, Payment keys only.
/// Schema V1: ContractMeta + PaymentV1 keys (with lazy migration on read).
fn migrate_schema_v0_to_v1(env: &Env) -> Result<(), ContractError> {
    // The lazy migration path in get_payment() already handles data migration.
    // We just need to ensure ContractMeta exists and is correct.
    ensure_current_contract_meta(env);
    Ok(())
}

/// Check if the current storage schema is compatible with this contract version.
///
/// Returns true if the schema version is <= the version expected by the contract.
/// This prevents code from reading a newer schema it doesn't understand.
pub fn is_schema_compatible(env: &Env) -> bool {
    let current = get_storage_schema_version(env);
    current <= STORAGE_SCHEMA_VERSION
}

/// Get the current storage schema version or 0 if not set.
pub fn get_schema_version(env: &Env) -> u32 {
    get_storage_schema_version(env)
}
