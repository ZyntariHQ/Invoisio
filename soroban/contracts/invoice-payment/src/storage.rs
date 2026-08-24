use crate::errors::ContractError;
use crate::events;
use soroban_sdk::{contracttype, Address, Env, String, Vec};

/// Maximum number of allowlisted assets returned in one `list_assets` page.
pub const MAX_ALLOWLIST_PAGE_SIZE: u32 = 25;

// ============================================================================
// TTL Policy
// ============================================================================
//
// The contract uses two TTL thresholds:
// - MIN_TTL = 17,280 ledgers (~1 day)  - extend when remaining TTL falls below this
// - BUMP_TTL = 518,400 ledgers (~30 days) - target TTL after extension
//
// TTL Extension Strategy:
//
// 1. WRITE operations (any state mutation):
//    - Always call `extend_ttl(MIN_TTL, BUMP_TTL)` after writing
//    - This applies to: set_admin, set_pending_admin, set_contract_meta,
//      set_native_allowed, set_paused, bump_count, bump_history_count
//
// 2. CRITICAL READ operations (instance storage that must survive):
//    - Always call `extend_ttl(MIN_TTL, BUMP_TTL)` after reading
//    - This applies to: get_admin, get_pending_admin_opt, get_pending_admin,
//      has_admin, has_pending_admin, is_native_allowed, is_paused,
//      get_count, get_history_count, get_contract_config, get_contract_meta,
//      get_storage_schema_version, get_state_contract_version,
//      is_schema_compatible, is_history_index_consistent,
//      get_missing_history_count, get_payment_count
//
// 3. PERSISTENT READ operations (payment records, history, allowlist):
//    - TTL is extended on read via individual get/read functions
//    - This applies to: get_payment, get_history_record, is_asset_allowed
//
// Rationale:
// - Instance storage contains critical contract configuration (admin, pause state,
//   allowlist policy, counters) that must remain available for as long as the
//   contract is actively used.
// - Permissionless views (config, admin, pending_admin, is_paused, payment_count,
//   history_count) are frequently called by off-chain tooling and should keep
//   instance storage alive without requiring admin intervention.
// - Persistent storage records are bumped on read/write to prevent archival
//   while still being accessed.
//
// Idempotency:
// - `extend_ttl` is idempotent - calling it multiple times is safe
// - The contract maintains a "bump on access" pattern that naturally keeps
//   actively-used storage alive
//
// Maintenance:
// - If adding a new instance storage read, ALWAYS add `extend_ttl` after the read
// - If adding a new instance storage write, ALWAYS add `extend_ttl` after the write
// ============================================================================

// TTL budget
// At ~5-second ledger close times:
//   MIN_TTL  = 17 280 ledgers ≈ 1 day   (extend when remaining TTL falls below this)
//   BUMP_TTL = 518 400 ledgers ≈ 30 days (target TTL after extension)

pub(crate) const MIN_TTL: u32 = 17_280;
pub(crate) const BUMP_TTL: u32 = 518_400;

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
/// `native_allowed` reflects the mutable XLM toggle controlled by
/// `set_allow_native`. `requires_token_allowlist` is `true` whenever at least
/// one issued asset has been explicitly allowlisted via `allow_asset`; it is
/// derived from real on-chain state (`AllowListCount > 0`) and never hardcoded.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AllowlistMode {
    pub native_allowed: bool,
    /// Derived from the allowlist index count; `true` when at least one
    /// token pair has been explicitly allowlisted.
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
    /// The address awaiting acceptance via `accept_admin()`, if `propose_admin()`
    /// was called. `None` when no transfer is in flight.
    pub pending_admin: Option<Address>,
    /// Whether the contract has been initialised and can accept admin-gated writes.
    pub initialized: bool,
    /// On-chain version metadata associated with the current stored state.
    pub version: ContractMeta,
    /// High-level asset policy snapshot for native XLM and issued tokens.
    pub allowlist_mode: AllowlistMode,
    /// Whether the contract is currently paused (writes disabled).
    pub paused: bool,
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
    /// Append-only write-order log of invoice IDs, keyed by `PaymentCount`
    /// index at write time. Kept independent of `PaymentHistory` so payment
    /// records stay enumerable during index rebuilds even if the history
    /// index itself is corrupted or cleared.
    PaymentLog(u32),
    /// Allowlist existence sentinel for a token in **persistent** storage.
    /// Key: AllowList(asset_code, issuer) → unit value (exists = allowed)
    AllowList(String, String),
    /// Enumerable allowlist index: maps a sequential slot number to the
    /// `AllowedAssetEntry` at that position, in **persistent** storage.
    /// Key: AllowListIndex(u32) → AllowedAssetEntry
    AllowListIndex(u32),
    /// Running count of allowlisted asset pairs in **instance** storage.
    AllowListCount,
    /// Flag for allowing native XLM in **instance** storage.
    AllowNative,
    /// Flag indicating whether the contract is paused (instance storage).
    Paused,
    /// Address proposed as the next admin by `propose_admin()` in **instance**
    /// storage. Read by `accept_admin()` to complete the two-step handoff.
    PendingAdmin,
    /// Global index tracking used settlement references.
    /// Key: SettlementRef(String) → unit value (exists = used)
    SettlementRef(String),
}

// Data structures

/// A single entry in the enumerable allowlist index.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AllowedAssetEntry {
    /// Token asset code, e.g. `"USDC"` (max 12 characters, never `"XLM"`).
    pub code: String,
    /// Stellar issuer address (G...).
    pub issuer: String,
}

/// Bounded, cursor-friendly slice of the allowlist index.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct AllowlistPage {
    /// Asset entries returned for this page.
    pub entries: Vec<AllowedAssetEntry>,
    /// Cursor to pass to the next call (`next_cursor` from this page).
    pub next_cursor: u32,
    /// `true` when more entries are available after `next_cursor`.
    pub has_more: bool,
    /// Total number of allowlisted assets at the time of the call.
    pub total: u32,
}

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

    /// Normalised settlement reference for backend deduplication and auditing.
    ///
    /// A deterministic hash or reference ID (e.g. a SHA-256 hex string or
    /// a well-known reconciliation identifier) that the backend uses for
    /// idempotent settlement reconciliation. Stored on-chain so any observer
    /// can verify the settlement reference associated with a payment.
    pub settlement_ref: String,
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
    /// Number of history-index slots in `[cursor, next_cursor)` that were
    /// expected to hold a record but did not (e.g. a corrupted or
    /// partially-rebuilt index). Always `0` for a healthy index. Off-chain
    /// tooling can use this to detect index corruption without inferring it
    /// from record counts.
    pub gaps_skipped: u32,
}

// ─── Version Helpers (Instance Storage) ──────────────────────────────────────

/// Get contract metadata from instance storage. Bumps TTL if present.
pub fn get_contract_meta(env: &Env) -> Option<ContractMeta> {
    let meta: Option<ContractMeta> = env.storage().instance().get(&DataKey::ContractMeta);
    if meta.is_some() {
        // Bump TTL on every critical instance read
        env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
    }
    meta
}

/// Persist contract metadata and extend instance TTL.
pub fn set_contract_meta(env: &Env, meta: &ContractMeta) {
    env.storage().instance().set(&DataKey::ContractMeta, meta);
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
}

/// Ensure metadata exists and reflects the current contract build/schema.
/// Bumps instance TTL on every call.
pub fn ensure_current_contract_meta(env: &Env) {
    let expected = current_contract_meta();
    match get_contract_meta(env) {
        Some(meta) if meta == expected => {
            // Bump TTL on every critical instance read
            env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
        }
        _ => set_contract_meta(env, &expected),
    }
}

/// Get the storage schema version from instance storage. Bumps TTL.
pub fn get_storage_schema_version(env: &Env) -> u32 {
    let version = get_contract_meta(env)
        .map(|meta| meta.storage_schema_version)
        .unwrap_or(LEGACY_STORAGE_SCHEMA_VERSION);
    // Bump TTL on every critical instance read
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
    version
}

/// Get the contract version from instance storage. Bumps TTL.
pub fn get_state_contract_version(env: &Env) -> u32 {
    let version = get_contract_meta(env)
        .map(|meta| meta.contract_version)
        .unwrap_or(LEGACY_CONTRACT_VERSION);
    // Bump TTL on every critical instance read
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
    version
}

/// Check if the current storage schema is compatible with this contract version.
/// Returns true if the schema version is <= the version expected by the contract.
/// Bumps instance TTL on every call.
pub fn is_schema_compatible(env: &Env) -> bool {
    let current = get_storage_schema_version(env);
    // Bump TTL on every critical instance read
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
    current <= STORAGE_SCHEMA_VERSION
}

/// Get the current storage schema version or 0 if not set. Bumps TTL.
pub fn get_schema_version(env: &Env) -> u32 {
    get_storage_schema_version(env)
}

// ─── Config Helpers (Instance Storage) ──────────────────────────────────────

/// Return a high-level snapshot of contract state for ops tooling.
/// Bumps instance TTL on every call to keep critical config alive.
pub fn get_contract_config(env: &Env) -> ContractConfig {
    let allowlist_count = get_allowlist_count(env);
    let config = ContractConfig {
        admin: env.storage().instance().get(&DataKey::Admin),
        pending_admin: get_pending_admin_opt(env),
        initialized: has_admin(env),
        version: ContractMeta {
            contract_version: get_state_contract_version(env),
            storage_schema_version: get_storage_schema_version(env),
        },
        allowlist_mode: AllowlistMode {
            native_allowed: is_native_allowed(env),
            // Derived from real state: true when at least one token pair
            // has been explicitly added via allow_asset().
            requires_token_allowlist: allowlist_count > 0,
        },
        paused: is_paused(env),
    };
    // Additional TTL bump for the config read itself
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
    config
}

// ─── Admin Helpers (Instance Storage) ──────────────────────────────────────

/// Return `true` if the contract has been initialised. Bumps instance TTL.
pub fn has_admin(env: &Env) -> bool {
    let has = env.storage().instance().has(&DataKey::Admin);
    // Bump TTL on every critical instance read
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
    has
}

/// Read the admin address. Bumps instance TTL.
///
/// Returns [`ContractError::NotInitialized`] if `initialize()` was never called.
pub fn get_admin(env: &Env) -> Result<Address, ContractError> {
    let admin: Option<Address> = env.storage().instance().get(&DataKey::Admin);
    // Bump TTL on every critical instance read
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
    admin.ok_or(ContractError::NotInitialized)
}

/// Persist a new admin address and extend instance TTL.
pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
}

// ─── Pending-Admin Helpers (Instance Storage) ──────────────────────────────

/// Return `true` if an admin transfer proposal is pending. Bumps instance TTL.
pub fn has_pending_admin(env: &Env) -> bool {
    let has = env.storage().instance().has(&DataKey::PendingAdmin);
    // Bump TTL on every critical instance read
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
    has
}

/// Read the proposed next admin without erroring when none is pending.
/// Bumps instance TTL on every read.
pub fn get_pending_admin_opt(env: &Env) -> Option<Address> {
    let pending: Option<Address> = env.storage().instance().get(&DataKey::PendingAdmin);
    // Bump TTL on every critical instance read
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
    pending
}

/// Read the currently proposed next admin. Bumps instance TTL.
///
/// Returns [`ContractError::NoPendingAdmin`] if `propose_admin()` was never
/// called (or the previous proposal was accepted/cleared).
pub fn get_pending_admin(env: &Env) -> Result<Address, ContractError> {
    let pending: Option<Address> = env.storage().instance().get(&DataKey::PendingAdmin);
    // Bump TTL on every critical instance read
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
    pending.ok_or(ContractError::NoPendingAdmin)
}

/// Persist the proposed next admin and extend instance TTL.
pub fn set_pending_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::PendingAdmin, admin);
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
}

/// Remove any pending admin transfer proposal (e.g. after acceptance).
pub fn clear_pending_admin(env: &Env) {
    env.storage().instance().remove(&DataKey::PendingAdmin);
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
}

// ─── Payment Helpers (Persistent Storage) ──────────────────────────────────

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
/// Extends persistent storage TTL if record exists.
pub fn has_payment(env: &Env, invoice_id: &String) -> bool {
    let v1_key = payment_key_v1(invoice_id);
    if env.storage().persistent().has(&v1_key) {
        env.storage()
            .persistent()
            .extend_ttl(&v1_key, MIN_TTL, BUMP_TTL);
        return true;
    }
    let legacy_key = payment_key_legacy(invoice_id);
    if env.storage().persistent().has(&legacy_key) {
        env.storage()
            .persistent()
            .extend_ttl(&legacy_key, MIN_TTL, BUMP_TTL);
        return true;
    }
    false
}

/// Read a stored [`PaymentRecord`]. Extends persistent storage TTL.
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

/// Append a record to the deterministic history index and bump TTL.
pub fn append_payment_history(env: &Env, record: &PaymentRecord) {
    let index = get_history_count(env);
    let key = payment_history_key(index);
    env.storage().persistent().set(&key, record);
    env.storage()
        .persistent()
        .extend_ttl(&key, MIN_TTL, BUMP_TTL);
}

fn payment_log_key(index: u32) -> DataKey {
    DataKey::PaymentLog(index)
}

/// Append `invoice_id` to the write-order log at the current `PaymentCount`
/// index. This lets migrations enumerate every recorded payment even when
/// `PaymentHistory` has been cleared or corrupted.
pub fn append_payment_log(env: &Env, invoice_id: &String) {
    let index = get_count(env);
    let key = payment_log_key(index);
    env.storage().persistent().set(&key, invoice_id);
    env.storage()
        .persistent()
        .extend_ttl(&key, MIN_TTL, BUMP_TTL);
}

/// Look up the invoice ID recorded at a given write-order index, if any.
pub fn get_payment_log_entry(env: &Env, index: u32) -> Option<String> {
    let key = payment_log_key(index);
    let entry: Option<String> = env.storage().persistent().get(&key);
    if entry.is_some() {
        env.storage()
            .persistent()
            .extend_ttl(&key, MIN_TTL, BUMP_TTL);
    }
    entry
}

/// Get a history record by index. Extends TTL if record exists.
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
///
/// A missing slot (a hole left by a corrupted or partially-rebuilt index)
/// is skipped rather than treated as the end of the index: `index` always
/// advances by at least one slot per iteration, so `next_cursor` can never
/// repeat a `cursor` the caller already passed in, and `has_more` reflects
/// whether any slot at or after `next_cursor` remains to be scanned — never
/// a stalled hole. The page keeps scanning past holes (bounded by `total`)
/// until it collects `capped_limit` records or exhausts the index, so a
/// sparse index still fills pages as densely as the data allows.
///
/// Extends instance TTL for history count and persistent TTL for records.
pub fn get_payment_history_page(env: &Env, cursor: u32, limit: u32) -> PaymentHistoryPage {
    let total = get_history_count(env);
    let capped_limit = core::cmp::min(limit, MAX_PAYMENT_HISTORY_PAGE_SIZE);
    let start = core::cmp::min(cursor, total);

    let mut records: Vec<PaymentRecord> = Vec::new(env);
    let mut index = start;
    let mut collected: u32 = 0;
    let mut gaps_skipped: u32 = 0;

    while index < total && collected < capped_limit {
        match get_history_record(env, index) {
            Some(record) => {
                records.push_back(record);
                collected += 1;
            }
            None => gaps_skipped += 1,
        }
        index += 1;
    }

    PaymentHistoryPage {
        records,
        next_cursor: index,
        has_more: index < total,
        gaps_skipped,
    }
}

// ─── Payment Counter Helpers (Instance Storage) ─────────────────────────────

/// Return the current payment count (0 if not yet set). Bumps instance TTL.
pub fn get_count(env: &Env) -> u32 {
    let count = env
        .storage()
        .instance()
        .get(&DataKey::PaymentCount)
        .unwrap_or(0u32);
    // Bump TTL on every critical instance read
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
    count
}

/// Gets the total number of payment records from instance storage. Bumps TTL.
pub fn get_payment_count(env: &Env) -> u32 {
    let count = env
        .storage()
        .instance()
        .get(&DataKey::PaymentCount)
        .unwrap_or(0u32);
    // Bump TTL on every critical instance read
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
    count
}

/// Increment the payment counter and extend instance TTL.
pub fn bump_count(env: &Env) {
    let count = get_count(env);
    env.storage()
        .instance()
        .set(&DataKey::PaymentCount, &(count + 1u32));
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
}

/// Sets the payment count in instance storage.
pub fn set_payment_count(env: &Env, count: u32) {
    env.storage().instance().set(&DataKey::PaymentCount, &count);
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
}

// ─── Payment History Helpers (Instance Storage) ─────────────────────────────

/// Return the number of indexed payment history entries. Bumps instance TTL.
pub fn get_history_count(env: &Env) -> u32 {
    let count = env
        .storage()
        .instance()
        .get(&DataKey::PaymentHistoryCount)
        .unwrap_or(0u32);
    // Bump TTL on every critical instance read
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
    count
}

/// Sets the history count in instance storage.
pub fn set_history_count(env: &Env, count: u32) {
    env.storage()
        .instance()
        .set(&DataKey::PaymentHistoryCount, &count);
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
}

/// Increment the history index counter and extend instance TTL.
pub fn bump_history_count(env: &Env) {
    let count = get_history_count(env);
    env.storage()
        .instance()
        .set(&DataKey::PaymentHistoryCount, &(count + 1u32));
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
}

/// Checks if the history index is consistent with the payment count.
/// Bumps instance TTL on every call.
pub fn is_history_index_consistent(env: &Env) -> bool {
    let history_count = get_history_count(env);
    let payment_count = get_payment_count(env);
    // Bump TTL on every critical instance read
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
    history_count == payment_count
}

/// Returns the number of history entries that are missing from the index.
/// Bumps instance TTL on every call.
pub fn get_missing_history_count(env: &Env) -> u32 {
    let history_count = get_history_count(env);
    let payment_count = get_payment_count(env);
    // Bump TTL on every critical instance read
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
    payment_count.saturating_sub(history_count)
}

// ─── Allowlist Helpers ──────────────────────────────────────────────────────

// ─── Allowlist Counter Helpers (Instance Storage) ───────────────────────────

/// Return the current number of allowlisted asset pairs. Bumps instance TTL.
pub fn get_allowlist_count(env: &Env) -> u32 {
    let count = env
        .storage()
        .instance()
        .get(&DataKey::AllowListCount)
        .unwrap_or(0u32);
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
    count
}

/// Persist the allowlist count in instance storage.
pub fn set_allowlist_count(env: &Env, count: u32) {
    env.storage()
        .instance()
        .set(&DataKey::AllowListCount, &count);
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
}

/// Increment the allowlist counter.
fn bump_allowlist_count(env: &Env) {
    let count = get_allowlist_count(env);
    set_allowlist_count(env, count + 1);
}

/// Decrement the allowlist counter (saturating at 0).
fn decrement_allowlist_count(env: &Env) {
    let count = get_allowlist_count(env);
    set_allowlist_count(env, count.saturating_sub(1));
}

// ─── Allowlist Index Helpers (Persistent Storage) ────────────────────────────

fn allowlist_index_key(slot: u32) -> DataKey {
    DataKey::AllowListIndex(slot)
}

/// Append an asset pair to the dense enumerable index.
/// Caller is responsible for ensuring the pair is not already present.
fn append_to_allowlist_index(env: &Env, code: &String, issuer: &String) {
    let slot = get_allowlist_count(env);
    let key = allowlist_index_key(slot);
    let entry = AllowedAssetEntry {
        code: code.clone(),
        issuer: issuer.clone(),
    };
    env.storage().persistent().set(&key, &entry);
    env.storage()
        .persistent()
        .extend_ttl(&key, MIN_TTL, BUMP_TTL);
    bump_allowlist_count(env);
}

/// Remove an asset pair from the dense enumerable index using swap-and-pop.
///
/// Scans from slot 0 up to `count - 1` for the matching pair, then overwrites
/// it with the last slot's entry and removes the tail, keeping the index dense.
///
/// Returns `true` if the pair was found and removed, `false` if not present.
fn remove_from_allowlist_index(env: &Env, code: &String, issuer: &String) -> bool {
    let count = get_allowlist_count(env);
    if count == 0 {
        return false;
    }

    // Find the slot containing the matching pair.
    let mut found_slot: Option<u32> = None;
    for slot in 0..count {
        let key = allowlist_index_key(slot);
        let entry: Option<AllowedAssetEntry> = env.storage().persistent().get(&key);
        if let Some(e) = entry {
            if e.code == *code && e.issuer == *issuer {
                found_slot = Some(slot);
                break;
            }
        }
    }

    let slot = match found_slot {
        Some(s) => s,
        None => return false,
    };

    let last_slot = count - 1;
    if slot != last_slot {
        // Swap with last entry to keep index dense.
        let last_key = allowlist_index_key(last_slot);
        let last_entry: AllowedAssetEntry = env
            .storage()
            .persistent()
            .get(&last_key)
            .expect("last slot must exist");
        let target_key = allowlist_index_key(slot);
        env.storage().persistent().set(&target_key, &last_entry);
        env.storage()
            .persistent()
            .extend_ttl(&target_key, MIN_TTL, BUMP_TTL);
    }

    // Remove the (now-duplicate) last slot.
    let tail_key = allowlist_index_key(last_slot);
    env.storage().persistent().remove(&tail_key);
    decrement_allowlist_count(env);

    true
}

/// Read a bounded page of the allowlist index starting at `cursor`.
///
/// Mirrors `get_payment_history_page`: `cursor` is the slot index to start from,
/// `limit` is capped at `MAX_ALLOWLIST_PAGE_SIZE`. Holes in the dense index
/// (e.g. from TTL expiry) are skipped without ending the page early.
pub fn get_allowlist_page(env: &Env, cursor: u32, limit: u32) -> AllowlistPage {
    let total = get_allowlist_count(env);
    let capped = core::cmp::min(limit, MAX_ALLOWLIST_PAGE_SIZE);
    let start = core::cmp::min(cursor, total);

    let mut entries: Vec<AllowedAssetEntry> = Vec::new(env);
    let mut index = start;
    let mut collected: u32 = 0;

    while index < total && collected < capped {
        let key = allowlist_index_key(index);
        let entry: Option<AllowedAssetEntry> = env.storage().persistent().get(&key);
        if let Some(e) = entry {
            env.storage()
                .persistent()
                .extend_ttl(&key, MIN_TTL, BUMP_TTL);
            entries.push_back(e);
            collected += 1;
        }
        index += 1;
    }

    AllowlistPage {
        entries,
        next_cursor: index,
        has_more: index < total,
        total,
    }
}

/// Return `true` if native XLM is allowed. Bumps instance TTL.
pub fn is_native_allowed(env: &Env) -> bool {
    let allowed = env
        .storage()
        .instance()
        .get(&DataKey::AllowNative)
        .unwrap_or(false);
    // Bump TTL on every critical instance read
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
    allowed
}

/// Set allow flag for native XLM and extend instance TTL.
pub fn set_native_allowed(env: &Env, allowed: bool) {
    env.storage()
        .instance()
        .set(&DataKey::AllowNative, &allowed);
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
}

/// Return `true` if the specific token is allowlisted.
/// Extends persistent storage TTL if entry exists.
pub fn is_asset_allowed(env: &Env, code: &String, issuer: &String) -> bool {
    let key = DataKey::AllowList(code.clone(), issuer.clone());
    let exists = env.storage().persistent().has(&key);
    if exists {
        env.storage()
            .persistent()
            .extend_ttl(&key, MIN_TTL, BUMP_TTL);
    }
    exists
}

/// Add an asset to the allowlist existence sentinel and the enumerable index.
/// Does nothing (idempotent) if the pair is already present.
pub fn allow_asset(env: &Env, code: &String, issuer: &String) {
    let key = DataKey::AllowList(code.clone(), issuer.clone());
    if env.storage().persistent().has(&key) {
        // Already present: bump TTL and return without touching the index.
        env.storage()
            .persistent()
            .extend_ttl(&key, MIN_TTL, BUMP_TTL);
        return;
    }
    // Store existence sentinel.
    env.storage().persistent().set(&key, &());
    env.storage()
        .persistent()
        .extend_ttl(&key, MIN_TTL, BUMP_TTL);
    // Append to the dense enumerable index.
    append_to_allowlist_index(env, code, issuer);
}

/// Remove an asset from the allowlist.
///
/// Returns `true` when the pair was present and removed, `false` when the
/// pair was never in the allowlist (no-op).
pub fn revoke_asset(env: &Env, code: &String, issuer: &String) -> bool {
    let key = DataKey::AllowList(code.clone(), issuer.clone());
    if !env.storage().persistent().has(&key) {
        return false;
    }
    env.storage().persistent().remove(&key);
    // Keep the enumerable index in sync.
    remove_from_allowlist_index(env, code, issuer);
    true
}

/// Rebuild the enumerable allowlist index from a caller-supplied list of pairs.
///
/// Used during migration of legacy deployments where the index did not exist.
/// Clears the current index (if any) and re-inserts all pairs from `pairs`.
/// Skips any pair that does not have an existence sentinel in persistent storage
/// (so stale pairs passed by the operator are silently dropped).
pub fn rebuild_allowlist_index(
    env: &Env,
    pairs: &Vec<AllowedAssetEntry>,
) {
    // Clear old index entries.
    let old_count = get_allowlist_count(env);
    for slot in 0..old_count {
        let key = allowlist_index_key(slot);
        env.storage().persistent().remove(&key);
    }
    set_allowlist_count(env, 0);

    // Re-insert only pairs whose existence sentinel is present.
    for entry in pairs.iter() {
        let sentinel = DataKey::AllowList(entry.code.clone(), entry.issuer.clone());
        if env.storage().persistent().has(&sentinel) {
            append_to_allowlist_index(env, &entry.code, &entry.issuer);
        }
    }
}

// ─── Pause Helpers ──────────────────────────────────────────────────────────

/// Return `true` if the contract is paused. Bumps instance TTL.
pub fn is_paused(env: &Env) -> bool {
    let paused = env
        .storage()
        .instance()
        .get(&DataKey::Paused)
        .unwrap_or(false);
    // Bump TTL on every critical instance read
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
    paused
}

/// Set the paused state. Admin-only. Extends instance TTL.
pub fn set_paused(env: &Env, paused: bool) {
    env.storage().instance().set(&DataKey::Paused, &paused);
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
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
        // Even if schema is current, ensure history index is complete
        // This catches cases where migration was interrupted
        if !is_history_index_consistent(env) {
            // Rebuild the index if it's incomplete
            crate::migration::rebuild_payment_history_index(env)?;
        }
        return Ok(());
    }

    if current > target_version {
        return Err(ContractError::StorageSchemaTooNew);
    }

    // Migrate step by step from current to target
    let mut version = current;
    while version < target_version {
        match version {
            0 => {
                // Use the migration module for V0 → V1
                crate::migration::migrate_schema_v0_to_v1(env)?;
            }
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

// ─── Settlement Reference Helpers ──────────────────────────────────────────

/// Key for tracking used settlement references in persistent storage.
fn settlement_ref_key(ref_str: &String) -> DataKey {
    DataKey::SettlementRef(ref_str.clone())
}

/// Checks if a settlement reference has already been used.
///
/// # Arguments
/// * `env` - The Soroban environment
/// * `ref_str` - The settlement reference to check
///
/// # Returns
/// * `true` if the reference has been used
/// * `false` otherwise
pub fn is_settlement_ref_used(env: &Env, ref_str: &String) -> bool {
    let key = settlement_ref_key(ref_str);
    env.storage().persistent().has(&key)
}

/// Records a settlement reference as used and extends its TTL.
///
/// # Arguments
/// * `env` - The Soroban environment
/// * `ref_str` - The settlement reference to record
///
/// # Panics
/// * If the reference is already used (caller should check first)
pub fn record_settlement_ref(env: &Env, ref_str: &String) {
    let key = settlement_ref_key(ref_str);
    // Store a unit value since we only care about existence
    env.storage().persistent().set(&key, &());
    env.storage()
        .persistent()
        .extend_ttl(&key, MIN_TTL, BUMP_TTL);
}
