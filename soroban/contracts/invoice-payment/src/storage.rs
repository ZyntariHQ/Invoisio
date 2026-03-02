use soroban_sdk::{contracttype, Address, Env, String};

use crate::errors::ContractError;

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
    /// Contract-level version metadata in **instance** storage.
    ContractMeta,
    /// Legacy pre-versioning key: kept for backward-compatible reads.
    Payment(String),
    /// Schema v1 key: active write path for payment records.
    PaymentV1(String),
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
