#![no_std]
use soroban_sdk::{contract, contractimpl, Address, Env, String};

pub mod errors;
pub mod events;
pub mod storage;

// Re-export the main types so `use super::*` in test.rs picks them up.
pub use errors::ContractError;
pub use storage::{
    Asset, ContractMeta, DataKey, PaymentRecord, CONTRACT_VERSION, CONTRACT_VERSION_MAJOR,
    CONTRACT_VERSION_MINOR, CONTRACT_VERSION_PATCH, STORAGE_SCHEMA_VERSION,
};

use events::emit_payment_recorded;
use storage::{
    bump_count, current_contract_meta, ensure_current_contract_meta, get_admin, get_count,
    get_payment, get_state_contract_version, get_storage_schema_version, has_admin, has_payment,
    set_admin, set_contract_meta, set_payment,
};

// Contract

/// # Invoisio Invoice Payment Tracking Contract
///
/// A minimal, auditable Soroban contract whose **sole purpose** is to provide a
/// reliable on-chain log of invoice payments, enabling the Invoisio backend to
/// reconcile Soroban events with native Stellar Payment operations observed via
/// Horizon.
///
/// ## Module layout
/// | Module        | Responsibility                              |
/// |---------------|---------------------------------------------|
/// | `errors.rs`   | `#[contracterror]` typed error codes        |
/// | `storage.rs`  | `DataKey`, `PaymentRecord`, TTL helpers     |
/// | `events.rs`   | `emit_payment_recorded` Soroban event helper|
/// | `lib.rs`      | Contract entry-points (this file)           |
///
/// ## Design decisions
/// - **Admin-gated writes:** only the admin (backend service account) can call
///   `record_payment`, preventing spam from arbitrary accounts.
/// - **Idempotent by `invoice_id`:** each invoice can be recorded exactly once,
///   preventing double-counting in reconciliation.
/// - **Persistent storage with TTL bumping:** records survive ledger archival;
///   TTLs are extended on every read and write.
/// - **Typed errors:** `#[contracterror]` returns structured `ScError::Contract`
///   values that appear in Horizon responses and are matchable in tests.
/// - **Soroban events:** every `record_payment` emits a `"payment_recorded"`
///   event carrying the full `PaymentRecord` so off-chain indexers don't need
///   to poll state.
///
/// ## Access control model
///
/// - `initialize(admin)` must be called once after deployment to set the
///   contract **admin** (the Invoisio backend / merchant service account).
/// - The admin address is stored in instance storage and is read via
///   [`admin`]; a missing admin means the contract is **not initialised**.
/// - **Write methods**:
///   - [`record_payment`] requires the current admin to authorise the call
///     using `require_auth()`.
///   - [`set_admin`] requires **both** the current admin and the new admin to
///     authorise, ensuring the new admin explicitly consents to taking over.
/// - **Read methods** (`get_payment`, `has_payment`, `payment_count`,
///   `contract_version`, `version_info`, `admin`) are permissionless, so any
///   account can inspect on-chain payment state.
///
/// ## Typical backend flow
/// 1. Deploy + call `initialize(admin)` once.
/// 2. Backend detects a native Stellar Payment on Horizon (matched by memo).
/// 3. Backend calls `record_payment(invoice_id, payer, asset_code, asset_issuer, amount)`.
/// 4. Contract stores record + emits event.
/// 5. Any observer calls `get_payment(invoice_id)` or streams `getEvents` to verify.
#[contract]
pub struct InvoicePaymentContract;

#[contractimpl]
impl InvoicePaymentContract {
    // Lifecycle

    /// Initialise the contract and register the `admin`.
    ///
    /// Must be called **once** right after deployment. The `admin` is the only
    /// account permitted to call [`record_payment`] and [`set_admin`].
    ///
    /// Returns [`ContractError::AlreadyInitialized`] if called a second time.
    pub fn initialize(env: Env, admin: Address) -> Result<(), ContractError> {
        if has_admin(&env) {
            return Err(ContractError::AlreadyInitialized);
        }
        set_admin(&env, &admin);
        // Persist explicit metadata so clients can reason about upgrades.
        set_contract_meta(&env, &current_contract_meta());
        // Initialise counter explicitly so `payment_count` is always readable.
        env.storage().instance().set(&DataKey::PaymentCount, &0u32);
        Ok(())
    }

    // Write

    /// Record a payment for `invoice_id` on-chain and emit a Soroban event.
    ///
    /// ## Authorization
    /// The **contract admin** must authorise this call. In the Invoisio flow
    /// the admin is the backend service account that has already verified the
    /// companion native Stellar Payment on Horizon before calling this method.
    ///
    /// ## Idempotency
    /// Each `invoice_id` may be recorded **only once**.
    /// Returns [`ContractError::PaymentAlreadyRecorded`] on duplicates.
    ///
    /// ## Emitted event
    /// | Field  | Value                                   |
    /// |--------|-----------------------------------------|
    /// | Topics | `(Symbol "invoice", Symbol "payment")`  |
    /// | Data   | [`InvoicePaymentRecordedEvent`] struct  |
    ///
    /// Subscribe via:
    /// ```sh
    /// stellar events --id <CONTRACT_ID> --type contract --start-ledger 1
    /// ```
    ///
    /// ## Parameters
    /// - `invoice_id`   — unique invoice identifier (e.g. `"invoisio-abc123"`)
    /// - `payer`        — Stellar account address that sent the payment
    /// - `asset_code`   — `"XLM"` or token code (e.g. `"USDC"`)
    /// - `asset_issuer` — issuer public key for tokens; `""` for native XLM
    /// - `amount`       — payment amount in smallest denomination (must be > 0)
    ///
    /// ## Errors
    /// - [`ContractError::NotInitialized`] — contract was never initialised
    /// - [`ContractError::InvalidInvoiceId`] — `invoice_id` is an empty string
    /// - [`ContractError::InvalidAsset`] — `asset_code` is empty, or a non-XLM asset has no `asset_issuer`
    /// - [`ContractError::InvalidAmount`] — `amount` ≤ 0
    /// - [`ContractError::PaymentAlreadyRecorded`] — `invoice_id` already on-chain
    pub fn record_payment(
        env: Env,
        invoice_id: String,
        payer: Address,
        asset_code: String,
        asset_issuer: String,
        amount: i128,
    ) -> Result<(), ContractError> {
        // 1. Admin authorisation.
        let admin = get_admin(&env)?;
        admin.require_auth();
        // Backfill/update version metadata for in-place code upgrades.
        ensure_current_contract_meta(&env);

        // 2. Input guards — reject obviously malformed arguments early so they
        //    never reach persistent storage.

        // invoice_id must be non-empty.
        if invoice_id.len() == 0 {
            return Err(ContractError::InvalidInvoiceId);
        }

        // asset_code must be non-empty.
        if asset_code.len() == 0 {
            return Err(ContractError::InvalidAsset);
        }

        // Asset validation:
        // - XLM (native) must have an empty issuer
        // - Non-XLM assets (tokens) must have a non-empty issuer
        let is_xlm = asset_code == String::from_str(&env, "XLM");
        let issuer_empty = asset_issuer.len() == 0;

        if is_xlm && !issuer_empty {
            // XLM with issuer is invalid
            return Err(ContractError::InvalidAsset);
        }
        if !is_xlm && issuer_empty {
            // Token without issuer is invalid
            return Err(ContractError::InvalidAsset);
        }

        // 3. Amount guard.
        if amount <= 0 {
            return Err(ContractError::InvalidAmount);
        }

        // 4. Idempotency guard.
        if has_payment(&env, &invoice_id) {
            return Err(ContractError::PaymentAlreadyRecorded);
        }

        // 5. Build the asset enum based on parameters.
        let asset = if is_xlm {
            Asset::Native
        } else {
            Asset::Token(asset_code.clone(), asset_issuer.clone())
        };

        // 6. Build and persist the record (also bumps persistent TTL).
        let record = PaymentRecord {
            invoice_id,
            payer,
            asset,
            amount,
            timestamp: env.ledger().timestamp(),
        };
        set_payment(&env, &record);

        // 7. Increment running counter (also bumps instance TTL).
        bump_count(&env);

        // 8. Emit Soroban event — off-chain indexers subscribe to these topics.
        emit_payment_recorded(
            &env,
            record.invoice_id,
            record.payer,
            asset_code,
            asset_issuer,
            record.amount,
        );

        Ok(())
    }

    // Read

    /// Return the [`PaymentRecord`] for `invoice_id`.
    ///
    /// Returns [`ContractError::PaymentNotFound`] if nothing has been recorded.
    /// Use [`has_payment`] first if existence is uncertain.
    pub fn get_payment(env: Env, invoice_id: String) -> Result<PaymentRecord, ContractError> {
        get_payment(&env, &invoice_id)
    }

    /// Return `true` if a payment has been recorded for `invoice_id`.
    pub fn has_payment(env: Env, invoice_id: String) -> bool {
        has_payment(&env, &invoice_id)
    }

    /// Return the total number of payments recorded in this contract instance.
    pub fn payment_count(env: Env) -> u32 {
        get_count(&env)
    }

    /// Return the current **code** version as packed semver
    /// (`MAJOR * 1_000_000 + MINOR * 1_000 + PATCH`).
    pub fn contract_version(_env: Env) -> u32 {
        CONTRACT_VERSION
    }

    /// Return the currently detected on-chain state metadata.
    ///
    /// Legacy deployments created before explicit metadata support return `0`
    /// for both fields until a write-path call backfills metadata.
    pub fn version_info(env: Env) -> ContractMeta {
        ContractMeta {
            contract_version: get_state_contract_version(&env),
            storage_schema_version: get_storage_schema_version(&env),
        }
    }

    // Admin

    /// Return the current admin address.
    ///
    /// Returns [`ContractError::NotInitialized`] if the contract has not been
    /// initialised yet.
    pub fn admin(env: Env) -> Result<Address, ContractError> {
        get_admin(&env)
    }

    /// Transfer admin rights to `new_admin`.
    ///
    /// The **current admin** must authorise this call.
    ///
    /// Returns [`ContractError::NotInitialized`] if the contract has not been
    /// initialised yet.
    pub fn set_admin(env: Env, new_admin: Address) -> Result<(), ContractError> {
        let current = get_admin(&env)?;
        // Both the current admin (authorising the transfer out) AND the new
        // admin (consenting to receive the role) must sign this transaction.
        // This prevents accidentally transferring to an address that can never
        // produce a valid signature.
        current.require_auth();
        new_admin.require_auth();
        // Backfill/update version metadata for in-place code upgrades.
        ensure_current_contract_meta(&env);
        set_admin(&env, &new_admin);
        Ok(())
    }
}

mod test;
