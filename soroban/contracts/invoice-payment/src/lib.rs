#![no_std]
extern crate alloc;
use soroban_sdk::{contract, contractimpl, Address, BytesN, Env, String, Vec};

pub mod errors;
pub mod events;
pub mod migration;
pub mod storage;

// Re-export the main types so `use super::*` in test.rs picks them up.
pub use errors::ContractError;
pub use storage::{
    AllowlistEntry, AllowlistMode, AllowlistPage, Asset, ContractConfig, ContractMeta, DataKey,
    PaymentHistoryPage, PaymentRecord, SettlementRefEntry, SettlementRefPage, CONTRACT_VERSION,
    CONTRACT_VERSION_MAJOR, CONTRACT_VERSION_MINOR, CONTRACT_VERSION_PATCH, STORAGE_SCHEMA_VERSION,
};

use events::{
    emit_admin_transfer_accepted, emit_admin_transfer_cancelled, emit_admin_transfer_proposed,
    emit_asset_allowlisted, emit_asset_revoked, emit_contract_upgraded, emit_native_allow_changed,
    emit_payment_recorded,
};
use storage::{
    append_payment_history, append_payment_log, bump_count, bump_history_count,
    clear_pending_admin, current_contract_meta, ensure_current_contract_meta, get_admin,
    get_asset_decimals, get_contract_config, get_count, get_payment, get_payment_history_page,
    get_pending_admin, get_pending_admin_opt, get_state_contract_version,
    get_storage_schema_version, has_admin, has_payment, has_pending_admin, is_asset_allowed,
    is_native_allowed, revoke_asset, set_admin, set_contract_meta, set_native_allowed, set_payment,
    set_pending_admin,
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
///   event. As of issue #512 this carries only `schema_version` and
///   `invoice_id` — it signals *that* a payment was recorded, not its
///   contents. An observer who wants the full record must already know the
///   `invoice_id` and call [`get_payment`] for it; the event alone no
///   longer gives away payer, asset, amount, or settlement reference.
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
///   - [`propose_admin`] (current admin) + [`accept_admin`] (proposed admin)
///     implement an explicit two-step handoff flow: the current admin proposes
///     a successor and the proposed address must later accept before the role
///     actually transfers. This replaces the old single-step `set_admin`,
///     ensuring no admin change can happen without both parties acting.
/// - **Read methods** split into two groups (issue #512 — see "Disclosure
///   guarantee / threat model" below for the reasoning):
///   - **Permissionless reads** — usable by anyone who already knows the
///     specific identifier they're asking about (an `invoice_id` or a
///     `settlement_ref`), or who is inspecting non-payment contract/config
///     state. None of them can be used to *discover* an identifier the
///     caller doesn't already have.
///   - **Admin-gated bulk/volume reads** — enumerate or summarize payment
///     activity across the whole contract, so only the admin (Invoisio's own
///     ops/reconciliation tooling) may call them. Gated exactly like
///     [`rebuild_history_index`]: `admin.require_auth()` plus
///     `admin == get_admin(&env)?`, returning [`ContractError::NotInitialized`]
///     if uninitialised and [`ContractError::Unauthorized`] if `admin` isn't
///     the current admin.
///
///   Every read below is also a pure read: none writes, duplicates, or
///   deletes record data — only the current admin can do that, via
///   `record_payment` or the maintenance methods (issue #508 removed the one
///   exception, `get_payment`'s old legacy-key copy-on-read; see its doc
///   comment and `storage::get_payment`).
///
///   | Method                        | Access         | Extends TTL on a hit? | Notes                                                              |
///   |--------------------------------|----------------|:---:|---------------------------------------------------------------------------------|
///   | `get_payment`                  | permissionless | yes | Falls back to the legacy key for a not-yet-migrated record; never writes it     |
///   | `has_payment`                  | permissionless | yes | Existence check only (`.has()`), same v1-then-legacy fallback                   |
///   | `payment_count`                | **admin-gated**| yes | Instance counter read — total payment volume                                   |
///   | `payment_history`              | **admin-gated**| yes | Per history-index slot returned — bulk enumeration                             |
///   | `settlement_ref_owner`         | permissionless | yes | Only on a used reference; requires already possessing the plaintext ref        |
///   | `settlement_ref_history`       | **admin-gated**| yes | Per settlement-reference log slot returned — bulk enumeration                  |
///   | `settlement_ref_index_status`  | **admin-gated**| yes | Two instance counters, O(1) — volume summary                                   |
///   | `allowed_assets`               | permissionless | yes | Per allowlist-log slot returned — config, not payment data                     |
///   | `allowlist_count`              | permissionless | yes | Instance counter read — config, not payment data                               |
///   | `contract_version`             | permissionless | no  | Compiled-in constant; no storage access at all                                 |
///   | `version_info`                 | permissionless | yes | Instance `ContractMeta` read                                                   |
///   | `admin`                        | permissionless | yes | Instance read                                                                  |
///   | `pending_admin`                | permissionless | yes | Instance read                                                                  |
///   | `config`                       | permissionless | yes | Aggregates several of the instance reads above                                 |
///   | `is_paused`                    | permissionless | yes | Instance read                                                                  |
///   | `history_index_status`        | **admin-gated**| yes | Two instance counters, O(1) — volume summary                                   |
///
///   "Extends TTL on a hit" means the call touches a read-write **footprint**
///   (Soroban tracks TTL on the entry's own key) but never changes the
///   entry's *value* — it is not a data write, and `simulateTransaction`
///   (the RPC read path, `invoke-*.sh`, etc.) computes this automatically,
///   so these methods remain usable as pure simulated reads. See the "TTL
///   bumps vs. data writes" note on `storage.rs`'s TTL Policy header for the
///   full reasoning.
///
/// ## Disclosure guarantee / threat model (issue #512)
///
/// **An unauthenticated third party CAN learn:** whether a *specific*
/// `invoice_id` they already know about has been paid, and its full record
/// (`get_payment`); whether a *specific* `settlement_ref` they already
/// possess maps to an invoice (`settlement_ref_owner`); the current
/// allowlist/config/pause state (`config`, `allowed_assets`, `is_paused`,
/// etc. — unrelated to payment privacy).
///
/// **An unauthenticated third party CANNOT learn:** the full set of
/// invoices/payments on the platform; a specific payer's payment history
/// (`payments_by_payer` was removed entirely — it served no documented
/// product need and was the sharpest disclosure); aggregate payment
/// volume/counts; the timing or ordering of payments they don't already know
/// about; or the plaintext settlement reference / Horizon transaction hash
/// from on-chain data alone (`settlement_ref` is now a SHA-256 commitment —
/// see [`storage::commit_settlement_ref`]).
///
/// **The contract admin (the Invoisio backend) can still:** fully enumerate
/// and audit payment activity via the admin-gated methods above, for
/// legitimate ops/reconciliation — pause does not block them (see
/// [`set_paused`]'s doc comment).
///
/// This does not, by itself, fix `invoice_id` enumerability — that is
/// tracked separately as issue #498 — but the reduced read surface removes
/// the *additional* correlation power an enumerable `invoice_id` would
/// otherwise grant an observer (they can no longer pair it with a bulk
/// payer/volume view or a full-detail public event stream).
///
/// ## Permanence for existing deployments
///
/// This code change only affects **future** calls on an upgraded
/// deployment. It cannot un-publish data already written or already
/// emitted: plaintext `settlement_ref` values stored before this upgrade,
/// the full public event history (payer/asset/amount included) already
/// emitted before this upgrade, and anything already readable via the
/// now-removed/gated methods before an operator locked them down are
/// **permanently public** — Horizon/RPC history and any observer's already-
/// collected data cannot be retracted. Migrating those legacy records (see
/// `migration::migrate_schema_v2_to_v3` / `migration::migrate_settlement_refs`)
/// hashes them into the new commitment-keyed index for consistent lookups
/// going forward; it does **not** rewrite or scrub the original plaintext
/// still sitting under `PaymentRecord.settlement_ref` on old records. Treat
/// any deployment that processed real payments before this fix as having
/// its full payment history, payer identities, and settlement references
/// already exposed — this fix protects only payments recorded going forward
/// on a deployment upgraded per `soroban/docs/upgrade-runbook.md`.
///
/// ## Typical backend flow
/// 1. Deploy + call `initialize(admin)` once.
/// 2. Backend detects a native Stellar Payment on Horizon (matched by memo).
/// 3. Backend calls `record_payment(invoice_id, payer, asset_code, asset_issuer, amount)`.
/// 4. Contract stores record + emits an event carrying only `invoice_id`.
/// 5. A party who already knows `invoice_id` calls `get_payment(invoice_id)`
///    to verify it. The Invoisio backend (admin) can additionally call
///    `payment_history(admin, cursor, limit)` or stream `getEvents` +
///    `get_payment` per ID for full reconciliation.
#[contract]
pub struct InvoicePaymentContract;

#[contractimpl]
impl InvoicePaymentContract {
    // Lifecycle
    /// Initialise the contract and register the `admin`.
    ///
    /// Must be called **once** right after deployment. The `admin` is the only
    /// account permitted to call [`record_payment`], [`propose_admin`] and the
    /// other admin-gated write methods.
    ///
    /// Returns [`ContractError::AlreadyInitialized`] if called a second time.
    pub fn initialize(env: Env, admin: Address) -> Result<(), ContractError> {
        if has_admin(&env) {
            return Err(ContractError::AlreadyInitialized);
        }
        set_admin(&env, &admin);
        // Persist explicit metadata so clients can reason about upgrades.
        set_contract_meta(&env, &current_contract_meta());
        // Initialise counters explicitly so read methods are always readable.
        env.storage().instance().set(&DataKey::PaymentCount, &0u32);
        env.storage()
            .instance()
            .set(&DataKey::PaymentHistoryCount, &0u32);
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
    /// ## Canonicalisation
    /// `invoice_id` and `settlement_ref` back this idempotency guard and the
    /// settlement-reference uniqueness guard respectively, and both guards
    /// compare stored values byte-exactly. To keep case or whitespace
    /// variants of the same identifier from slipping past those guards, both
    /// fields must already be in **canonical form** — ASCII lowercase
    /// letters, digits, and hyphens only, no uppercase and no whitespace
    /// (leading, trailing, or embedded). Non-canonical input is **rejected**,
    /// not normalised: the stored key always matches exactly what the caller
    /// supplied. See [`storage::is_canonical_identifier`] for the exact rule.
    /// This validation applies only to new writes — payment records already
    /// on chain from before this guard existed remain readable as-is and are
    /// never re-validated or rewritten by an upgrade.
    ///
    /// ## Diagnosing `SettlementRefAlreadyUsed`
    /// A rejected `settlement_ref` is ambiguous on its own: it could be a
    /// benign retry of an anchoring attempt that already succeeded, or a
    /// genuine reconciliation conflict where a *different* invoice already
    /// claimed the same reference. Contract errors carry no payload, so
    /// resolving this requires a follow-up read: call
    /// [`InvoicePaymentContract::settlement_ref_owner`] with the same
    /// `settlement_ref` and compare the returned invoice_id to the one just
    /// attempted — equal means benign retry, different means a real conflict
    /// (issue #495).
    ///
    /// ## Emitted event
    /// | Field  | Value                                   |
    /// |--------|-----------------------------------------|
    /// | Topics | `(Symbol "invoice", Symbol "payment")`  |
    /// | Data   | `{ schema_version, invoice_id }` only   |
    ///
    /// As of issue #512 the event carries only `schema_version` and
    /// `invoice_id` — no payer, asset, amount, or settlement reference. This
    /// signals *that* a payment was recorded, not its contents, so a
    /// permissionless public event stream can no longer be used to bulk-
    /// browse the payment ledger. A consumer that needs the full record must
    /// already know `invoice_id` and call [`Self::get_payment`].
    ///
    /// Subscribe via:
    /// ```sh
    /// stellar events --id <CONTRACT_ID> --type contract --start-ledger 1
    /// ```
    ///
    /// ## Parameters
    /// - `invoice_id`      — unique invoice identifier (e.g. `"invoisio-abc123"`);
    ///                       must be non-empty, max [`storage::MAX_INVOICE_ID_LEN`]
    ///                       chars, and in canonical form (see above)
    /// - `payer`           — Stellar account address that sent the payment
    /// - `asset_code`      — `"XLM"` or token code (e.g. `"USDC"`)
    /// - `asset_issuer`    — issuer public key for tokens; `""` for native XLM
    /// - `amount`          — payment amount in the asset's smallest denomination
    ///                       (must be > 0 and fit in `i128`). The stored
    ///                       record carries `asset_decimals` for formatting.
    /// - `settlement_ref`  — normalised settlement hash or reference ID for
    ///                       backend deduplication and idempotent reconciliation
    ///                       (must be non-empty, max [`storage::MAX_SETTLEMENT_REF_LEN`]
    ///                       chars, and in canonical form — see above). This
    ///                       plaintext value is validated exactly as documented,
    ///                       but what actually gets stored/returned/emitted from
    ///                       here on is its SHA-256 **commitment**, not the
    ///                       plaintext itself — see
    ///                       [`storage::commit_settlement_ref`] and
    ///                       `PaymentRecord::settlement_ref`.
    ///
    /// ## Errors
    /// - [`ContractError::NotInitialized`] — contract was never initialised
    /// - [`ContractError::ContractPaused`] — contract is paused; payment log is frozen
    /// - [`ContractError::InvalidInvoiceId`] — `invoice_id` is empty, exceeds
    ///   [`storage::MAX_INVOICE_ID_LEN`] chars, or is not in canonical form
    /// - [`ContractError::InvalidSettlementRef`] — `settlement_ref` is empty,
    ///   exceeds [`storage::MAX_SETTLEMENT_REF_LEN`] chars, or is not in
    ///   canonical form
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
        settlement_ref: String,
    ) -> Result<(), ContractError> {
        // 1. Check if contract is paused (emergency stop)
        if storage::is_paused(&env) {
            return Err(ContractError::ContractPaused);
        }

        // 2. Admin authorisation.
        let admin = get_admin(&env)?;
        admin.require_auth();

        // Backfill/update version metadata for in-place code upgrades.
        ensure_current_contract_meta(&env);

        // 3. Input guards — reject obviously malformed arguments early so they
        //    never reach persistent storage.

        // invoice_id must be non-empty.
        if invoice_id.is_empty() {
            return Err(ContractError::InvalidInvoiceId);
        }

        // invoice_id length guard — reject unreasonably long identifiers so
        // an oversized invoice_id can't inflate ledger rent (it is duplicated
        // across PaymentV1, PaymentLog, and every PaymentHistory slot). See
        // `storage::MAX_INVOICE_ID_LEN` for the rationale.
        if invoice_id.len() > storage::MAX_INVOICE_ID_LEN {
            return Err(ContractError::InvalidInvoiceId);
        }

        // invoice_id canonical-form guard — `has_payment` compares invoice_id
        // byte-exactly, so case and whitespace variants of the same ID must
        // be rejected rather than silently treated as distinct invoices. See
        // `storage::is_canonical_identifier` for the exact rule.
        if !storage::is_canonical_identifier(&invoice_id) {
            return Err(ContractError::InvalidInvoiceId);
        }

        // settlement_ref must be non-empty.
        if settlement_ref.is_empty() {
            return Err(ContractError::InvalidSettlementRef);
        }

        // settlement_ref length guard — reject unreasonably long references
        // (e.g. a full transaction blob pasted by mistake).
        // A SHA-256 hex string is 64 chars; this allows some headroom.
        if settlement_ref.len() > storage::MAX_SETTLEMENT_REF_LEN {
            return Err(ContractError::InvalidSettlementRef);
        }

        // settlement_ref canonical-form guard — enforces the "normalised"
        // claim in its documentation and closes the same byte-exact-
        // comparison gap as the invoice_id guard above, this time against
        // `is_settlement_ref_used`. See `storage::is_canonical_identifier`.
        if !storage::is_canonical_identifier(&settlement_ref) {
            return Err(ContractError::InvalidSettlementRef);
        }

        // asset_code must be non-empty.
        if asset_code.is_empty() {
            return Err(ContractError::InvalidAsset);
        }

        // Stellar asset code max length is 12 characters.
        if asset_code.len() > 12 {
            return Err(ContractError::InvalidAsset);
        }

        // Asset validation:
        // - XLM (native) must have an empty issuer
        // - Non-XLM assets (tokens) must have a non-empty issuer
        let is_xlm = asset_code == String::from_str(&env, "XLM");
        let issuer_empty = asset_issuer.is_empty();

        if is_xlm && !issuer_empty {
            // XLM with issuer is invalid
            return Err(ContractError::InvalidAsset);
        }
        if !is_xlm && issuer_empty {
            // Token without issuer is invalid
            return Err(ContractError::InvalidAsset);
        }

        // Enforce allowlist:
        // - If asset is native: require allow_native == true.
        // - If asset is token: (code, issuer) must exist in allowlist.
        if is_xlm {
            if !is_native_allowed(&env) {
                return Err(ContractError::AssetNotAllowed);
            }
        } else if !is_asset_allowed(&env, &asset_code, &asset_issuer) {
            return Err(ContractError::AssetNotAllowed);
        }

        // 4. Amount guard: use the full positive range of the i128 storage type.
        if amount <= 0 {
            return Err(ContractError::InvalidAmount);
        }

        let asset_decimals = if is_xlm {
            7
        } else {
            get_asset_decimals(&env, &asset_code, &asset_issuer)
                .ok_or(ContractError::AssetNotAllowed)?
        };

        // 5. Idempotency guard: check invoice_id uniqueness.
        if has_payment(&env, &invoice_id) {
            return Err(ContractError::PaymentAlreadyRecorded);
        }

        // 6. Settlement reference uniqueness guard.
        //    The same settlement_ref cannot be used for multiple invoices.
        //    A caller that hits this can call `settlement_ref_owner` to find
        //    out whether it's a benign retry (owner == this invoice_id) or a
        //    genuine conflict (owner is a different invoice) — see the
        //    "Diagnosing SettlementRefAlreadyUsed" section above.
        if storage::is_settlement_ref_used(&env, &settlement_ref) {
            return Err(ContractError::SettlementRefAlreadyUsed);
        }

        // 7. Build the asset enum based on parameters.
        let asset = if is_xlm {
            Asset::Native
        } else {
            Asset::Token(asset_code.clone(), asset_issuer.clone())
        };

        // 8. Compute the settlement-ref commitment — this, not the plaintext,
        //    is what's stored/returned/emitted from here on (issue #512). See
        //    `storage::commit_settlement_ref` and `PaymentRecord::settlement_ref`.
        let settlement_ref_commitment = storage::commit_settlement_ref(&env, &settlement_ref);

        // 9. Build and persist the record (also bumps persistent TTL).
        let record = PaymentRecord {
            invoice_id: invoice_id.clone(),
            payer,
            asset,
            amount,
            asset_decimals,
            timestamp: env.ledger().timestamp(),
            settlement_ref: settlement_ref_commitment,
        };
        set_payment(&env, &record);

        // Track the invoice ID in write order so migrations can enumerate
        // every payment even if the history index is later corrupted.
        append_payment_log(&env, &record.invoice_id);

        // 10. Record the settlement reference as used (global uniqueness) and
        //     resolvable back to this invoice via `settlement_ref_owner`.
        //     Hashes the plaintext internally to the same commitment used
        //     above, so the two stay consistent.
        storage::record_settlement_ref(&env, &settlement_ref, &record.invoice_id);

        // 11. Increment running counter (also bumps instance TTL).
        bump_count(&env);

        // 12. Append to deterministic history index for paged reads.
        append_payment_history(&env, &record);
        bump_history_count(&env);

        // 13. Emit Soroban event. Minimal by design (issue #512): only
        //     schema_version + invoice_id, so the public event stream can't
        //     be used to bulk-browse payer/asset/amount/asset_decimals/
        //     settlement data — an observer must already know invoice_id and
        //     call `get_payment` for the rest.
        emit_payment_recorded(&env, record.invoice_id);

        Ok(())
    }

    // Read
    /// Return the [`PaymentRecord`] for `invoice_id`.
    ///
    /// Returns [`ContractError::InvalidInvoiceId`] if `invoice_id` is empty.
    /// Returns [`ContractError::PaymentNotFound`] if nothing has been recorded.
    /// Use [`has_payment`] first if existence is uncertain.
    ///
    /// ## Legacy records
    /// A record predating schema V1 is still found via a fallback to its
    /// legacy storage key, and is returned identically either way — but this
    /// call never migrates it (no data write happens here at all; see
    /// `storage::get_payment`'s doc comment). It stays under the legacy key
    /// until an admin calls `migrate_legacy_payments` for it.
    ///
    /// Permissionless read — no auth required. Extends persistent TTL on the
    /// key that holds the record (a footprint touch, not a data write — see
    /// the "Access control model" doc above).
    pub fn get_payment(env: Env, invoice_id: String) -> Result<PaymentRecord, ContractError> {
        if invoice_id.is_empty() {
            return Err(ContractError::InvalidInvoiceId);
        }
        get_payment(&env, &invoice_id)
    }

    /// Return `true` if a payment has been recorded for `invoice_id`.
    ///
    /// Returns `false` if `invoice_id` is empty (invalid input) or if no record exists.
    pub fn has_payment(env: Env, invoice_id: String) -> bool {
        if invoice_id.is_empty() {
            return false;
        }
        has_payment(&env, &invoice_id)
    }

    /// Return the total number of payments recorded in this contract instance.
    ///
    /// ## Authorization
    /// **Admin-gated** (issue #512): a raw payment-volume counter is bulk
    /// platform-activity data, not something tied to a specific identifier a
    /// caller already knows, so only the admin may read it — mirrors
    /// [`rebuild_history_index`]'s auth pattern exactly. Available while
    /// paused; auditing must never be blocked by the emergency stop.
    ///
    /// ## Errors
    /// - [`ContractError::NotInitialized`] — contract was never initialised
    /// - [`ContractError::Unauthorized`] — `admin` is not the current admin
    pub fn payment_count(env: Env, admin: Address) -> Result<u32, ContractError> {
        let current_admin = get_admin(&env)?;
        if admin != current_admin {
            return Err(ContractError::Unauthorized);
        }
        admin.require_auth();
        Ok(get_count(&env))
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

    /// Return the current admin address.
    ///
    /// Returns [`ContractError::NotInitialized`] if the contract has not been
    /// initialised yet.
    pub fn admin(env: Env) -> Result<Address, ContractError> {
        get_admin(&env)
    }

    /// Return the address currently proposed as the next admin, if any.
    ///
    /// Permissionless read. Returns `None` when no [`propose_admin`] transfer
    /// is in flight (either none was ever made or it was accepted/cleared).
    pub fn pending_admin(env: Env) -> Option<Address> {
        get_pending_admin_opt(&env)
    }

    /// Propose `new_admin` as the next contract admin (step 1 of the two-step
    /// handoff).
    ///
    /// Only the **current admin** may authorise this call. The proposal is
    /// staged in instance storage but does **not** take effect until the
    /// proposed address calls [`accept_admin`].
    ///
    /// ## Pause interaction
    /// Rejected with [`ContractError::ContractPaused`] when the contract is
    /// paused. The admin-transfer control plane is frozen during an incident
    /// containment window so a compromised admin key cannot rotate the role
    /// out from under the operator.
    ///
    /// ## Errors
    /// - [`ContractError::NotInitialized`] — contract was never initialised
    /// - [`ContractError::ContractPaused`] — contract is paused, control-plane writes are frozen
    /// - [`ContractError::PendingAdminExists`] — a transfer is already pending
    /// - [`ContractError::InvalidProposedAdmin`] — `new_admin` equals the
    ///   current admin
    ///
    /// ## Events
    /// Emits `AdminTransferProposed` on success.
    pub fn propose_admin(env: Env, new_admin: Address) -> Result<(), ContractError> {
        if storage::is_paused(&env) {
            return Err(ContractError::ContractPaused);
        }
        let current = get_admin(&env)?;
        current.require_auth();
        if has_pending_admin(&env) {
            return Err(ContractError::PendingAdminExists);
        }
        if new_admin == current {
            return Err(ContractError::InvalidProposedAdmin);
        }
        // Backfill/update version metadata for in-place code upgrades.
        ensure_current_contract_meta(&env);
        set_pending_admin(&env, &new_admin);
        emit_admin_transfer_proposed(&env, current, new_admin);
        Ok(())
    }

    /// Accept a pending admin transfer and become the contract admin (step 2
    /// of the two-step handoff).
    ///
    /// `caller` must be the address that was proposed by [`propose_admin`] and
    /// must authorise the call. On success the role is transferred and the
    /// pending proposal is cleared.
    ///
    /// ## Pause interaction
    /// Rejected with [`ContractError::ContractPaused`] when the contract is
    /// paused. Even if a proposal was staged before the pause, the role
    /// cannot change hands during incident containment — the operator has
    /// time to investigate and cancel the proposal via [`cancel_admin_transfer`]
    /// after unpausing.
    ///
    /// ## Errors
    /// - [`ContractError::NotInitialized`] — contract was never initialised
    /// - [`ContractError::ContractPaused`] — contract is paused, control-plane writes are frozen
    /// - [`ContractError::NoPendingAdmin`] — no proposal is pending
    /// - [`ContractError::Unauthorized`] — `caller` is not the proposed admin
    ///
    /// ## Events
    /// Emits `AdminTransferAccepted` on success.
    pub fn accept_admin(env: Env, caller: Address) -> Result<(), ContractError> {
        if storage::is_paused(&env) {
            return Err(ContractError::ContractPaused);
        }
        // Ensure the contract is initialised first (mirrors the other admin
        // methods) so misuse before setup returns NotInitialized, not a
        // misleading NoPendingAdmin.
        let previous = get_admin(&env)?;
        let pending = get_pending_admin(&env)?;
        caller.require_auth();
        if caller != pending {
            return Err(ContractError::Unauthorized);
        }
        // Backfill/update version metadata for in-place code upgrades.
        ensure_current_contract_meta(&env);
        set_admin(&env, &pending);
        clear_pending_admin(&env);
        emit_admin_transfer_accepted(&env, previous, pending);
        Ok(())
    }

    /// Cancel a pending admin transfer proposal (recovery path for the
    /// two-step handoff).
    ///
    /// The **current admin** must authorise this call. On success the pending
    /// proposal is cleared, `pending_admin()` reads `None` again, the proposed
    /// address can no longer claim the role via [`accept_admin`], and a new
    /// proposal to a different address no longer fails with
    /// [`ContractError::PendingAdminExists`].
    ///
    /// Overwriting a pending proposal directly from [`propose_admin`] is
    /// deliberately not supported: cancellation must always be explicit so a
    /// mistyped address cannot silently become an immediate irreversible
    /// transfer.
    ///
    /// ## Pause interaction
    /// Rejected with [`ContractError::ContractPaused`] when the contract is
    /// paused. The entire control plane — including cancellation of a
    /// previously-staged transfer — is frozen during containment so the
    /// operator can reason about a stable state before unpausing. Once
    /// unpaused, the current admin can cancel (and then re-propose to a safe
    /// address) as usual.
    ///
    /// ## Errors
    /// - [`ContractError::NotInitialized`] — contract was never initialised
    /// - [`ContractError::ContractPaused`] — contract is paused, control-plane writes are frozen
    /// - [`ContractError::NoPendingAdmin`] — no proposal is pending
    pub fn cancel_admin_transfer(env: Env) -> Result<(), ContractError> {
        if storage::is_paused(&env) {
            return Err(ContractError::ContractPaused);
        }
        let current = get_admin(&env)?;
        current.require_auth();

        let pending = get_pending_admin(&env)?;

        // Backfill/update version metadata for in-place code upgrades.
        ensure_current_contract_meta(&env);
        clear_pending_admin(&env);
        emit_admin_transfer_cancelled(&env, current, pending);
        Ok(())
    }

    /// Add a `(code, issuer)` token pair to the allowlist using the legacy
    /// Stellar seven-decimal scale. Use `allow_asset_with_decimals` for other
    /// token precisions.
    ///
    /// The **contract admin** must authorise this call.
    ///
    /// `code` is held to the same rule `record_payment` enforces for
    /// `asset_code`: non-empty and at most 12 characters (Stellar's asset
    /// code length limit). Without this check, a pair that violates the
    /// stricter rule could be allowlisted successfully and then permanently
    /// fail every payment attempt with `InvalidAsset`, with no way to see
    /// the bad entry sitting in the list (issue #464).
    ///
    /// ## Pause interaction
    /// Rejected with [`ContractError::ContractPaused`] when the contract is
    /// paused. The asset allowlist is part of the contract's control plane
    /// and must remain stable during incident containment — a paused contract
    /// cannot silently change which assets are acceptable, and a suspect
    /// admin key cannot pre-stage new allowlist entries for later use.
    pub fn allow_asset(env: Env, code: String, issuer: String) -> Result<(), ContractError> {
        Self::allow_asset_with_decimals(env, code, issuer, 7)
    }

    /// Add a token and record its decimal precision. The admin must verify
    /// this value against the token contract's `decimals()` before calling.
    pub fn allow_asset_with_decimals(
        env: Env,
        code: String,
        issuer: String,
        decimals: u32,
    ) -> Result<(), ContractError> {
        if storage::is_paused(&env) {
            return Err(ContractError::ContractPaused);
        }
        let admin = get_admin(&env)?;
        admin.require_auth();
        if code.is_empty() || issuer.is_empty() {
            return Err(ContractError::InvalidAsset);
        }
        // Stellar asset code max length is 12 characters — mirrors
        // record_payment's asset_code validation exactly.
        if code.len() > 12 {
            return Err(ContractError::InvalidAsset);
        }
        if decimals > 18 {
            return Err(ContractError::InvalidAsset);
        }
        storage::allow_asset_with_decimals(&env, &code, &issuer, decimals);
        emit_asset_allowlisted(&env, code, issuer);
        Ok(())
    }

    /// Remove a `(code, issuer)` token pair from the allowlist.
    ///
    /// The **contract admin** must authorise this call. Revoking a pair that
    /// was never allowlisted is a safe no-op (`Ok(())`, no panic) — but
    /// unlike a real revoke, it does **not** emit [`AssetRevoked`], so
    /// off-chain observers can distinguish "an entry was actually removed"
    /// from "nothing changed" (issue #464).
    ///
    /// ## Pause interaction
    /// Rejected with [`ContractError::ContractPaused`] when the contract is
    /// paused. Revoking an asset is a control-plane change that must not
    /// happen during the incident-containment window; the operator needs a
    /// stable allowlist to reconcile against while paused.
    pub fn revoke_asset(env: Env, code: String, issuer: String) -> Result<(), ContractError> {
        if storage::is_paused(&env) {
            return Err(ContractError::ContractPaused);
        }
        let admin = get_admin(&env)?;
        admin.require_auth();
        if code.is_empty() || issuer.is_empty() {
            return Err(ContractError::InvalidAsset);
        }
        let removed = revoke_asset(&env, &code, &issuer);
        if removed {
            emit_asset_revoked(&env, code, issuer);
        }
        Ok(())
    }

    /// Return a paginated list of every currently-allowlisted `(code,
    /// issuer)` pair.
    ///
    /// - `cursor` — write-order slot to start from (pass `0` for the first
    ///   page).
    /// - `limit` — maximum entries to return (capped internally at 25).
    ///
    /// A revoked (or, on a legacy pre-schema-V4 deployment, not-yet-backfilled
    /// — see `migrate_schema_v3_to_v4`) slot is skipped rather than treated
    /// as the end of the list, so `next_cursor` always advances and a caller
    /// looping on `has_more` cannot get stuck. Use `allowlist_count()` to
    /// size paging or detect drift against the number of entries actually
    /// returned across a full scan.
    ///
    /// Permissionless read — no auth required.
    pub fn allowed_assets(env: Env, cursor: u32, limit: u32) -> AllowlistPage {
        storage::get_allowlist_page(&env, cursor, limit)
    }

    /// Return the number of currently-allowlisted `(code, issuer)` pairs.
    ///
    /// Decrements on `revoke_asset`, unlike a write-order log length — this
    /// always matches the number of entries `allowed_assets()` returns
    /// across a full scan, after any sequence of adds and revokes.
    ///
    /// Permissionless read — no auth required.
    pub fn allowlist_count(env: Env) -> u32 {
        storage::get_allowlist_count(&env)
    }

    /// Toggle whether native XLM payments are permitted.
    ///
    /// The **contract admin** must authorise this call.
    ///
    /// ## Pause interaction
    /// Rejected with [`ContractError::ContractPaused`] when the contract is
    /// paused. Flipping the native-asset policy would silently change which
    /// payments are accepted once the contract is unpaused, so it is blocked
    /// alongside the other allowlist mutators during containment.
    pub fn set_allow_native(env: Env, allowed: bool) -> Result<(), ContractError> {
        if storage::is_paused(&env) {
            return Err(ContractError::ContractPaused);
        }
        let admin = get_admin(&env)?;
        admin.require_auth();

        set_native_allowed(&env, allowed);
        emit_native_allow_changed(&env, allowed);
        Ok(())
    }

    // Config / Read-only views

    /// Return a high-level snapshot of contract state for ops tooling.
    ///
    /// Permissionless — any account can call this to inspect initialization
    /// status, admin address, version metadata, and allowlist policy.
    pub fn config(env: Env) -> ContractConfig {
        get_contract_config(&env)
    }

    /// Return a paginated slice of payment history.
    ///
    /// - `cursor` — zero-based index to start from (pass `0` for the first page).
    /// - `limit` — maximum records to return (capped internally at 25).
    ///
    /// A missing history-index slot (corrupted or partially-rebuilt index)
    /// is skipped, never treated as the end of the index: `next_cursor`
    /// always advances past a hole, so callers looping on `has_more` cannot
    /// get stuck repeating the same cursor. `PaymentHistoryPage.gaps_skipped`
    /// reports how many slots were skipped this way, so recovery tooling can
    /// detect corruption directly from a normal read.
    ///
    /// ## Authorization
    /// **Admin-gated** (issue #512): bulk enumeration of every payment on the
    /// platform is exactly the disclosure this contract's privacy guarantee
    /// exists to prevent for anyone but the admin — mirrors
    /// [`rebuild_history_index`]'s auth pattern exactly. Available while
    /// paused; auditing must never be blocked by the emergency stop.
    ///
    /// ## Errors
    /// - [`ContractError::NotInitialized`] — contract was never initialised
    /// - [`ContractError::Unauthorized`] — `admin` is not the current admin
    pub fn payment_history(
        env: Env,
        admin: Address,
        cursor: u32,
        limit: u32,
    ) -> Result<PaymentHistoryPage, ContractError> {
        let current_admin = get_admin(&env)?;
        if admin != current_admin {
            return Err(ContractError::Unauthorized);
        }
        admin.require_auth();
        Ok(get_payment_history_page(&env, cursor, limit))
    }

    /// Resolve a settlement reference to the invoice ID that consumed it.
    ///
    /// `settlement_ref` here is the **plaintext** reference — the caller
    /// must already possess it (e.g. the Horizon transaction hash it
    /// generated). It is hashed internally to the commitment actually used
    /// as the storage key (see [`storage::commit_settlement_ref`]); the
    /// plaintext is never stored or returned by this contract. This is
    /// exactly the "already know it, verify it" property the contract's
    /// privacy guarantee is built around (issue #512) — this method cannot
    /// be used to discover a settlement reference the caller doesn't already
    /// have.
    ///
    /// Returns `None` when the reference is unused — a plain, unambiguous
    /// "not found" result rather than an error indistinguishable from a
    /// failure, since an unused reference is a normal, expected outcome for
    /// this read (issue #495).
    ///
    /// ## Disambiguating a `SettlementRefAlreadyUsed` rejection
    /// This is how a caller finds out whether a `record_payment` rejection
    /// was a benign retry of an already-successful attempt for the *same*
    /// invoice, or a genuine reconciliation conflict from a *different*
    /// invoice: call this with the same `settlement_ref` and compare the
    /// returned invoice_id to the one just attempted. See "Diagnosing
    /// `SettlementRefAlreadyUsed`" on [`Self::record_payment`].
    ///
    /// Permissionless read — no auth required, available while paused.
    pub fn settlement_ref_owner(env: Env, settlement_ref: String) -> Option<String> {
        if settlement_ref.is_empty() {
            return None;
        }
        storage::get_settlement_ref_owner(&env, &settlement_ref)
    }

    /// Return a paginated slice of the settlement-reference index in write
    /// order, so operators can enumerate and audit every settlement
    /// reference ever recorded — closing the same write-only-storage gap
    /// already fixed for the asset allowlist (issue #464), this time for
    /// settlement references (issue #495).
    ///
    /// - `cursor` — zero-based write-order index to start from (`0` for the
    ///   first page).
    /// - `limit` — maximum entries to return (capped internally at
    ///   [`storage::MAX_SETTLEMENT_REF_PAGE_SIZE`]).
    ///
    /// A missing index slot is skipped, never treated as the end of the
    /// index: `next_cursor` always advances past a hole, exactly like
    /// [`Self::payment_history`]. `gaps_skipped` reports how many were
    /// skipped this page, so the enumeration always terminates (`has_more`
    /// eventually reads `false`) even over a partially-rebuilt index.
    ///
    /// Each returned entry's `settlement_ref` is a SHA-256 commitment, not
    /// the plaintext reference — see [`storage::commit_settlement_ref`].
    ///
    /// ## Authorization
    /// **Admin-gated** (issue #512): this enumerates every settlement
    /// reference ever recorded, which is bulk platform-activity data —
    /// mirrors [`rebuild_history_index`]'s auth pattern exactly. Available
    /// while paused; auditing must never be blocked by the emergency stop.
    ///
    /// ## Errors
    /// - [`ContractError::NotInitialized`] — contract was never initialised
    /// - [`ContractError::Unauthorized`] — `admin` is not the current admin
    pub fn settlement_ref_history(
        env: Env,
        admin: Address,
        cursor: u32,
        limit: u32,
    ) -> Result<storage::SettlementRefPage, ContractError> {
        let current_admin = get_admin(&env)?;
        if admin != current_admin {
            return Err(ContractError::Unauthorized);
        }
        admin.require_auth();
        Ok(storage::get_settlement_ref_page(&env, cursor, limit))
    }

    /// Return a quick consistency summary for the settlement-reference
    /// index: `(settlement_ref_count, payment_count, is_consistent)`.
    ///
    /// `is_consistent` is `true` only when every recorded payment has a
    /// corresponding settlement-reference mapping. It reads `false` when
    /// some payment's `settlement_ref` was never recorded — for example, an
    /// empty `settlement_ref` on legacy (pre-guard) data, or a duplicate
    /// reference that `migrate_settlement_refs` deliberately left unresolved
    /// rather than silently overwrite (see
    /// `migration::migrate_settlement_refs`). Use [`Self::settlement_ref_history`]
    /// together with [`Self::payment_history`] to find the affected payments.
    ///
    /// O(1) — like [`Self::history_index_status`], this only compares
    /// counters; it does not walk every payment. A caller needing a full,
    /// per-payment cross-check should page through `payment_history` and
    /// call `settlement_ref_owner` for each record.
    ///
    /// ## Authorization
    /// **Admin-gated** (issue #512): a raw settlement-reference volume
    /// summary is bulk platform-activity data — mirrors
    /// [`rebuild_history_index`]'s auth pattern exactly. Available while
    /// paused; auditing must never be blocked by the emergency stop.
    ///
    /// ## Errors
    /// - [`ContractError::NotInitialized`] — contract was never initialised
    /// - [`ContractError::Unauthorized`] — `admin` is not the current admin
    pub fn settlement_ref_index_status(
        env: Env,
        admin: Address,
    ) -> Result<(u32, u32, bool), ContractError> {
        let current_admin = get_admin(&env)?;
        if admin != current_admin {
            return Err(ContractError::Unauthorized);
        }
        admin.require_auth();
        let settlement_ref_count = storage::get_settlement_ref_count(&env);
        let payment_count = storage::get_payment_count(&env);
        Ok((
            settlement_ref_count,
            payment_count,
            settlement_ref_count == payment_count,
        ))
    }

    /// Upgrade the deployed contract WASM in place.
    ///
    /// This is the *only* way to change the code running at this contract
    /// address after deployment. Without it, [`upgrade_storage`] and the
    /// migration logic in `migration.rs` are unreachable, and a live
    /// deployment could never receive a bug fix without moving to a brand
    /// new contract ID and migrating every payment record and every backend
    /// reference off-chain.
    ///
    /// ## Authorization
    /// Only the **contract admin** may call this.
    ///
    /// ## Required ordering (enforced on-chain) — pause for the duration
    /// The contract **must already be paused** (`set_paused(true)`) before
    /// calling `upgrade`; otherwise this returns
    /// [`ContractError::MustBePausedForUpgrade`]. This is enforced, not just
    /// documented, because every write path (`record_payment`,
    /// `propose_admin`, ...) calls `ensure_current_contract_meta()`, which
    /// *unconditionally* backfills `ContractMeta` to match whatever code is
    /// currently running. If a write landed after `upgrade()` took effect
    /// but before [`upgrade_storage`] actually ran its migration steps, it
    /// would silently mark the new schema version as current *before* the
    /// migration ran — masking the exact corruption `upgrade_storage` exists
    /// to fix. Staying paused for the whole window closes that gap, and also
    /// means any `record_payment` transaction submitted around the same time
    /// as the upgrade ("in-flight") simply fails with
    /// [`ContractError::ContractPaused`] instead of racing the migration.
    ///
    /// Full runbook: `soroban/docs/upgrade-runbook.md`. Summary:
    /// 1. `set_paused(admin, true)`
    /// 2. `upgrade(admin, new_wasm_hash, new_contract_version)`
    /// 3. `upgrade_storage(admin)` — now runs under the **new** code
    /// 4. Verify `config()` / `version_info()` / `payment_history()` look right
    /// 5. `set_paused(admin, false)`
    ///
    /// ## Timing
    /// Soroban only swaps the executing code for **subsequent**
    /// invocations — this call itself finishes running the old code.
    /// `contract_version()` keeps reporting the old version if called again
    /// in the same transaction, and starts reporting the new version on the
    /// next top-level invocation (e.g. the following `upgrade_storage` call).
    ///
    /// ## `new_contract_version`
    /// A caller-supplied audit value (the packed semver of the WASM being
    /// deployed) carried in the emitted event. It is **not** verified
    /// against `new_wasm_hash` — the currently-running (old) code has no way
    /// to introspect constants baked into a not-yet-live binary — so it is
    /// the operator's responsibility to pass the value that actually matches
    /// the WASM being deployed (the ops script derives it from the build
    /// it's pushing, not from user input).
    ///
    /// ## Errors
    /// - [`ContractError::NotInitialized`] — contract was never initialised
    /// - [`ContractError::Unauthorized`] — caller is not admin
    /// - [`ContractError::MustBePausedForUpgrade`] — contract is not paused
    ///
    /// ## Events
    /// Emits `ContractUpgraded { previous_version, new_version, new_wasm_hash,
    /// upgraded_by, upgraded_at }` so off-chain indexers can detect the
    /// transition without polling `contract_version()`.
    pub fn upgrade(
        env: Env,
        admin: Address,
        new_wasm_hash: BytesN<32>,
        new_contract_version: u32,
    ) -> Result<(), ContractError> {
        // Verify caller is the current contract admin.
        let current_admin = get_admin(&env)?;
        if admin != current_admin {
            return Err(ContractError::Unauthorized);
        }
        admin.require_auth();

        // The contract must stay paused for the whole upgrade -> migrate
        // window — see the ordering rationale above.
        if !storage::is_paused(&env) {
            return Err(ContractError::MustBePausedForUpgrade);
        }

        let previous_version = CONTRACT_VERSION;
        env.deployer()
            .update_current_contract_wasm(new_wasm_hash.clone());

        emit_contract_upgraded(
            &env,
            previous_version,
            new_contract_version,
            new_wasm_hash,
            admin,
        );

        Ok(())
    }

    /// Migrate on-chain storage layout to the current schema version.
    ///
    /// Must be called by the admin after a WASM upgrade that introduces a new
    /// `STORAGE_SCHEMA_VERSION`. Safe to call multiple times — idempotent.
    ///
    /// ## Pause interaction
    /// **Exempt** from the pause guard. In the standard upgrade runbook the
    /// contract is paused before `upgrade()` and must remain paused through
    /// this call until the final unpause; blocking storage migration while
    /// paused would make the upgrade runbook impossible. Admin-gated.
    pub fn upgrade_storage(env: Env, admin: Address) -> Result<(), ContractError> {
        // Verify caller is the current contract admin.
        let current_admin = get_admin(&env)?;
        if admin != current_admin {
            return Err(ContractError::Unauthorized);
        }
        admin.require_auth();

        storage::upgrade_storage_schema(&env, STORAGE_SCHEMA_VERSION)
    }

    /// Pause or unpause the contract.
    ///
    /// Pause is an emergency-stop mechanism. When `set_paused(admin, true)`
    /// has been called, the contract enters a **containment window** in
    /// which the following state-mutating entrypoints are rejected with
    /// [`ContractError::ContractPaused`]:
    ///
    /// | Entrypoint              | Blocked when paused | Reason                                              |
    /// |-------------------------|---------------------|-----------------------------------------------------|
    /// | `record_payment`        | blocked             | Payment log is frozen during investigation          |
    /// | `propose_admin`         | blocked             | Admin role cannot rotate out of containment         |
    /// | `accept_admin`          | blocked             | Pending proposals cannot be claimed while paused    |
    /// | `cancel_admin_transfer` | blocked             | Control plane must remain stable during pause       |
    /// | `allow_asset`           | blocked             | Allowlist cannot be added to while paused           |
    /// | `revoke_asset`          | blocked             | Allowlist cannot be removed from while paused       |
    /// | `set_allow_native`      | blocked             | Native-asset policy cannot flip while paused        |
    ///
    /// The following admin-gated entrypoints remain **intentionally available**
    /// while paused — they are either part of the upgrade runbook (which
    /// requires the contract to be paused first) or are recovery paths that
    /// must be usable during containment:
    ///
    /// | Entrypoint               | Available? | Rationale                                                                 |
    /// |--------------------------|------------|---------------------------------------------------------------------------|
    /// | `set_paused`             | yes        | Unpausing must be possible to lift the containment window                |
    /// | `upgrade`                | yes        | The WASM-upgrade runbook *requires* pausing first; see `upgrade()` docs  |
    /// | `upgrade_storage`        | yes        | Storage migration runs between `upgrade()` and the final unpause         |
    /// | `rebuild_history_index`  | yes        | Administrative recovery; may run in the upgrade window or standalone    |
    /// | `migrate_legacy_payments`| yes        | Administrative cleanup of legacy keys; may run standalone (issue #508)  |
    /// | `payment_count`          | yes        | Admin-gated bulk read (issue #512); auditing must work during containment |
    /// | `payment_history`        | yes        | Admin-gated bulk read (issue #512); auditing must work during containment |
    /// | `settlement_ref_history` | yes        | Admin-gated bulk read (issue #512); auditing must work during containment |
    /// | `settlement_ref_index_status` | yes   | Admin-gated bulk read (issue #512); auditing must work during containment |
    /// | `history_index_status`   | yes        | Admin-gated bulk read (issue #512); auditing must work during containment |
    ///
    /// The permissionless read entrypoints (`config`, `admin`, `pending_admin`,
    /// `is_paused`, `get_payment`, `has_payment`, `settlement_ref_owner`,
    /// `allowed_assets`, `allowlist_count`, `contract_version`,
    /// `version_info`) remain available while paused with no auth at all.
    /// The admin-gated bulk reads above are likewise never blocked by pause
    /// — only by admin auth — since auditing and investigation must never be
    /// blocked by the emergency stop. See the module-level "Access control
    /// model" doc for each read method's write-footprint guarantee, and
    /// "Disclosure guarantee / threat model" for why the bulk reads are
    /// admin-gated in the first place.
    ///
    /// ## Authorization
    /// Only the contract admin can call this method.
    ///
    /// ## Events
    /// Emits `ContractPaused` event **only on actual state transitions**.
    /// Calling `set_paused(true)` when already paused, or `set_paused(false)`
    /// when already unpaused, is a no-op: storage is not written and no
    /// event is emitted, so the event stream is a faithful record of real
    /// state changes.
    ///
    /// ## Errors
    /// - `NotInitialized` if contract not initialized
    /// - `Unauthorized` if caller is not admin
    pub fn set_paused(env: Env, caller: Address, paused: bool) -> Result<(), ContractError> {
        let admin = get_admin(&env)?;
        caller.require_auth();

        if caller != admin {
            return Err(ContractError::Unauthorized);
        }

        let current = storage::is_paused(&env);
        if current == paused {
            return Ok(());
        }

        storage::set_paused(&env, paused);
        events::emit_contract_paused(&env, paused, caller);
        Ok(())
    }

    /// Return `true` if the contract is currently paused.
    pub fn is_paused(env: Env) -> bool {
        storage::is_paused(&env)
    }

    /// Rebuild the payment history index from existing records.
    ///
    /// This is a maintenance function that can be called by the admin to
    /// rebuild the history index if it becomes corrupted or incomplete.
    ///
    /// ## Authorization
    /// Only the contract admin can call this method.
    ///
    /// ## When to use
    /// - After a storage upgrade that didn't properly rebuild indexes
    /// - If the history index becomes inconsistent with the payment records
    /// - As a recovery mechanism if the index is corrupted
    ///
    /// ## Pause interaction
    /// **Exempt** from the pause guard. As a maintenance/recovery function
    /// it may be invoked either inside the pause window (as part of the
    /// upgrade→migrate→verify→unpause runbook) or standalone during normal
    /// operation. Admin-gated, so only the operator can trigger it.
    ///
    /// ## Errors
    /// - `NotInitialized` if contract not initialized
    /// - `Unauthorized` if caller is not admin
    /// - `MigrationRequired` if storage schema is not yet current
    /// - `HistoryIndexRebuildFailed` if rebuild fails
    pub fn rebuild_history_index(env: Env, admin: Address) -> Result<(), ContractError> {
        let current_admin = get_admin(&env)?;
        if admin != current_admin {
            return Err(ContractError::Unauthorized);
        }
        admin.require_auth();

        // Ensure schema is current
        if !crate::storage::is_schema_compatible(&env) {
            return Err(ContractError::MigrationRequired);
        }

        // Rebuild the index
        crate::migration::rebuild_payment_history_index(&env)
    }

    /// Migrate a caller-supplied batch of legacy (pre-schema-versioning)
    /// `Payment(invoice_id)` records to the versioned `PaymentV1` key,
    /// removing each legacy entry as it migrates — so a record never sits
    /// under two keys, paying rent twice, after this call (issue #508).
    ///
    /// ## Why the caller supplies the invoice_ids
    /// A genuinely legacy record predates the `PaymentLog` write-order index
    /// every other migration in this contract uses to discover records, so
    /// there is no on-chain way to enumerate which invoice_ids still need
    /// migrating — see `migration::migrate_legacy_payments`'s doc comment.
    /// The operator supplies the batch from off-chain records of which
    /// invoice_ids exist (e.g. the backend's own database).
    ///
    /// ## Bounded and resumable
    /// Rejects a batch larger than [`storage::MAX_LEGACY_MIGRATION_BATCH`]
    /// with [`ContractError::LegacyPaymentMigrationBatchTooLarge`] rather
    /// than silently truncating it. Each invoice_id migrates independently
    /// and idempotently (an already-migrated or never-existing id is simply
    /// counted, never an error), so a large backlog can be split across as
    /// many calls as needed, and any call can be safely retried.
    ///
    /// Returns `(migrated, already_current, not_found)`:
    /// - `migrated` — legacy entries actually copied to `PaymentV1` and
    ///   removed from the legacy key this call.
    /// - `already_current` — ids already under `PaymentV1`; nothing to do.
    /// - `not_found` — ids with no record under either key (e.g. a typo in
    ///   the supplied batch).
    ///
    /// ## Authorization
    /// Only the contract admin can call this method.
    ///
    /// ## Pause interaction
    /// **Exempt** from the pause guard, like [`rebuild_history_index`] —
    /// this is administrative cleanup of storage layout, not a
    /// control-plane change, and must remain usable during containment.
    /// Admin-gated regardless.
    ///
    /// ## Errors
    /// - [`ContractError::NotInitialized`] — contract was never initialised
    /// - [`ContractError::Unauthorized`] — caller is not admin
    /// - [`ContractError::LegacyPaymentMigrationBatchTooLarge`] — more than
    ///   [`storage::MAX_LEGACY_MIGRATION_BATCH`] invoice_ids in one call
    ///
    /// ## Events
    /// Emits `LegacyPaymentsMigrated { migrated, migrated_at }` when at
    /// least one record was actually migrated this call.
    pub fn migrate_legacy_payments(
        env: Env,
        admin: Address,
        invoice_ids: Vec<String>,
    ) -> Result<(u32, u32, u32), ContractError> {
        let current_admin = get_admin(&env)?;
        if admin != current_admin {
            return Err(ContractError::Unauthorized);
        }
        admin.require_auth();

        crate::migration::migrate_legacy_payments(&env, &invoice_ids)
    }

    /// Get the consistency status of the history index.
    ///
    /// Returns a tuple (history_count, payment_count, is_consistent).
    /// This is a diagnostic function for ops tooling.
    ///
    /// ## Authorization
    /// **Admin-gated** (issue #512): a raw payment-volume counter comparison
    /// is bulk platform-activity data — mirrors [`rebuild_history_index`]'s
    /// auth pattern exactly. Available while paused; auditing must never be
    /// blocked by the emergency stop.
    ///
    /// ## Errors
    /// - [`ContractError::NotInitialized`] — contract was never initialised
    /// - [`ContractError::Unauthorized`] — `admin` is not the current admin
    pub fn history_index_status(
        env: Env,
        admin: Address,
    ) -> Result<(u32, u32, bool), ContractError> {
        let current_admin = get_admin(&env)?;
        if admin != current_admin {
            return Err(ContractError::Unauthorized);
        }
        admin.require_auth();
        let history_count = crate::storage::get_history_count(&env);
        let payment_count = crate::storage::get_payment_count(&env);
        let is_consistent = history_count == payment_count;
        Ok((history_count, payment_count, is_consistent))
    }
}

mod test;
