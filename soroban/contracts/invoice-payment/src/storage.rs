use crate::errors::ContractError;
use crate::events;
use soroban_sdk::{contracttype, Address, Env, String, TryFromVal, Val, Vec};

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
/// V6 types the token issuer as [`Address`] in `Asset::Token`, the
/// allowlist key, and the allowlist enumeration log, so a malformed or
/// case/whitespace-variant issuer cannot be stored. Pre-V6 records and
/// allowlist entries used a raw `String` issuer; `migrate_schema_v5_to_v6`
/// rewrites every recoverable entry, and `get_payment` / `is_asset_allowed`
/// still fall back to the string-keyed shape until that rewrite lands.
/// Sequenced after the WASM `upgrade()` path (issue #444): pause → upgrade
/// WASM → `upgrade_storage` (this step, chunked like issue #480 when the
/// payment log is large) → verify → unpause.
///
/// **Maintenance note:** each migration step function stamps
/// `ContractMeta.storage_schema_version` with the fixed constant for the
/// version *it* reaches (e.g. `migrate_schema_v1_to_v2` stamps
/// `STORAGE_SCHEMA_V2`), never this constant directly — `upgrade_storage_schema`
/// is what stamps `STORAGE_SCHEMA_VERSION` once every step up to the final
/// target has run. If you add a new final step (e.g. V6 → V7), change the
/// previous final step to stamp its own fixed constant instead of this one.
pub const STORAGE_SCHEMA_VERSION: u32 = 6;

/// Schema version that introduced `ContractMeta` + `PaymentV1` keys.
pub const STORAGE_SCHEMA_V1: u32 = 1;

/// Schema version that originally introduced the per-payer payment index
/// (`PayerPaymentCount` / `PayerPaymentIdx`, issue #445). That index and the
/// `payments_by_payer` read method it backed were removed entirely (issue
/// #512) — a permissionless enumerable per-payer payment history was the
/// sharpest privacy disclosure the contract made. The V2 schema number is
/// kept as-is (never renumbered) purely so the V1→V2→V3→V4 upgrade chain
/// stays intact for already-deployed contracts; `migrate_schema_v1_to_v2`
/// no longer builds a payer index, just repairs the shared history index if
/// needed.
pub const STORAGE_SCHEMA_V2: u32 = 2;

/// Schema version that changed what `DataKey::SettlementRef(ref)` stores:
/// previously a unit value marking the reference as "used", now the
/// invoice_id that consumed it, so `settlement_ref_owner` can resolve a
/// reference back to its owning invoice. See issue #495.
pub const STORAGE_SCHEMA_V3: u32 = 3;

/// Schema version that introduced precision on payment records and allowlist
/// entries. Legacy records are not assigned a guessed scale by migration.
pub const STORAGE_SCHEMA_V4: u32 = 4;

/// Schema version that recorded precision metadata on the live write path
/// without rewriting historical amounts (issue: unknown scale stays `0`).
pub const STORAGE_SCHEMA_V5: u32 = 5;

/// Schema version that typed the token issuer as [`Address`] in stored
/// `Asset::Token` values, allowlist keys, and allowlist log entries.
pub const STORAGE_SCHEMA_V6: u32 = 6;

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

/// Stellar strkey length for account (`G...`) and contract (`C...`) addresses.
pub const STELLAR_STRKEY_LEN: u32 = 56;

/// Maximum number of payment-log slots rewritten in one
/// [`crate::migration::migrate_schema_v5_to_v6`] / `migrate_asset_issuers`
/// invocation. Mirrors [`MAX_LEGACY_MIGRATION_BATCH`]: each slot can cost
/// several footprint entries (read the current record, write the Address-
/// typed record, rewrite the matching history slot, migrate an allowlist
/// key). Split a larger backlog across multiple `upgrade_storage` calls —
/// the step is resumable via [`DataKey::IssuerMigrationCursor`] (issue #480).
pub const MAX_ISSUER_MIGRATION_BATCH: u32 = 20;

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

/// Parse a stored issuer string into a Stellar [`Address`] without trapping
/// on garbage.
///
/// Classic-asset issuers are account addresses: `G` followed by 55 characters
/// of the Stellar base32 alphabet (`A`–`Z`, `2`–`7`), 56 characters total.
/// Anything else — empty, whitespace, a lowercase/mixed-case variant, a
/// truncated key, `"not-an-address"` — returns `None` so a migration can skip
/// it instead of aborting the whole upgrade. Address construction itself is
/// canonical: two strings that pass this check and represent the same
/// account compare equal as [`Address`] values, so the allowlist key no
/// longer depends on the caller's spelling.
pub fn try_parse_issuer_address(issuer: &String) -> Option<Address> {
    let len = issuer.len() as usize;
    if len != STELLAR_STRKEY_LEN as usize {
        return None;
    }
    let mut buf = [0u8; STELLAR_STRKEY_LEN as usize];
    issuer.copy_into_slice(&mut buf);
    if buf[0] != b'G' {
        return None;
    }
    if !buf.iter().all(|b| matches!(*b, b'A'..=b'Z' | b'2'..=b'7')) {
        return None;
    }
    Some(Address::from_string(issuer))
}

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
    /// Legacy (pre-schema-V6) allowlist entry keyed by a raw issuer
    /// *string*. Kept so `migrate_schema_v5_to_v6` and the dual-read
    /// fallback in [`is_asset_allowed`] can still find keys written before
    /// the issuer was typed as [`Address`]. New writes use [`Self::AllowListV6`].
    AllowList(String, String),
    /// Allowlist entry for a token in **persistent** storage, keyed by a
    /// validated issuer [`Address`]. Key: `AllowListV6(asset_code, issuer)`.
    AllowListV6(String, Address),
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
    ///
    /// Pre-schema-V6 this was keyed by a raw issuer string; that shape is
    /// kept as this variant. New writes use [`Self::AllowListIndexV6`].
    AllowListIndex(String, String),
    /// Schema-V6 reverse index, keyed by a validated issuer [`Address`].
    AllowListIndexV6(String, Address),
    /// Resume cursor for the V5 → V6 issuer-address rewrite (next
    /// `PaymentLog` index to process). Instance storage. See
    /// [`MAX_ISSUER_MIGRATION_BATCH`].
    IssuerMigrationCursor,
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
/// Native XLM and issued tokens are distinguished *structurally* — there is
/// no empty-issuer field that signals native. `Native` has no issuer at all;
/// `Token` carries a validated Stellar [`Address`], so a malformed or
/// case/whitespace-variant issuer cannot be constructed, stored, or used as
/// an allowlist key.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum Asset {
    /// Native XLM. No issuer — the absence is the type, not an empty string.
    Native,
    /// Stellar-issued token with code and issuer.
    /// Format: (asset_code, issuer_address)
    /// Example: ("USDC", GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5)
    Token(String, Address),
}

/// Pre-schema-V6 `Asset` wire shape: the issuer was an unvalidated `String`.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub(crate) enum LegacyAsset {
    Native,
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

    /// A SHA-256 **commitment** of the settlement reference the backend
    /// supplied to `record_payment`, not the plaintext reference itself
    /// (issue #512).
    ///
    /// `record_payment` still validates the plaintext it receives (non-empty,
    /// at most [`MAX_SETTLEMENT_REF_LEN`] characters, canonical form — see
    /// [`is_canonical_identifier`]) before hashing it via
    /// [`commit_settlement_ref`]; only the resulting 64-hex-char digest is
    /// stored here. This keeps the on-chain record from linking straight to
    /// the payer's full Horizon transaction history through a block
    /// explorer, while the backend — which already holds the plaintext it
    /// generated — can still deduplicate or verify by hashing its own copy
    /// and comparing, or by calling [`crate::InvoicePaymentContract::settlement_ref_owner`]
    /// with the plaintext directly. The raw reference is **not** recoverable
    /// from what's stored on-chain.
    ///
    /// Records written before this change stored the plaintext value
    /// directly; that data is already public and permanently so — see the
    /// "Disclosure guarantee" / permanence notes in the module docs and
    /// `soroban/contracts/invoice-payment/README.md`.
    pub settlement_ref: String,
}

/// V4 wire shape retained so pre-precision records remain readable after the
/// schema upgrade. The conversion deliberately marks their scale unknown.
/// The asset here is the current [`Asset`] (Address-typed issuer); a
/// still-unmigrated pre-V6 record is decoded via [`LegacyStringIssuerPayment`]
/// / [`LegacyStringIssuerPaymentNoDecimals`] instead.
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

/// Pre-schema-V6 payment record: `Asset::Token` carried a `String` issuer,
/// with `asset_decimals` present (schema V5 shape).
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct LegacyStringIssuerPayment {
    pub(crate) invoice_id: String,
    pub(crate) payer: Address,
    pub(crate) asset: LegacyAsset,
    pub(crate) amount: i128,
    pub(crate) asset_decimals: u32,
    pub(crate) timestamp: u64,
    pub(crate) settlement_ref: String,
}

/// Pre-precision, pre-V6 payment record: string issuer and no decimals.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
struct LegacyStringIssuerPaymentNoDecimals {
    invoice_id: String,
    payer: Address,
    asset: LegacyAsset,
    amount: i128,
    timestamp: u64,
    settlement_ref: String,
}

fn upgrade_legacy_asset(asset: LegacyAsset) -> Option<Asset> {
    match asset {
        LegacyAsset::Native => Some(Asset::Native),
        LegacyAsset::Token(code, issuer) => {
            try_parse_issuer_address(&issuer).map(|addr| Asset::Token(code, addr))
        },
    }
}

fn try_read_persistent<T>(env: &Env, key: &DataKey) -> Option<T>
where
    T: TryFromVal<Env, Val>,
{
    // Persistent::get unwraps ConversionError. Fetch the raw Val first so a
    // pre-V6 String-issuer record can fall through instead of trapping.
    let raw: Option<Val> = env.storage().persistent().get(key);
    raw.and_then(|v| T::try_from_val(env, &v).ok())
}

fn read_payment_value(env: &Env, key: &DataKey) -> Option<PaymentRecord> {
    if let Some(record) = try_read_persistent::<PaymentRecord>(env, key) {
        return Some(record);
    }

    if let Some(legacy) = try_read_persistent::<LegacyStringIssuerPayment>(env, key) {
        let asset = upgrade_legacy_asset(legacy.asset)?;
        return Some(PaymentRecord {
            invoice_id: legacy.invoice_id,
            payer: legacy.payer,
            asset,
            amount: legacy.amount,
            asset_decimals: legacy.asset_decimals,
            timestamp: legacy.timestamp,
            settlement_ref: legacy.settlement_ref,
        });
    }

    if let Some(legacy) = try_read_persistent::<LegacyStringIssuerPaymentNoDecimals>(env, key) {
        let asset = upgrade_legacy_asset(legacy.asset)?;
        return Some(PaymentRecord {
            invoice_id: legacy.invoice_id,
            payer: legacy.payer,
            asset,
            amount: legacy.amount,
            asset_decimals: 0,
            timestamp: legacy.timestamp,
            settlement_ref: legacy.settlement_ref,
        });
    }

    try_read_persistent::<LegacyPaymentRecord>(env, key).map(|legacy| PaymentRecord {
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
    /// The SHA-256 commitment of the plaintext settlement reference — see
    /// [`commit_settlement_ref`] and `PaymentRecord::settlement_ref`. Never
    /// the plaintext itself.
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
    pub issuer: Address,
    /// Decimal places recorded when the asset was allowlisted.
    pub decimals: u32,
}

/// Pre-schema-V6 allowlist log entry: issuer was an unvalidated `String`.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct LegacyAllowlistEntry {
    code: String,
    issuer: String,
    decimals: u32,
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
        },
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
        },
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
        },
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
            },
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
///
/// Looks up the schema-V6 Address-typed key first, then falls back to the
/// pre-V6 string-keyed entry using the issuer's canonical strkey. That
/// fallback is what keeps `record_payment` working in the window between
/// WASM upgrade and the V5 → V6 storage rewrite.
pub fn is_asset_allowed(env: &Env, code: &String, issuer: &Address) -> bool {
    let v6_key = DataKey::AllowListV6(code.clone(), issuer.clone());
    if env.storage().persistent().has(&v6_key) {
        env.storage()
            .persistent()
            .extend_ttl(&v6_key, MIN_TTL, BUMP_TTL);
        return true;
    }
    let legacy_key = DataKey::AllowList(code.clone(), issuer.to_string());
    let exists = env.storage().persistent().has(&legacy_key);
    if exists {
        env.storage()
            .persistent()
            .extend_ttl(&legacy_key, MIN_TTL, BUMP_TTL);
    }
    exists
}

/// Return the recorded precision for an allowlisted token.
pub fn get_asset_decimals(env: &Env, code: &String, issuer: &Address) -> Option<u32> {
    let v6_key = DataKey::AllowListV6(code.clone(), issuer.clone());
    let decimals: Option<u32> = env.storage().persistent().get(&v6_key);
    if decimals.is_some() {
        env.storage()
            .persistent()
            .extend_ttl(&v6_key, MIN_TTL, BUMP_TTL);
        return decimals;
    }
    let legacy_key = DataKey::AllowList(code.clone(), issuer.to_string());
    let decimals: Option<u32> = env.storage().persistent().get(&legacy_key);
    if decimals.is_some() {
        env.storage()
            .persistent()
            .extend_ttl(&legacy_key, MIN_TTL, BUMP_TTL);
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
pub fn allow_asset(env: &Env, code: &String, issuer: &Address) {
    allow_asset_with_decimals(env, code, issuer, 7);
}

/// Add an asset to the allowlist with its declared decimal precision.
pub fn allow_asset_with_decimals(env: &Env, code: &String, issuer: &Address, decimals: u32) {
    let key = DataKey::AllowListV6(code.clone(), issuer.clone());
    env.storage().persistent().set(&key, &decimals);
    env.storage()
        .persistent()
        .extend_ttl(&key, MIN_TTL, BUMP_TTL);

    // Drop a leftover pre-V6 string key if one exists for this pair, so the
    // asset is not stored twice after an allow during the migration window.
    let legacy_key = DataKey::AllowList(code.clone(), issuer.to_string());
    if env.storage().persistent().has(&legacy_key) {
        env.storage().persistent().remove(&legacy_key);
    }

    backfill_allowlist_index_with_decimals(env, code, issuer, decimals);
}

/// Remove an asset from the allowlist.
///
/// Returns `true` if the pair was allowlisted and is now removed, `false`
/// if it was never allowlisted (a safe no-op) — lets the caller (`lib.rs`)
/// decide whether to emit `AssetRevoked`, so revoking a never-allowlisted
/// pair is distinguishable from revoking a real entry (issue #464).
pub fn revoke_asset(env: &Env, code: &String, issuer: &Address) -> bool {
    let v6_key = DataKey::AllowListV6(code.clone(), issuer.clone());
    let legacy_key = DataKey::AllowList(code.clone(), issuer.to_string());
    let had_v6 = env.storage().persistent().has(&v6_key);
    let had_legacy = env.storage().persistent().has(&legacy_key);
    if !had_v6 && !had_legacy {
        return false;
    }
    if had_v6 {
        env.storage().persistent().remove(&v6_key);
    }
    if had_legacy {
        env.storage().persistent().remove(&legacy_key);
    }

    // Remove the pair's enumeration-log entry, if it has one. A currently
    // allowed pair predating schema V4 that has not yet been backfilled
    // (see `migrate_schema_v3_to_v4`) has no `AllowListIndex` entry — that
    // is not an error, just nothing left to remove from the enumeration.
    let index_v6 = DataKey::AllowListIndexV6(code.clone(), issuer.clone());
    let index_legacy = DataKey::AllowListIndex(code.clone(), issuer.to_string());
    let slot: Option<u32> = env
        .storage()
        .persistent()
        .get(&index_v6)
        .or_else(|| env.storage().persistent().get(&index_legacy));
    if let Some(slot) = slot {
        env.storage()
            .persistent()
            .remove(&DataKey::AllowListLog(slot));
        env.storage().persistent().remove(&index_v6);
        env.storage().persistent().remove(&index_legacy);
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
pub fn backfill_allowlist_index(env: &Env, code: &String, issuer: &Address) -> bool {
    backfill_allowlist_index_with_decimals(env, code, issuer, 7)
}

/// Index an allowlisted asset and preserve its precision metadata.
pub fn backfill_allowlist_index_with_decimals(
    env: &Env,
    code: &String,
    issuer: &Address,
    decimals: u32,
) -> bool {
    let index_v6 = DataKey::AllowListIndexV6(code.clone(), issuer.clone());
    let index_legacy = DataKey::AllowListIndex(code.clone(), issuer.to_string());
    if env.storage().persistent().has(&index_v6) {
        env.storage()
            .persistent()
            .extend_ttl(&index_v6, MIN_TTL, BUMP_TTL);
        return false;
    }
    // A pre-V6 index entry already occupies a log slot — promote it rather
    // than appending a duplicate.
    if let Some(slot) = env.storage().persistent().get::<_, u32>(&index_legacy) {
        env.storage().persistent().set(&index_v6, &slot);
        env.storage()
            .persistent()
            .extend_ttl(&index_v6, MIN_TTL, BUMP_TTL);
        env.storage().persistent().remove(&index_legacy);
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

    env.storage().persistent().set(&index_v6, &slot);
    env.storage()
        .persistent()
        .extend_ttl(&index_v6, MIN_TTL, BUMP_TTL);

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
/// persistent TTL if the entry exists. Falls back to a pre-V6 string-issuer
/// log value and upgrades it in memory (the V5 → V6 migration rewrites it
/// in place).
fn get_allowlist_log_entry(env: &Env, slot: u32) -> Option<AllowlistEntry> {
    let key = DataKey::AllowListLog(slot);
    if let Some(entry) = try_read_persistent::<AllowlistEntry>(env, &key) {
        env.storage()
            .persistent()
            .extend_ttl(&key, MIN_TTL, BUMP_TTL);
        return Some(entry);
    }
    match try_read_persistent::<LegacyAllowlistEntry>(env, &key) {
        Some(legacy) => {
            env.storage()
                .persistent()
                .extend_ttl(&key, MIN_TTL, BUMP_TTL);
            try_parse_issuer_address(&legacy.issuer).map(|issuer| AllowlistEntry {
                code: legacy.code,
                issuer,
                decimals: legacy.decimals,
            })
        },
        None => None,
    }
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
            },
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

/// Next `PaymentLog` index the V5 → V6 issuer rewrite should process.
pub fn get_issuer_migration_cursor(env: &Env) -> u32 {
    let cursor = env
        .storage()
        .instance()
        .get(&DataKey::IssuerMigrationCursor)
        .unwrap_or(0u32);
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
    cursor
}

pub fn set_issuer_migration_cursor(env: &Env, cursor: u32) {
    env.storage()
        .instance()
        .set(&DataKey::IssuerMigrationCursor, &cursor);
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
}

/// Copy a pre-V6 `AllowList(code, issuer_string)` entry to
/// `AllowListV6(code, Address)`, migrating the reverse index and log slot
/// with it. Returns `true` when a string-keyed entry was actually moved.
/// Unparseable issuers are left in place (unreachable from the new write
/// path) rather than dropped, so the upgrade never destroys data.
pub fn migrate_legacy_allowlist_pair(env: &Env, code: &String, issuer_str: &String) -> bool {
    let Some(addr) = try_parse_issuer_address(issuer_str) else {
        return false;
    };
    let v6_key = DataKey::AllowListV6(code.clone(), addr.clone());
    let legacy_key = DataKey::AllowList(code.clone(), issuer_str.clone());
    let decimals: Option<u32> = env.storage().persistent().get(&legacy_key);

    if env.storage().persistent().has(&v6_key) {
        if decimals.is_some() {
            env.storage().persistent().remove(&legacy_key);
        }
        migrate_legacy_allowlist_index(env, code, issuer_str, &addr);
        return false;
    }

    let Some(decimals) = decimals else {
        return false;
    };
    env.storage().persistent().set(&v6_key, &decimals);
    env.storage()
        .persistent()
        .extend_ttl(&v6_key, MIN_TTL, BUMP_TTL);
    env.storage().persistent().remove(&legacy_key);
    migrate_legacy_allowlist_index(env, code, issuer_str, &addr);
    true
}

fn migrate_legacy_allowlist_index(env: &Env, code: &String, issuer_str: &String, addr: &Address) {
    let index_v6 = DataKey::AllowListIndexV6(code.clone(), addr.clone());
    let index_legacy = DataKey::AllowListIndex(code.clone(), issuer_str.clone());
    if env.storage().persistent().has(&index_v6) {
        if env.storage().persistent().has(&index_legacy) {
            env.storage().persistent().remove(&index_legacy);
        }
        return;
    }
    if let Some(slot) = env.storage().persistent().get::<_, u32>(&index_legacy) {
        env.storage().persistent().set(&index_v6, &slot);
        env.storage()
            .persistent()
            .extend_ttl(&index_v6, MIN_TTL, BUMP_TTL);
        env.storage().persistent().remove(&index_legacy);
        if let Some(entry) = get_allowlist_log_entry(env, slot) {
            env.storage()
                .persistent()
                .set(&DataKey::AllowListLog(slot), &entry);
            env.storage()
                .persistent()
                .extend_ttl(&DataKey::AllowListLog(slot), MIN_TTL, BUMP_TTL);
        }
    }
}

/// Rewrite one payment record (and its history slot, if any) so a pre-V6
/// string issuer is stored as [`Address`]. Idempotent: a record already in
/// the current shape is written back unchanged.
pub fn rewrite_payment_asset(env: &Env, invoice_id: &String) -> bool {
    let Ok(record) = get_payment(env, invoice_id) else {
        return false;
    };
    set_payment(env, &record);
    true
}

/// Rewrite `PaymentHistory(index)` to the current [`PaymentRecord`] shape.
pub fn rewrite_history_slot(env: &Env, index: u32) -> bool {
    let Some(record) = get_history_record(env, index) else {
        return false;
    };
    let key = payment_history_key(index);
    env.storage().persistent().set(&key, &record);
    env.storage()
        .persistent()
        .extend_ttl(&key, MIN_TTL, BUMP_TTL);
    true
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
            },
            1 => {
                // V1 → V2: backfill per-payer payment indexes (#445)
                crate::migration::migrate_schema_v1_to_v2(env)?;
            },
            2 => {
                // V2 → V3: backfill settlement_ref → invoice_id mapping (#495)
                crate::migration::migrate_schema_v2_to_v3(env)?;
            },
            3 => {
                // V3 → V4: backfill the allowlist enumeration index (#464)
                crate::migration::migrate_schema_v3_to_v4(env)?;
            },
            4 => {
                // V4 → V5: precision metadata is written by the new paths;
                // pre-existing records retain unknown precision (0).
                crate::migration::migrate_schema_v4_to_v5(env)?;
            },
            5 => {
                // V5 → V6: rewrite Token issuers from String to Address
                // in payment records, history slots, and the allowlist.
                crate::migration::migrate_schema_v5_to_v6(env)?;
            },
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

/// Compute the SHA-256 **commitment** of `ref_str`'s UTF-8 bytes, returned as
/// a lowercase hex-encoded [`String`] (64 characters).
///
/// This is what's actually stored/compared for a settlement reference
/// (issue #512) — never the plaintext — so an observer who does not already
/// possess the plaintext reference (e.g. a Horizon transaction hash) cannot
/// recover it from on-chain data and correlate a payment record to the
/// payer's full Stellar transaction history via a block explorer. A caller
/// that already holds the plaintext (the backend that generated it) can
/// still deduplicate/verify by hashing its own copy the same way, or by
/// calling `settlement_ref_owner` with the plaintext directly.
///
/// Uses a heap-allocated buffer sized to `ref_str`'s actual length (not a
/// fixed stack buffer) since this is also reachable from
/// `settlement_ref_owner`, which — unlike `record_payment` — does not bound
/// its input to [`MAX_SETTLEMENT_REF_LEN`] before hashing.
pub fn commit_settlement_ref(env: &Env, ref_str: &String) -> String {
    let len = ref_str.len() as usize;
    let mut buf: alloc::vec::Vec<u8> = alloc::vec![0u8; len];
    ref_str.copy_into_slice(&mut buf[..]);
    let bytes = soroban_sdk::Bytes::from_slice(env, &buf);
    let digest = env.crypto().sha256(&bytes).to_array();

    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut hex_buf = [0u8; 64];
    for (i, byte) in digest.iter().enumerate() {
        hex_buf[i * 2] = HEX[(byte >> 4) as usize];
        hex_buf[i * 2 + 1] = HEX[(byte & 0x0f) as usize];
    }
    let hex_str = core::str::from_utf8(&hex_buf).expect("hex digits are valid utf8");
    String::from_str(env, hex_str)
}

/// Key for the settlement-reference → invoice_id mapping in persistent
/// storage. `ref_str` is the **plaintext** the caller already possesses;
/// this hashes it to the commitment that is actually used as the key.
fn settlement_ref_key(env: &Env, ref_str: &String) -> DataKey {
    DataKey::SettlementRef(commit_settlement_ref(env, ref_str))
}

fn settlement_ref_log_key(index: u32) -> DataKey {
    DataKey::SettlementRefLog(index)
}

/// Returns `true` if a settlement reference has already been recorded.
/// `ref_str` is the plaintext; it is hashed internally to the commitment
/// used as the storage key. Extends persistent storage TTL if the entry
/// exists.
pub fn is_settlement_ref_used(env: &Env, ref_str: &String) -> bool {
    let key = settlement_ref_key(env, ref_str);
    let used = env.storage().persistent().has(&key);
    if used {
        env.storage()
            .persistent()
            .extend_ttl(&key, MIN_TTL, BUMP_TTL);
    }
    used
}

/// Resolve a settlement reference to the invoice_id that consumed it.
/// `ref_str` is the plaintext; it is hashed internally to the commitment
/// used as the storage key. Extends persistent storage TTL if the entry
/// exists.
///
/// Returns `None` when the reference has never been recorded — a plain,
/// unambiguous "not found" result rather than an error, since an unused
/// reference is a normal, expected outcome for this read (see
/// `InvoicePaymentContract::settlement_ref_owner` in `lib.rs`).
pub fn get_settlement_ref_owner(env: &Env, ref_str: &String) -> Option<String> {
    let key = settlement_ref_key(env, ref_str);
    let owner: Option<String> = env.storage().persistent().get(&key);
    if owner.is_some() {
        env.storage()
            .persistent()
            .extend_ttl(&key, MIN_TTL, BUMP_TTL);
    }
    owner
}

/// Record `ref_str` as used by `invoice_id`: write the owner mapping, extend
/// its TTL, and append it to the write-order enumeration log. `ref_str` is
/// the plaintext; it is hashed internally (see [`commit_settlement_ref`]) and
/// the **commitment**, not the plaintext, is what's actually stored — both as
/// the primary key and as the enumeration log entry's `settlement_ref` field.
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
    let commitment = commit_settlement_ref(env, ref_str);
    let key = DataKey::SettlementRef(commitment.clone());
    env.storage().persistent().set(&key, invoice_id);
    env.storage()
        .persistent()
        .extend_ttl(&key, MIN_TTL, BUMP_TTL);

    append_settlement_ref_log(env, &commitment, invoice_id);
    bump_settlement_ref_count(env);
}

/// Append a settlement-reference entry to the write-order enumeration log.
/// `commitment` is already the hashed value — callers pass the same
/// commitment used as the primary key, never the plaintext.
fn append_settlement_ref_log(env: &Env, commitment: &String, invoice_id: &String) {
    let index = get_settlement_ref_count(env);
    let key = settlement_ref_log_key(index);
    let entry = SettlementRefEntry {
        settlement_ref: commitment.clone(),
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
            },
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
