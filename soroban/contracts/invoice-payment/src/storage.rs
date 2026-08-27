use crate::errors::ContractError;
use crate::events;
use soroban_sdk::{contracttype, Address, Env, String, Vec};

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
//
// TTL bumps vs. data writes — reads and simulation (issue #508):
// - `extend_ttl` only pushes out a ledger entry's rent-paid live-until
//   ledger; it never touches the entry's stored VALUE. It is technically
//   part of a transaction's read-write footprint (Soroban tracks TTL on the
//   same key), but it never creates, duplicates, or deletes a record — a
//   fundamentally different, much lighter operation than a real `.set()` or
//   `.remove()`.
// - Every permissionless read in this contract extends TTL on a hit and
//   nothing more. `simulateTransaction` (the RPC read path, `invoke-*.sh`,
//   etc.) computes and returns this footprint automatically and correctly —
//   it is expected and does not make a read "fail" or require a real
//   submitted transaction; this is the normal, documented Soroban pattern
//   for "bump on access" storage.
// - What genuinely breaks read-only usage is a read that also mutates
//   *data* — e.g. `get_payment`'s legacy-key fallback used to copy the
//   record into the versioned key on every hit (issue #508). That has been
//   removed: `get_payment`/`has_payment` are pure reads (TTL bump only); the
//   copy-and-clean-up-the-legacy-key step now only happens through the
//   explicit, admin-gated `migrate_legacy_payment_key` /
//   `migration::migrate_legacy_payments`.
// - See the "Access control model" doc on `InvoicePaymentContract` in
//   `lib.rs` for the per-method footprint guarantee.
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
/// Current storage schema version.
///
/// V4 adds a write-order enumeration index (`AllowListLog` /
/// `AllowListCount` / `AllowListIndex`) for the asset allowlist, so
/// `allowed_assets()`/`allowlist_count()` can enumerate it instead of
/// requiring callers to already know which pairs to ask `is_asset_allowed`
/// about. Backfilled for legacy deployments (to the extent recoverable —
/// see its doc comment) by `migrate_schema_v3_to_v4`. See issue #464.
///
/// **Maintenance note:** each migration step function stamps
/// `ContractMeta.storage_schema_version` with the fixed constant for the
/// version *it* reaches (e.g. `migrate_schema_v1_to_v2` stamps
/// `STORAGE_SCHEMA_V2`), never this constant directly — `upgrade_storage_schema`
/// is what stamps `STORAGE_SCHEMA_VERSION` once every step up to the final
/// target has run. If you add a new final step (e.g. V4 → V5), change the
/// previous final step to stamp its own fixed constant instead of this one.
pub const STORAGE_SCHEMA_VERSION: u32 = 5;

/// Schema version that introduced `ContractMeta` + `PaymentV1` keys.
pub const STORAGE_SCHEMA_V1: u32 = 1;

/// Schema version that introduced the per-payer payment index
/// (`PayerPaymentCount` / `PayerPaymentIdx`). See issue #445.
pub const STORAGE_SCHEMA_V2: u32 = 2;

/// Schema version that changed what `DataKey::SettlementRef(ref)` stores:
/// previously a unit value marking the reference as "used", now the
/// invoice_id that consumed it, so `settlement_ref_owner` can resolve a
/// reference back to its owning invoice. See issue #495.
pub const STORAGE_SCHEMA_V3: u32 = 3;

/// Schema version that introduced precision on payment records and allowlist
/// entries. Legacy records are not assigned a guessed scale by migration.
pub const STORAGE_SCHEMA_V4: u32 = 4;

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

/// Maximum number of settlement-reference entries returned in one
/// `settlement_ref_history` page. Mirrors `MAX_PAYMENT_HISTORY_PAGE_SIZE`.
pub const MAX_SETTLEMENT_REF_PAGE_SIZE: u32 = 25;

/// Maximum number of allowlist entries returned in one `allowed_assets`
/// page. Mirrors `MAX_PAYMENT_HISTORY_PAGE_SIZE`.
pub const MAX_ALLOWLIST_PAGE_SIZE: u32 = 25;

/// Maximum number of invoice_ids accepted in one `migrate_legacy_payments`
/// call. Exceeding this fails fast with
/// `ContractError::LegacyPaymentMigrationBatchTooLarge` rather than silently
/// truncating a write the caller expected to fully apply — split a larger
/// backlog across multiple calls instead (issue #508).
///
/// Each id that actually migrates costs up to 4 footprint entries (read
/// `PaymentV1`, read the legacy key, write `PaymentV1`, remove the legacy
/// key) — 2 of them writes. Soroban caps a single invocation at 100 total
/// footprint entries and 50 write entries; at 25 per batch a worst case
/// (every id migrates) measured 105 footprint / 51 writes and was rejected
/// by the network's own resource limits. 20 leaves comfortable headroom
/// (≤80 footprint / ≤40 writes) for that overhead plus the admin-auth
/// check's own instance-storage touch.
pub const MAX_LEGACY_MIGRATION_BATCH: u32 = 20;

// ─── Identifier Canonicalisation ────────────────────────────────────────────
//
// `invoice_id` and `settlement_ref` back the contract's two idempotency
// guards (`has_payment` / `is_settlement_ref_used`), both of which compare
// stored keys byte-exactly. Without a canonical form, "inv-001", "INV-001",
// and "inv-001 " are three different keys even though they identify the same
// invoice, silently defeating "each invoice_id may be recorded only once".
//
// `record_payment` enforces canonical form by *rejecting* anything that is
// not already canonical rather than normalising it before storage — this is
// the safer default because the stored key always matches exactly what the
// caller supplied, with no silent transformation to account for.
//
// Canonical form (both fields): ASCII lowercase letters (`a`-`z`), digits
// (`0`-`9`), and hyphens (`-`) only — nothing else, including uppercase
// letters, whitespace (leading, trailing, or embedded), and other
// punctuation. This single rule covers every shape these fields are
// documented to hold: UUID-style invoice IDs, lowercase-hex settlement
// hashes (Horizon always returns transaction hashes as lowercase hex), and
// human-readable kebab-case reference IDs — while still rejecting the
// case/whitespace variants and pasted-blob inputs that would otherwise slip
// past the uniqueness guards or bloat persistent storage.
//
// Existing deployments: this validation applies only to `record_payment`'s
// write path for *new* records. It is never invoked by `get_payment`,
// `rebuild_history_index`, or the schema migrations, so payment records
// already on chain under a pre-existing, non-canonical `invoice_id` or
// `settlement_ref` remain fully readable and are not touched or re-validated
// by an upgrade — only newly submitted payments are held to the new rule.

/// Maximum length of `invoice_id`. `record_payment` rejects longer values.
///
/// The product currently issues UUIDv4 invoice IDs (36 characters: lowercase
/// hex digits and hyphens). 64 leaves headroom for future ID formats while
/// staying well below `MAX_SETTLEMENT_REF_LEN`, bounding the ledger rent an
/// oversized identifier could otherwise impose (invoice_id is duplicated
/// across `PaymentV1`, `PaymentLog`, and every `PaymentHistory` slot).
pub const MAX_INVOICE_ID_LEN: u32 = 64;

/// Maximum length of `settlement_ref`. A SHA-256 hex string is 64 chars;
/// this allows headroom for other reference ID shapes while still rejecting
/// a full transaction blob pasted by mistake.
pub const MAX_SETTLEMENT_REF_LEN: u32 = 128;

/// Capacity of the stack buffer used by [`is_canonical_identifier`] —
/// large enough for either bounded field, since callers only ever copy
/// `value.len()` bytes into it.
const MAX_IDENTIFIER_LEN: usize = MAX_SETTLEMENT_REF_LEN as usize;

/// Returns `true` if `value` is already in canonical form: every byte is an
/// ASCII lowercase letter, digit, or hyphen. See the module-level
/// "Identifier Canonicalisation" notes above for the rationale.
///
/// Callers must check `value.len() <= MAX_IDENTIFIER_LEN` first (both
/// `MAX_INVOICE_ID_LEN` and `MAX_SETTLEMENT_REF_LEN` are within that bound);
/// this function panics via `String::copy_into_slice` otherwise.
pub fn is_canonical_identifier(value: &String) -> bool {
    let len = value.len() as usize;
    let mut buf = [0u8; MAX_IDENTIFIER_LEN];
    value.copy_into_slice(&mut buf[..len]);
    buf[..len]
        .iter()
        .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || *b == b'-')
}

/// Hard cap on the number of history-index slots a single `payments_by_payer`
/// invocation may examine, regardless of how few records match the payer.
///
/// `payments_by_payer` filters by payer while scanning the shared history
/// index, so its work per call is bounded by slots *examined*, not records
/// returned. Without this cap a payer with no matching records forces a full
/// scan of the entire index in one invocation — which reliably exhausts the
/// ledger CPU/read budget as history grows and starts failing for everyone
/// (issue #445).
///
/// The value is bounded by Soroban's per-invocation footprint limit of 100
/// distinct ledger entries: every examined slot is one persistent entry read,
/// so the cap must leave headroom for the instance, config, and count keys.
/// 80 examined slots keeps the worst-case invocation comfortably inside that
/// limit; callers page through larger sparse result sets using the returned
/// `next_cursor` / `has_more`.
pub const MAX_PAYER_SCAN_SLOTS: u32 = 80;

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
/// `set_allow_native`. There is no `requires_token_allowlist` field: every
/// non-native asset always requires allowlisting in this contract (see
/// `record_payment`) — there is no code path where it's optional — so a
/// field for it would only ever report a constant, never real state (issue
/// #464). Use `allowed_assets()`/`allowlist_count()` to inspect the actual
/// allowlist instead of inferring policy from this struct.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AllowlistMode {
    pub native_allowed: bool,
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
    /// Number of payments recorded for a payer (per-payer index size), in
    /// **persistent** storage. Presence of this key marks the payer's
    /// per-payer index as built; absence means `payments_by_payer` must fall
    /// back to the bounded history scan. Introduced by schema V2 (#445).
    PayerPaymentCount(Address),
    /// Per-payer payment index: maps `(payer, ordinal)` to the slot in the
    /// shared `PaymentHistory` index holding that payer's Nth recorded
    /// payment, in **persistent** storage. Written by `record_payment()` and
    /// backfilled by the schema V2 migration / `rebuild_payment_history_index`.
    PayerPaymentIdx(Address, u32),
    /// Allowlist entry for a token in **persistent** storage.
    /// Key: AllowList(asset_code, issuer)
    AllowList(String, String),
    /// Flag for allowing native XLM in **instance** storage.
    AllowNative,
    /// Flag indicating whether the contract is paused (instance storage).
    Paused,
    /// Address proposed as the next admin by `propose_admin()` in **instance**
    /// storage. Read by `accept_admin()` to complete the two-step handoff.
    PendingAdmin,
    /// Global index resolving a settlement reference to the invoice_id that
    /// consumed it, in **persistent** storage.
    /// Key: `SettlementRef(settlement_ref) -> invoice_id`.
    ///
    /// Before schema V3 this stored a unit value (existence only); V3
    /// backfills every entry with its owning invoice_id (issue #495).
    SettlementRef(String),
    /// Running count of settlement references recorded (persistent index
    /// size), in **instance** storage. Mirrors `PaymentCount`.
    SettlementRefCount,
    /// Append-only write-order log of settlement-reference → invoice_id
    /// mappings, keyed by `SettlementRefCount` index at write time. Powers
    /// `settlement_ref_history` pagination, mirroring `PaymentLog`'s role
    /// for `PaymentHistory`.
    SettlementRefLog(u32),
    /// Write-order enumeration log of currently-allowlisted assets, in
    /// **persistent** storage. Key: `AllowListLog(slot) -> AllowlistEntry`.
    /// Unlike `PaymentLog`/`SettlementRefLog`, a slot can become a hole:
    /// `revoke_asset` removes it, so it is skipped (not treated as the end
    /// of the log) by `allowed_assets` pagination, exactly like a
    /// partially-rebuilt `PaymentHistory` slot (issue #464).
    AllowListLog(u32),
    /// Reverse index from an allowlisted `(code, issuer)` pair to its slot
    /// in `AllowListLog`, in **persistent** storage. Lets `revoke_asset`
    /// remove the pair's log entry in O(1) without scanning the log.
    /// Absence means the pair is either not allowlisted, or allowlisted
    /// but not yet indexed (a legacy entry predating schema V4, until
    /// `allow_asset` is called for it again or the V3 → V4 migration
    /// backfills it from payment history).
    AllowListIndex(String, String),
    /// Running count of **currently-allowlisted** assets (i.e. `AllowListLog`
    /// entries that are not holes), in **instance** storage. Distinct from
    /// the log's own write-order length: revoking an asset decrements this
    /// count but never shrinks the log itself. This is the count `allowed_assets`
    /// callers should use to size their paging and detect drift.
    AllowListCount,
    /// Write-order length of `AllowListLog` (the next slot index to assign),
    /// in **instance** storage. Only grows — never decremented by
    /// `revoke_asset` — since it is a slot-capacity bound for pagination,
    /// not a live membership count (`AllowListCount` is that).
    AllowListLogCount,
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
/// - **Other tokens**: the token's own smallest unit; `asset_decimals` records
///   the number of decimal places needed to interpret that unit.
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

    /// Decimal places in the asset's smallest unit. Legacy records use `0`
    /// because their precision was not recorded and must not be inferred.
    pub asset_decimals: u32,

    /// Unix timestamp (seconds) sourced from the ledger at recording time.
    pub timestamp: u64,

    /// Normalised settlement reference for backend deduplication and auditing.
    ///
    /// A deterministic hash or reference ID (e.g. a SHA-256 hex string or a
    /// kebab-case reconciliation identifier) that the backend uses for
    /// idempotent settlement reconciliation. Stored on-chain so any observer
    /// can verify the settlement reference associated with a payment.
    ///
    /// `record_payment` enforces the "normalised" claim: canonical form is
    /// ASCII lowercase letters, digits, and hyphens only, at most
    /// [`MAX_SETTLEMENT_REF_LEN`] characters — see
    /// [`is_canonical_identifier`]. Records written before this validation
    /// existed may not conform; they remain readable as-is.
    pub settlement_ref: String,
}

/// V4 wire shape retained so pre-precision records remain readable after the
/// schema upgrade. The conversion deliberately marks their scale unknown.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
struct LegacyPaymentRecord {
    invoice_id: String,
    payer: Address,
    asset: Asset,
    amount: i128,
    timestamp: u64,
    settlement_ref: String,
}

fn read_payment_value(env: &Env, key: &DataKey) -> Option<PaymentRecord> {
    let current: Option<PaymentRecord> = env.storage().persistent().get(key);
    if let Some(record) = current {
        return Some(record);
    }
    let legacy: Option<LegacyPaymentRecord> = env.storage().persistent().get(key);
    legacy
        .map(|legacy| PaymentRecord {
            invoice_id: legacy.invoice_id,
            payer: legacy.payer,
            asset: legacy.asset,
            amount: legacy.amount,
            asset_decimals: 0,
            timestamp: legacy.timestamp,
            settlement_ref: legacy.settlement_ref,
        })
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

/// A single settlement-reference → invoice_id mapping, as recorded by
/// `record_payment` or backfilled by migration. Used both as the stored
/// enumeration-log value and as a page record in [`SettlementRefPage`].
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct SettlementRefEntry {
    pub settlement_ref: String,
    pub invoice_id: String,
}

/// A bounded, cursor-friendly slice of the settlement-reference index.
/// Mirrors [`PaymentHistoryPage`]'s pagination and gap-skipping conventions.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct SettlementRefPage {
    /// Entries returned for this page, in write order.
    pub records: Vec<SettlementRefEntry>,
    /// Cursor to pass to the next call.
    pub next_cursor: u32,
    /// True when more entries are available after `next_cursor`.
    pub has_more: bool,
    /// Number of index slots in `[cursor, next_cursor)` that were expected to
    /// hold an entry but did not. Always `0` for a healthy index.
    pub gaps_skipped: u32,
}

/// A single allowlisted `(code, issuer)` pair, as recorded by `allow_asset`
/// or backfilled by migration. Used both as the stored enumeration-log
/// value and as a page record in [`AllowlistPage`].
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct AllowlistEntry {
    pub code: String,
    pub issuer: String,
    /// Decimal places recorded when the asset was allowlisted.
    pub decimals: u32,
}

/// A bounded, cursor-friendly slice of the currently-allowlisted assets.
/// Mirrors [`PaymentHistoryPage`]'s pagination and gap-skipping conventions.
/// Unlike `PaymentHistoryPage`/`SettlementRefPage`, holes here are a normal,
/// expected outcome of `revoke_asset` rather than only a sign of corruption.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct AllowlistPage {
    /// Entries returned for this page, in write (allow) order. A revoked
    /// asset never appears here again unless `allow_asset` is called for it
    /// a second time, which assigns it a fresh slot.
    pub records: Vec<AllowlistEntry>,
    /// Cursor to pass to the next call.
    pub next_cursor: u32,
    /// True when more entries are available after `next_cursor`.
    pub has_more: bool,
    /// Number of log slots in `[cursor, next_cursor)` that have been
    /// revoked (or, for a legacy pre-migration deployment, not yet
    /// backfilled). Not an error signal by itself the way it is for
    /// `PaymentHistoryPage` — a growing count here across the whole log is
    /// simply the accumulated history of every revoke ever made.
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

/// Read a stored [`PaymentRecord`]. Extends persistent storage TTL on
/// whichever key (`PaymentV1` or the legacy `Payment` key) actually holds the
/// record.
///
/// # No data write (issue #508)
/// This is a **pure read**. It never copies a legacy record to `PaymentV1`
/// and never removes anything — extending an entry's TTL only pushes out its
/// rent-paid live-until ledger, it does not touch the stored value, so a
/// permissionless caller can never use this to create, duplicate, or delete
/// state. Migrating a legacy `Payment(invoice_id)` entry to `PaymentV1` (and
/// removing the legacy copy) only happens through the explicit, admin-gated
/// [`migrate_legacy_payment_key`], called via `migrate_legacy_payments` in
/// `lib.rs`. Before this fix, this function performed that copy itself on
/// every legacy hit and never removed the old key — see issue #508.
///
/// Returns [`ContractError::PaymentNotFound`] if nothing has been recorded for
/// `invoice_id`.
pub fn get_payment(env: &Env, invoice_id: &String) -> Result<PaymentRecord, ContractError> {
    let v1_key = payment_key_v1(invoice_id);
    let v1_record = read_payment_value(env, &v1_key);
    if let Some(record) = v1_record {
        env.storage()
            .persistent()
            .extend_ttl(&v1_key, MIN_TTL, BUMP_TTL);
        return Ok(record);
    }

    // Legacy compatibility fallback: still a read-only lookup by a different
    // key, not a migration. A record found here remains under the legacy key
    // until an admin explicitly migrates it.
    let legacy_key = payment_key_legacy(invoice_id);
    let legacy_record = read_payment_value(env, &legacy_key);
    match legacy_record {
        Some(record) => {
            env.storage()
                .persistent()
                .extend_ttl(&legacy_key, MIN_TTL, BUMP_TTL);
            Ok(record)
        }
        None => Err(ContractError::PaymentNotFound),
    }
}

/// Outcome of attempting to migrate one invoice's legacy `Payment(invoice_id)`
/// entry, returned by [`migrate_legacy_payment_key`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LegacyMigrationOutcome {
    /// A legacy entry existed and has been copied to `PaymentV1` and removed
    /// from the legacy key — the record now exists under exactly one key.
    Migrated,
    /// Already under `PaymentV1` (possibly from a prior migration call);
    /// nothing to do.
    AlreadyCurrent,
    /// No record exists under either key for this invoice_id.
    NotFound,
}

/// Migrate a single invoice's legacy `Payment(invoice_id)` entry to the
/// versioned `PaymentV1` key, removing the legacy entry so the record exists
/// under exactly one storage key afterward.
///
/// This is the **only** place a legacy record is ever copied to `PaymentV1`
/// — [`get_payment`] and [`has_payment`] are pure reads and never do this
/// (issue #508). Only called from the admin-gated
/// `migration::migrate_legacy_payments` batch entrypoint, never from a
/// permissionless path.
///
/// Idempotent: calling this again for an already-migrated or never-existing
/// `invoice_id` is a safe no-op that reports [`LegacyMigrationOutcome::AlreadyCurrent`]
/// / [`LegacyMigrationOutcome::NotFound`] respectively, never an error.
pub fn migrate_legacy_payment_key(env: &Env, invoice_id: &String) -> LegacyMigrationOutcome {
    let v1_key = payment_key_v1(invoice_id);
    if env.storage().persistent().has(&v1_key) {
        env.storage()
            .persistent()
            .extend_ttl(&v1_key, MIN_TTL, BUMP_TTL);
        return LegacyMigrationOutcome::AlreadyCurrent;
    }

    let legacy_key = payment_key_legacy(invoice_id);
    let legacy_record = read_payment_value(env, &legacy_key);
    match legacy_record {
        Some(record) => {
            env.storage().persistent().set(&v1_key, &record);
            env.storage()
                .persistent()
                .extend_ttl(&v1_key, MIN_TTL, BUMP_TTL);
            env.storage().persistent().remove(&legacy_key);
            LegacyMigrationOutcome::Migrated
        }
        None => LegacyMigrationOutcome::NotFound,
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
    let record = read_payment_value(env, &key);
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

// ─── Per-Payer Index Helpers ────────────────────────────────────────────────

/// Return the number of payments indexed for `payer`, or `None` when the
/// per-payer index has not been built for this payer (legacy data that has
/// not yet gone through the schema V2 migration / rebuild). Bumps TTL.
pub fn get_payer_payment_count(env: &Env, payer: &Address) -> Option<u32> {
    let key = DataKey::PayerPaymentCount(payer.clone());
    let count: Option<u32> = env.storage().persistent().get(&key);
    if count.is_some() {
        env.storage()
            .persistent()
            .extend_ttl(&key, MIN_TTL, BUMP_TTL);
    }
    count
}

/// Append a `(payer → history_index)` mapping to the per-payer index and
/// bump the payer's entry count. Called by `record_payment()` on every new
/// payment and by the rebuild/migration paths when backfilling legacy data.
pub fn append_payer_entry(env: &Env, payer: &Address, history_index: u32) {
    let count_key = DataKey::PayerPaymentCount(payer.clone());
    let ordinal: u32 = env.storage().persistent().get(&count_key).unwrap_or(0u32);

    let idx_key = DataKey::PayerPaymentIdx(payer.clone(), ordinal);
    env.storage().persistent().set(&idx_key, &history_index);
    env.storage()
        .persistent()
        .extend_ttl(&idx_key, MIN_TTL, BUMP_TTL);

    env.storage()
        .persistent()
        .set(&count_key, &(ordinal + 1u32));
    env.storage()
        .persistent()
        .extend_ttl(&count_key, MIN_TTL, BUMP_TTL);
}

/// Look up the history-index slot holding `payer`'s `ordinal`-th payment.
/// Returns `None` when the slot is missing (corrupted/partially-rebuilt
/// per-payer index); callers treat that as a gap exactly like
/// `payment_history` treats holes in the shared index.
fn get_payer_entry(env: &Env, payer: &Address, ordinal: u32) -> Option<u32> {
    let key = DataKey::PayerPaymentIdx(payer.clone(), ordinal);
    let entry: Option<u32> = env.storage().persistent().get(&key);
    if entry.is_some() {
        env.storage()
            .persistent()
            .extend_ttl(&key, MIN_TTL, BUMP_TTL);
    }
    entry
}

/// Remove every per-payer index entry for all payers by clearing the entries
/// recorded during a full rebuild. Only used internally by the rebuild path,
/// which walks the freshly collected record set to know which payers own
/// which ordinals — see `migration::write_history_index`.
pub(crate) fn clear_payer_indexes(env: &Env, owners: &[Address]) {
    for owner in owners {
        let count = get_payer_payment_count(env, owner).unwrap_or(0u32);
        for ordinal in 0..count {
            env.storage()
                .persistent()
                .remove(&DataKey::PayerPaymentIdx(owner.clone(), ordinal));
        }
        env.storage()
            .persistent()
            .remove(&DataKey::PayerPaymentCount(owner.clone()));
    }
}

/// Read a bounded page of payments made by `payer` via the **per-payer
/// index** (direct reads, O(limit) storage access).
///
/// `cursor` is an ordinal into the payer's payment list (pass `0` first).
/// A missing backing history slot is counted in `gaps_skipped` and skipped,
/// mirroring the gap semantics of `payment_history`.
///
/// Extends instance TTL for counts and persistent TTL for records/index.
pub fn get_payer_history_page(
    env: &Env,
    payer: &Address,
    cursor: u32,
    limit: u32,
) -> PaymentHistoryPage {
    let payer_total = get_payer_payment_count(env, payer).unwrap_or(0u32);
    let capped_limit = core::cmp::min(limit, MAX_PAYMENT_HISTORY_PAGE_SIZE);
    let start = core::cmp::min(cursor, payer_total);

    let mut records: Vec<PaymentRecord> = Vec::new(env);
    let mut ordinal = start;
    let mut collected: u32 = 0;
    let mut gaps_skipped: u32 = 0;

    while ordinal < payer_total && collected < capped_limit {
        match get_payer_entry(env, payer, ordinal)
            .and_then(|history_slot| get_history_record(env, history_slot))
        {
            Some(record) => {
                // Defensive: skip records whose stored payer no longer
                // matches (should be impossible — the index is keyed by the
                // payer written into the record itself).
                if record.payer == *payer {
                    records.push_back(record);
                    collected += 1;
                } else {
                    gaps_skipped += 1;
                }
            }
            None => gaps_skipped += 1,
        }
        ordinal += 1;
    }

    PaymentHistoryPage {
        records,
        next_cursor: ordinal,
        has_more: ordinal < payer_total,
        gaps_skipped,
    }
}

/// Read a bounded page of payments made by `payer` by scanning the shared
/// history index with the filter applied.
///
/// Unlike [`get_payment_history_page`], where every examined slot either
/// yields a record or is a gap, filtering breaks that bound: slots belonging
/// to *other* payers are consumed without contributing to `collected`. The
/// scan is therefore capped at [`MAX_PAYER_SCAN_SLOTS`] slots **examined**
/// per invocation, independent of how many records match — a payer with no
/// matching records returns an empty page promptly instead of scanning the
/// whole index (issue #445).
///
/// `cursor` is a shared-history-index slot; `next_cursor` reports where the
/// scan actually stopped, so an empty page with `has_more == true` is
/// expected on sparse result sets and callers must continue paging until
/// `has_more == false`. Gaps are skipped exactly like `payment_history`.
pub fn get_payments_by_payer_page(
    env: &Env,
    payer: &Address,
    cursor: u32,
    limit: u32,
) -> PaymentHistoryPage {
    let total = get_history_count(env);
    let capped_limit = core::cmp::min(limit, MAX_PAYMENT_HISTORY_PAGE_SIZE);
    let start = core::cmp::min(cursor, total);

    let mut records: Vec<PaymentRecord> = Vec::new(env);
    let mut index = start;
    let mut collected: u32 = 0;
    let mut gaps_skipped: u32 = 0;
    let mut scanned: u32 = 0;

    while index < total && collected < capped_limit && scanned < MAX_PAYER_SCAN_SLOTS {
        scanned += 1;
        match get_history_record(env, index) {
            Some(record) => {
                if record.payer == *payer {
                    records.push_back(record);
                    collected += 1;
                }
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

/// Return the recorded precision for an allowlisted token.
pub fn get_asset_decimals(env: &Env, code: &String, issuer: &String) -> Option<u32> {
    let key = DataKey::AllowList(code.clone(), issuer.clone());
    let decimals: Option<u32> = env.storage().persistent().get(&key);
    if decimals.is_some() {
        env.storage().persistent().extend_ttl(&key, MIN_TTL, BUMP_TTL);
    }
    decimals
}

/// Add an asset to the allowlist and bump TTL.
///
/// Also indexes the pair into the write-order enumeration log
/// (`AllowListLog`/`AllowListCount`) via [`backfill_allowlist_index`] if it
/// isn't indexed yet — covering both a genuinely new pair and a legacy
/// pre-schema-V4 pair being re-allowed. A pair that is already indexed
/// (including a redundant re-allow of a currently-allowed pair) is left
/// untouched, so re-allowing never creates a duplicate log entry or
/// double-counts `allowlist_count()`.
pub fn allow_asset(env: &Env, code: &String, issuer: &String) {
    allow_asset_with_decimals(env, code, issuer, 7);
}

/// Add an asset to the allowlist with its declared decimal precision.
pub fn allow_asset_with_decimals(env: &Env, code: &String, issuer: &String, decimals: u32) {
    let key = DataKey::AllowList(code.clone(), issuer.clone());
    env.storage().persistent().set(&key, &decimals);
    env.storage()
        .persistent()
        .extend_ttl(&key, MIN_TTL, BUMP_TTL);

    backfill_allowlist_index_with_decimals(env, code, issuer, decimals);
}

/// Remove an asset from the allowlist.
///
/// Returns `true` if the pair was allowlisted and is now removed, `false`
/// if it was never allowlisted (a safe no-op) — lets the caller (`lib.rs`)
/// decide whether to emit `AssetRevoked`, so revoking a never-allowlisted
/// pair is distinguishable from revoking a real entry (issue #464).
pub fn revoke_asset(env: &Env, code: &String, issuer: &String) -> bool {
    let key = DataKey::AllowList(code.clone(), issuer.clone());
    if !env.storage().persistent().has(&key) {
        return false;
    }
    env.storage().persistent().remove(&key);

    // Remove the pair's enumeration-log entry, if it has one. A currently
    // allowed pair predating schema V4 that has not yet been backfilled
    // (see `migrate_schema_v3_to_v4`) has no `AllowListIndex` entry — that
    // is not an error, just nothing left to remove from the enumeration.
    let index_key = DataKey::AllowListIndex(code.clone(), issuer.clone());
    let slot: Option<u32> = env.storage().persistent().get(&index_key);
    if let Some(slot) = slot {
        env.storage()
            .persistent()
            .remove(&DataKey::AllowListLog(slot));
        env.storage().persistent().remove(&index_key);
        decrement_allowlist_count(env);
    }

    true
}

/// Index `(code, issuer)` into the write-order enumeration log if it isn't
/// indexed yet. No-ops (returns `false`) if `AllowListIndex` already has an
/// entry for this pair. Does **not** touch the primary `AllowList(code,
/// issuer)` existence key — callers are responsible for that separately
/// (see `allow_asset`) or have already confirmed it exists (see
/// `migrate_schema_v3_to_v4`).
///
/// Shared by `allow_asset` (the live write path) and the schema V3 → V4
/// migration (backfilling legacy pre-index entries from payment history),
/// so both paths agree on exactly one rule for "is this pair indexed yet".
pub fn backfill_allowlist_index(env: &Env, code: &String, issuer: &String) -> bool {
    backfill_allowlist_index_with_decimals(env, code, issuer, 7)
}

/// Index an allowlisted asset and preserve its precision metadata.
pub fn backfill_allowlist_index_with_decimals(
    env: &Env,
    code: &String,
    issuer: &String,
    decimals: u32,
) -> bool {
    let index_key = DataKey::AllowListIndex(code.clone(), issuer.clone());
    if env.storage().persistent().has(&index_key) {
        env.storage()
            .persistent()
            .extend_ttl(&index_key, MIN_TTL, BUMP_TTL);
        return false;
    }

    let slot = get_allowlist_log_count(env);
    let log_key = DataKey::AllowListLog(slot);
    let entry = AllowlistEntry {
        code: code.clone(),
        issuer: issuer.clone(),
        decimals,
    };
    env.storage().persistent().set(&log_key, &entry);
    env.storage()
        .persistent()
        .extend_ttl(&log_key, MIN_TTL, BUMP_TTL);

    env.storage().persistent().set(&index_key, &slot);
    env.storage()
        .persistent()
        .extend_ttl(&index_key, MIN_TTL, BUMP_TTL);

    set_allowlist_log_count(env, slot + 1);
    bump_allowlist_count(env);
    true
}

/// Return the number of **currently-allowlisted** assets. Bumps instance TTL.
///
/// This is the count `allowed_assets` callers should use to size their
/// paging and detect drift — it decrements on `revoke_asset`, unlike the
/// log's own write-order length (see `AllowListLogCount`).
pub fn get_allowlist_count(env: &Env) -> u32 {
    let count = env
        .storage()
        .instance()
        .get(&DataKey::AllowListCount)
        .unwrap_or(0u32);
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
    count
}

fn bump_allowlist_count(env: &Env) {
    let count = get_allowlist_count(env);
    env.storage()
        .instance()
        .set(&DataKey::AllowListCount, &(count + 1u32));
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
}

fn decrement_allowlist_count(env: &Env) {
    let count = get_allowlist_count(env);
    env.storage()
        .instance()
        .set(&DataKey::AllowListCount, &count.saturating_sub(1));
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
}

/// Return the write-order length of `AllowListLog` (the next slot index to
/// assign). Bumps instance TTL. Only grows — see the field doc on
/// `DataKey::AllowListLogCount`.
fn get_allowlist_log_count(env: &Env) -> u32 {
    let count = env
        .storage()
        .instance()
        .get(&DataKey::AllowListLogCount)
        .unwrap_or(0u32);
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
    count
}

fn set_allowlist_log_count(env: &Env, count: u32) {
    env.storage()
        .instance()
        .set(&DataKey::AllowListLogCount, &count);
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
}

/// Look up the allowlist log entry at write-order `slot`. Extends
/// persistent TTL if the entry exists.
fn get_allowlist_log_entry(env: &Env, slot: u32) -> Option<AllowlistEntry> {
    let key = DataKey::AllowListLog(slot);
    let entry: Option<AllowlistEntry> = env.storage().persistent().get(&key);
    if entry.is_some() {
        env.storage()
            .persistent()
            .extend_ttl(&key, MIN_TTL, BUMP_TTL);
    }
    entry
}

/// Read a bounded page of the currently-allowlisted assets starting at
/// `cursor`.
///
/// Mirrors [`get_payment_history_page`]/[`get_settlement_ref_page`]'s
/// gap-skipping and termination guarantees: a revoked (or, on a legacy
/// deployment, not-yet-backfilled) slot is skipped rather than treated as
/// the end of the log, so `index` always advances by at least one slot per
/// iteration and `next_cursor` can never repeat a `cursor` the caller
/// already passed in. `has_more` reflects whether any slot at or after
/// `next_cursor` remains to be scanned.
///
/// Extends instance TTL for the counters and persistent TTL for entries read.
pub fn get_allowlist_page(env: &Env, cursor: u32, limit: u32) -> AllowlistPage {
    let total = get_allowlist_log_count(env);
    let capped_limit = core::cmp::min(limit, MAX_ALLOWLIST_PAGE_SIZE);
    let start = core::cmp::min(cursor, total);

    let mut records: Vec<AllowlistEntry> = Vec::new(env);
    let mut index = start;
    let mut collected: u32 = 0;
    let mut gaps_skipped: u32 = 0;

    while index < total && collected < capped_limit {
        match get_allowlist_log_entry(env, index) {
            Some(entry) => {
                records.push_back(entry);
                collected += 1;
            }
            None => gaps_skipped += 1,
        }
        index += 1;
    }

    AllowlistPage {
        records,
        next_cursor: index,
        has_more: index < total,
        gaps_skipped,
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
            1 => {
                // V1 → V2: backfill per-payer payment indexes (#445)
                crate::migration::migrate_schema_v1_to_v2(env)?;
            }
            2 => {
                // V2 → V3: backfill settlement_ref → invoice_id mapping (#495)
                crate::migration::migrate_schema_v2_to_v3(env)?;
            }
            3 => {
                // V3 → V4: backfill the allowlist enumeration index (#464)
                crate::migration::migrate_schema_v3_to_v4(env)?;
            }
            4 => {
                // V4 → V5: precision metadata is written by the new paths;
                // pre-existing records retain unknown precision (0).
                crate::migration::migrate_schema_v4_to_v5(env)?;
            }
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
//
// `SettlementRef(ref) -> invoice_id` resolves a settlement reference back to
// the invoice that consumed it (issue #495) — previously this key stored a
// unit value (existence only), so `SettlementRefAlreadyUsed` told a caller
// *that* a reference was taken but nothing about *what* took it. That made a
// benign retry (the same invoice re-anchoring after a transient failure)
// indistinguishable from a genuine reconciliation conflict (a different
// invoice claiming the same reference). `get_settlement_ref_owner` closes
// that gap: a caller who gets `SettlementRefAlreadyUsed` can look up the
// owner and compare it to the invoice_id they just attempted.
//
// `SettlementRefLog` / `SettlementRefCount` add a write-order enumeration
// index (mirroring `PaymentLog` / `PaymentCount`) so the reference set can be
// paginated for audit and reconciliation, the same write-only-storage gap
// already closed for the asset allowlist (issue #464).
//
// ## No admin-gated correction path
//
// A reference recorded in error (e.g. a duplicate resurfaced by a migration
// bug) has no on-chain removal or reassignment method, by design. An
// admin-callable "unmark this settlement reference" primitive would let a
// compromised or careless admin key quietly sever the exact link this
// guarantee exists to protect — the reference-to-invoice mapping is meant to
// be independently verifiable audit evidence, not admin-editable state.
// Correcting a genuinely bad entry is a data-integrity event, not a routine
// operation: it should go through the same reviewed path as any other
// storage-shape fix — a new schema version and migration, exactly like the
// `migrate_schema_v2_to_v3` backfill below — so the correction itself is
// auditable rather than silent.

/// Key for the settlement-reference → invoice_id mapping in persistent
/// storage.
fn settlement_ref_key(ref_str: &String) -> DataKey {
    DataKey::SettlementRef(ref_str.clone())
}

fn settlement_ref_log_key(index: u32) -> DataKey {
    DataKey::SettlementRefLog(index)
}

/// Returns `true` if a settlement reference has already been recorded.
/// Extends persistent storage TTL if the entry exists.
pub fn is_settlement_ref_used(env: &Env, ref_str: &String) -> bool {
    let key = settlement_ref_key(ref_str);
    let used = env.storage().persistent().has(&key);
    if used {
        env.storage()
            .persistent()
            .extend_ttl(&key, MIN_TTL, BUMP_TTL);
    }
    used
}

/// Resolve a settlement reference to the invoice_id that consumed it.
/// Extends persistent storage TTL if the entry exists.
///
/// Returns `None` when the reference has never been recorded — a plain,
/// unambiguous "not found" result rather than an error, since an unused
/// reference is a normal, expected outcome for this read (see
/// `InvoicePaymentContract::settlement_ref_owner` in `lib.rs`).
pub fn get_settlement_ref_owner(env: &Env, ref_str: &String) -> Option<String> {
    let key = settlement_ref_key(ref_str);
    let owner: Option<String> = env.storage().persistent().get(&key);
    if owner.is_some() {
        env.storage()
            .persistent()
            .extend_ttl(&key, MIN_TTL, BUMP_TTL);
    }
    owner
}

/// Record `ref_str` as used by `invoice_id`: write the owner mapping, extend
/// its TTL, and append it to the write-order enumeration log.
///
/// # Unconditional overwrite — check before calling
/// This function does **not** check for an existing entry and does **not**
/// panic on one — it always silently overwrites the owner mapping and
/// appends a new log entry. Calling it on a reference that is already used
/// will replace the existing owner with `invoice_id`, breaking the
/// global-uniqueness guarantee this index exists to provide. Callers must
/// check first via [`is_settlement_ref_used`] / [`get_settlement_ref_owner`]
/// and decide whether an existing entry should be preserved (see
/// `migrate_settlement_refs`'s conflict-skip logic for an example) or is
/// safe to intentionally overwrite (see `migrate_schema_v2_to_v3`'s
/// value-shape backfill for an example).
pub fn record_settlement_ref(env: &Env, ref_str: &String, invoice_id: &String) {
    let key = settlement_ref_key(ref_str);
    env.storage().persistent().set(&key, invoice_id);
    env.storage()
        .persistent()
        .extend_ttl(&key, MIN_TTL, BUMP_TTL);

    append_settlement_ref_log(env, ref_str, invoice_id);
    bump_settlement_ref_count(env);
}

/// Append a settlement-reference entry to the write-order enumeration log.
fn append_settlement_ref_log(env: &Env, ref_str: &String, invoice_id: &String) {
    let index = get_settlement_ref_count(env);
    let key = settlement_ref_log_key(index);
    let entry = SettlementRefEntry {
        settlement_ref: ref_str.clone(),
        invoice_id: invoice_id.clone(),
    };
    env.storage().persistent().set(&key, &entry);
    env.storage()
        .persistent()
        .extend_ttl(&key, MIN_TTL, BUMP_TTL);
}

/// Return the number of settlement references recorded. Bumps instance TTL.
pub fn get_settlement_ref_count(env: &Env) -> u32 {
    let count = env
        .storage()
        .instance()
        .get(&DataKey::SettlementRefCount)
        .unwrap_or(0u32);
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
    count
}

/// Increment the settlement-reference counter and extend instance TTL.
fn bump_settlement_ref_count(env: &Env) {
    let count = get_settlement_ref_count(env);
    env.storage()
        .instance()
        .set(&DataKey::SettlementRefCount, &(count + 1u32));
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
}

/// Set the settlement-reference counter directly. Used by
/// `migration::migrate_schema_v2_to_v3` to reset the enumeration log before
/// rebuilding it from the payment log, so re-running that migration step
/// never leaves duplicate log entries behind.
pub fn set_settlement_ref_count(env: &Env, count: u32) {
    env.storage()
        .instance()
        .set(&DataKey::SettlementRefCount, &count);
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
}

/// Look up the settlement-reference log entry at write-order `index`.
/// Extends persistent TTL if the entry exists.
fn get_settlement_ref_log_entry(env: &Env, index: u32) -> Option<SettlementRefEntry> {
    let key = settlement_ref_log_key(index);
    let entry: Option<SettlementRefEntry> = env.storage().persistent().get(&key);
    if entry.is_some() {
        env.storage()
            .persistent()
            .extend_ttl(&key, MIN_TTL, BUMP_TTL);
    }
    entry
}

/// Read a bounded page of the settlement-reference index starting at
/// `cursor`.
///
/// Mirrors [`get_payment_history_page`]'s gap-skipping and termination
/// guarantees: a missing slot (e.g. a partially-rebuilt index) is skipped
/// rather than treated as the end of the index, so `index` always advances
/// by at least one slot per iteration and `next_cursor` can never repeat a
/// `cursor` the caller already passed in. `has_more` reflects whether any
/// slot at or after `next_cursor` remains to be scanned.
///
/// Extends instance TTL for the count and persistent TTL for entries read.
pub fn get_settlement_ref_page(env: &Env, cursor: u32, limit: u32) -> SettlementRefPage {
    let total = get_settlement_ref_count(env);
    let capped_limit = core::cmp::min(limit, MAX_SETTLEMENT_REF_PAGE_SIZE);
    let start = core::cmp::min(cursor, total);

    let mut records: Vec<SettlementRefEntry> = Vec::new(env);
    let mut index = start;
    let mut collected: u32 = 0;
    let mut gaps_skipped: u32 = 0;

    while index < total && collected < capped_limit {
        match get_settlement_ref_log_entry(env, index) {
            Some(entry) => {
                records.push_back(entry);
                collected += 1;
            }
            None => gaps_skipped += 1,
        }
        index += 1;
    }

    SettlementRefPage {
        records,
        next_cursor: index,
        has_more: index < total,
        gaps_skipped,
    }
}
