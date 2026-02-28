use soroban_sdk::{contracttype, Address, Env, String};

use crate::errors::ContractError;

// TTL budget
// At ~5-second ledger close times:
//   MIN_TTL  = 17 280 ledgers ≈ 1 day   (extend when remaining TTL falls below this)
//   BUMP_TTL = 518 400 ledgers ≈ 30 days (target TTL after extension)

const MIN_TTL: u32 = 17_280;
const BUMP_TTL: u32 = 518_400;

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
    /// A [`PaymentRecord`] indexed by `invoice_id` in **persistent** storage.
    Payment(String),
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

/// Return `true` if a [`PaymentRecord`] exists for `invoice_id`.
pub fn has_payment(env: &Env, invoice_id: &String) -> bool {
    env.storage()
        .persistent()
        .has(&DataKey::Payment(invoice_id.clone()))
}

/// Read a stored [`PaymentRecord`].
///
/// Returns [`ContractError::PaymentNotFound`] if nothing has been recorded for
/// `invoice_id`.
pub fn get_payment(env: &Env, invoice_id: &String) -> Result<PaymentRecord, ContractError> {
    let key = DataKey::Payment(invoice_id.clone());
    let record: Option<PaymentRecord> = env.storage().persistent().get(&key);
    match record {
        Some(r) => {
            // Extend TTL every time we read so hot records stay alive.
            env.storage()
                .persistent()
                .extend_ttl(&key, MIN_TTL, BUMP_TTL);
            Ok(r)
        }
        None => Err(ContractError::PaymentNotFound),
    }
}

/// Persist a new [`PaymentRecord`] and bump its TTL.
pub fn set_payment(env: &Env, record: &PaymentRecord) {
    let key = DataKey::Payment(record.invoice_id.clone());
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
