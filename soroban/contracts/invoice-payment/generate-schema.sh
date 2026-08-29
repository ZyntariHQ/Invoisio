#!/usr/bin/env bash
# generate-schema.sh — emit schema.json from the contract's Rust source.
# Run from the contract directory (soroban/contracts/invoice-payment/), or via
# `make schema`.
#
# The `errors` and `methods` sections below are derived directly from
# src/errors.rs and src/lib.rs: this script fails loudly if a contract error
# variant or public method is added, removed, or renamed without a matching
# update here, so schema.json can never silently drift from the contract.
# `types` and event descriptions stay hand-authored (their rich field descriptions
# aren't safely derivable by regex) but this script still fails if the set of
# #[contractevent] structs in src/events.rs no longer matches the EVENT_NAMES
# list below.
#
# Output: schema.json (committed to VCS so schema diffs appear in PRs).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
STORAGE="$SCRIPT_DIR/src/storage.rs"
ERRORS_RS="$SCRIPT_DIR/src/errors.rs"
LIB_RS="$SCRIPT_DIR/src/lib.rs"
EVENTS_RS="$SCRIPT_DIR/src/events.rs"
OUT="$SCRIPT_DIR/schema.json"

fail() {
  echo "ERROR: $1" >&2
  exit 1
}

# Extract version constants from storage.rs
extract() {
  grep -m1 "^pub const $1" "$STORAGE" | sed 's/.*= \([0-9]*\);/\1/'
}

MAJOR=$(extract CONTRACT_VERSION_MAJOR)
MINOR=$(extract CONTRACT_VERSION_MINOR)
PATCH=$(extract CONTRACT_VERSION_PATCH)
SCHEMA_VER=$(extract STORAGE_SCHEMA_VERSION)
CONTRACT_VERSION="${MAJOR}.${MINOR}.${PATCH}"

# ─── Errors ──────────────────────────────────────────────────────────────────
# Source of truth for names/codes is src/errors.rs. Add a description entry
# below whenever a new variant is appended there (never reorder/reuse codes —
# see the doc comment on ContractError).
declare -A ERROR_DESC=(
  [AlreadyInitialized]="initialize() called on an already-initialised contract."
  [NotInitialized]="Admin-gated method called before initialize()."
  [PaymentAlreadyRecorded]="record_payment() called with an invoice_id that was already recorded."
  [PaymentNotFound]="get_payment() called for an invoice_id with no record."
  [InvalidAmount]="amount was zero or negative."
  [InvalidInvoiceId]="invoice_id was an empty string."
  [InvalidAsset]="token code empty, longer than 12 characters, or the reserved code XLM on Asset::Token; native XLM must use Asset::Native. Token issuers are Address values."
  [AssetNotAllowed]="Asset not in the admin-controlled allowlist."
  [Unauthorized]="Caller is not authorized."
  [StorageSchemaTooNew]="Contract code is too old for the current storage schema."
  [StorageSchemaTooOld]="Storage schema is too old and requires migration."
  [ContractPaused]="The contract is paused and write operations are disabled."
  [InvalidSettlementRef]="settlement_ref was empty or exceeded the 128-character maximum."
  [NoPendingAdmin]="accept_admin() called but no admin transfer proposal is pending."
  [PendingAdminExists]="propose_admin() called while an admin transfer proposal is already pending."
  [InvalidProposedAdmin]="propose_admin() called with the current admin (or other invalid address)."
  [HistoryIndexRebuildFailed]="rebuild_history_index() failed to rebuild the payment history index; check storage consistency."
  [MigrationRequired]="rebuild_history_index() was called on a deployment whose storage schema is not yet current; run upgrade_storage() first."
  [HistoryIndexIncomplete]="The payment history index is incomplete and must be rebuilt via rebuild_history_index()."
  [SettlementRefAlreadyUsed]="The settlement reference has already been used for a different invoice; each settlement reference must be globally unique across all payments."
  [MustBePausedForUpgrade]="upgrade() was called while the contract is not paused; the contract must stay paused for the whole upgrade() -> upgrade_storage() window."
  [LegacyPaymentMigrationBatchTooLarge]="migrate_legacy_payments() was called with more invoice_ids than MAX_LEGACY_MIGRATION_BATCH in one call; split the batch across multiple calls."
  [IssuerMigrationIncomplete]="upgrade_storage() rewrote a bounded batch of Token issuers from String to Address and has more payment-log slots left; call upgrade_storage() again while paused."
)

# "Name = code," lines inside the ContractError enum, in declaration order.
mapfile -t ERROR_NAMES < <(grep -oP '^\s{4}\K\w+(?= = \d+,)' "$ERRORS_RS")
[ "${#ERROR_NAMES[@]}" -gt 0 ] || fail "no error variants found in $ERRORS_RS — regex out of date?"

declare -A ERROR_CODE
while IFS= read -r name; do
  code=$(grep -oP "^\s{4}${name} = \K\d+(?=,)" "$ERRORS_RS")
  ERROR_CODE[$name]="$code"
done < <(printf '%s\n' "${ERROR_NAMES[@]}")

for name in "${ERROR_NAMES[@]}"; do
  [ -n "${ERROR_DESC[$name]+x}" ] || fail "src/errors.rs defines '$name' but generate-schema.sh has no ERROR_DESC entry for it. Add one and re-run."
done
for name in "${!ERROR_DESC[@]}"; do
  [ -n "${ERROR_CODE[$name]+x}" ] || fail "generate-schema.sh describes error '$name' but it no longer exists in src/errors.rs. Remove the stale ERROR_DESC entry (never reuse a retired code for a new one)."
done

ERRORS_JSON=""
for i in "${!ERROR_NAMES[@]}"; do
  name="${ERROR_NAMES[$i]}"
  comma=","
  [ "$i" -eq $((${#ERROR_NAMES[@]} - 1)) ] && comma=""
  ERRORS_JSON+="    \"${name}\":   { \"code\": ${ERROR_CODE[$name]}, \"description\": \"${ERROR_DESC[$name]}\" }${comma}
"
done

# ─── Methods ─────────────────────────────────────────────────────────────────
# Source of truth for names is the #[contractimpl] block in src/lib.rs. Add an
# entry below whenever a new public method is added.
declare -A METHOD_AUTH=(
  [initialize]="none"
  [record_payment]="admin"
  [get_payment]="none"
  [has_payment]="none"
  [payment_count]="admin"
  [payment_history]="admin"
  [settlement_ref_owner]="none"
  [settlement_ref_history]="admin"
  [settlement_ref_index_status]="admin"
  [config]="none"
  [contract_version]="none"
  [version_info]="none"
  [admin]="none"
  [pending_admin]="none"
  [propose_admin]="admin"
  [accept_admin]="proposed_admin"
  [cancel_admin_transfer]="admin"
  [allow_asset]="admin"
  [allow_asset_with_decimals]="admin"
  [revoke_asset]="admin"
  [allowed_assets]="none"
  [allowlist_count]="none"
  [set_allow_native]="admin"
  [upgrade]="admin"
  [upgrade_storage]="admin"
  [set_paused]="admin"
  [is_paused]="none"
  [rebuild_history_index]="admin"
  [history_index_status]="admin"
  [migrate_legacy_payments]="admin"
)
declare -A METHOD_DESC=(
  [initialize]="One-time setup; sets the admin."
  [record_payment]="Persist PaymentRecord + emit InvoicePaymentRecorded. asset is Asset::Native or Asset::Token(code, Address)."
  [get_payment]="Return PaymentRecord for invoice_id."
  [has_payment]="Return true if a payment exists for invoice_id."
  [payment_count]="Admin-gated (issue #512): return total recorded payment count."
  [payment_history]="Admin-gated (issue #512): return a bounded, cursor-paginated PaymentHistoryPage across all payments."
  [settlement_ref_owner]="Resolve a settlement reference (plaintext) to the invoice_id that consumed it; None if unused. Hashes internally to the stored commitment (issue #512)."
  [settlement_ref_history]="Admin-gated (issue #512): return a bounded, cursor-paginated SettlementRefPage of the settlement-reference index in write order. Each entry's settlement_ref is a SHA-256 commitment, not plaintext."
  [settlement_ref_index_status]="Admin-gated (issue #512): return (settlement_ref_count, payment_count, is_consistent) diagnostic status for the settlement-reference index."
  [config]="Return ContractConfig snapshot."
  [contract_version]="Return packed semver as u32."
  [version_info]="Return on-chain ContractMeta."
  [admin]="Return current admin address."
  [pending_admin]="Return the address proposed as next admin, if any."
  [propose_admin]="Step 1 of two-step handoff: propose the next admin."
  [accept_admin]="Step 2 of two-step handoff: accept the role and become admin."
  [cancel_admin_transfer]="Cancel a pending admin transfer proposed via propose_admin()."
  [allow_asset]="Add (code, issuer Address) to allowlist."
  [allow_asset_with_decimals]="Add (code, issuer Address) to allowlist with recorded decimal precision."
  [revoke_asset]="Remove (code, issuer Address) from allowlist."
  [allowed_assets]="Return a bounded, cursor-paginated AllowlistPage of currently-allowlisted (code, issuer) pairs."
  [allowlist_count]="Return the number of currently-allowlisted (code, issuer) pairs."
  [set_allow_native]="Toggle native XLM acceptance."
  [upgrade]="Upgrade the deployed contract WASM in place. Requires the contract to already be paused."
  [upgrade_storage]="Explicitly upgrade storage schema to current version."
  [set_paused]="Pause or unpause the contract. Writes rejected when paused."
  [is_paused]="Return true if the contract is currently paused."
  [rebuild_history_index]="Rebuild the payment history index from existing records after a corruption or incomplete migration."
  [history_index_status]="Admin-gated (issue #512): return (history_count, payment_count, is_consistent) diagnostic status for the history index."
  [migrate_legacy_payments]="Migrate a caller-supplied, bounded batch of legacy Payment(invoice_id) keys to PaymentV1, removing each legacy entry as it migrates. Returns (migrated, already_current, not_found)."
)

# "pub fn name(" lines inside the #[contractimpl] block, in declaration order.
mapfile -t METHOD_NAMES < <(grep -oP '^\s{4}pub fn \K\w+(?=\()' "$LIB_RS")
[ "${#METHOD_NAMES[@]}" -gt 0 ] || fail "no public methods found in $LIB_RS — regex out of date?"

for name in "${METHOD_NAMES[@]}"; do
  [ -n "${METHOD_DESC[$name]+x}" ] || fail "src/lib.rs defines pub fn '$name' but generate-schema.sh has no METHOD_DESC/METHOD_AUTH entry for it. Add one and re-run."
  [ -n "${METHOD_AUTH[$name]+x}" ] || fail "src/lib.rs defines pub fn '$name' but generate-schema.sh has no METHOD_AUTH entry for it. Add one and re-run."
done
for name in "${!METHOD_DESC[@]}"; do
  grep -qx "$name" <(printf '%s\n' "${METHOD_NAMES[@]}") || fail "generate-schema.sh describes method '$name' but it no longer exists in src/lib.rs. Remove the stale METHOD_DESC/METHOD_AUTH entries."
done

METHODS_JSON=""
for i in "${!METHOD_NAMES[@]}"; do
  name="${METHOD_NAMES[$i]}"
  comma=","
  [ "$i" -eq $((${#METHOD_NAMES[@]} - 1)) ] && comma=""
  METHODS_JSON+="    \"${name}\": { \"auth\": \"${METHOD_AUTH[$name]}\", \"description\": \"${METHOD_DESC[$name]}\" }${comma}
"
done

# ─── Events ──────────────────────────────────────────────────────────────────
# Fields/descriptions are hand-authored below (rich enough that regex
# generation isn't reliable), but the *set* of events is still checked
# against every #[contractevent] struct in src/events.rs.
EVENT_NAMES=(
  InvoicePaymentRecorded AssetAllowlisted AssetRevoked NativeAllowChanged
  StorageSchemaUpgraded ContractPaused AdminTransferProposed AdminTransferAccepted
  AdminTransferCancelled HistoryIndexRebuilt SettlementRefsMigrated ContractUpgraded
  AllowlistIndexBackfilled IssuersMigrated LegacyPaymentsMigrated
)
mapfile -t EVENTS_RS_NAMES < <(grep -B1 '^pub struct \w\+ {' "$EVENTS_RS" | grep -oP '^pub struct \K\w+(?= \{)')
[ "${#EVENTS_RS_NAMES[@]}" -gt 0 ] || fail "no #[contractevent] structs found in $EVENTS_RS — regex out of date?"

for name in "${EVENTS_RS_NAMES[@]}"; do
  printf '%s\n' "${EVENT_NAMES[@]}" | grep -qx "$name" || fail "src/events.rs defines event struct '$name' but generate-schema.sh's EVENT_NAMES list doesn't include it. Add a fields/description block for it and re-run."
done
for name in "${EVENT_NAMES[@]}"; do
  printf '%s\n' "${EVENTS_RS_NAMES[@]}" | grep -qx "$name" || fail "generate-schema.sh's EVENT_NAMES list includes '$name' but it no longer exists in src/events.rs. Remove the stale block."
done

cat > "$OUT" <<JSON
{
  "\$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Invoisio Invoice Payment Contract Schema",
  "description": "Machine-readable schema for the invoice-payment Soroban contract. Generated from Rust types — do not edit manually. Re-generate with: make schema",
  "contract_version": "${CONTRACT_VERSION}",
  "storage_schema_version": ${SCHEMA_VER},
  "types": {
    "Asset": {
      "description": "Asset type: native XLM or a Stellar-issued token.",
      "oneOf": [
        {
          "type": "object",
          "title": "Native",
          "description": "Native XLM. No issuer.",
          "properties": {
            "tag": { "const": "Native" }
          },
          "required": ["tag"],
          "additionalProperties": false
        },
        {
          "type": "object",
          "title": "Token",
          "description": "Stellar-issued token identified by code and issuer.",
          "properties": {
            "tag":    { "const": "Token" },
            "code":   { "type": "string", "description": "Asset code (e.g. USDC)." },
            "issuer": { "type": "string", "description": "Validated Stellar issuer Address (G...), not an untyped string." }
          },
          "required": ["tag", "code", "issuer"],
          "additionalProperties": false
        }
      ]
    },
    "PaymentRecord": {
      "description": "On-chain snapshot of a single recorded invoice payment.",
      "type": "object",
      "properties": {
        "invoice_id": {
          "type": "string",
          "description": "Unique invoice identifier (e.g. invoisio-abc123). Matches the native Stellar Payment memo."
        },
        "payer": {
          "type": "string",
          "description": "Stellar account address (G...) that sent the payment."
        },
        "asset": {
          "\$ref": "#/types/Asset",
          "description": "Asset used for payment."
        },
        "amount": {
          "type": "integer",
          "description": "Payment amount in the asset's smallest unit. Interpret using asset_decimals. Must be > 0.",
          "minimum": 1
        },
        "asset_decimals": {
          "type": "integer",
          "description": "Decimal places for the asset; 0 means legacy precision unknown.",
          "minimum": 0,
          "maximum": 18
        },
        "timestamp": {
          "type": "integer",
          "description": "Unix timestamp (seconds) sourced from the ledger at recording time.",
          "minimum": 0
        },
        "settlement_ref": {
          "type": "string",
          "description": "SHA-256 commitment (64-char lowercase hex) of the settlement reference passed to record_payment() — not the plaintext value itself (issue #512). A caller that already holds the plaintext can dedupe/verify by hashing its own copy the same way, or by calling settlement_ref_owner() with the plaintext directly."
        }
      },
      "required": ["invoice_id", "payer", "asset", "amount", "asset_decimals", "timestamp", "settlement_ref"],
      "additionalProperties": false
    },
    "ContractMeta": {
      "description": "Version metadata stored on-chain alongside state.",
      "type": "object",
      "properties": {
        "contract_version": {
          "type": "integer",
          "description": "Packed semver: MAJOR*1_000_000 + MINOR*1_000 + PATCH."
        },
        "storage_schema_version": {
          "type": "integer",
          "description": "Storage layout version. Increment when persistent storage keys or shapes change."
        }
      },
      "required": ["contract_version", "storage_schema_version"],
      "additionalProperties": false
    },
    "AllowlistMode": {
      "description": "Asset allowlist policy for this contract instance. There is no requires_token_allowlist field: every non-native asset always requires allowlisting in this contract, so a field for it would only ever report a constant, never real state. Use allowed_assets()/allowlist_count() to inspect the actual allowlist.",
      "type": "object",
      "properties": {
        "native_allowed": {
          "type": "boolean",
          "description": "Whether native XLM payments are accepted."
        }
      },
      "required": ["native_allowed"],
      "additionalProperties": false
    },
    "ContractConfig": {
      "description": "High-level configuration snapshot returned by config(). Single permissionless call for ops/clients.",
      "type": "object",
      "properties": {
        "admin": {
          "oneOf": [
            { "type": "string", "description": "Admin Stellar account address once initialised." },
            { "type": "null",   "description": "Null before initialize() is called." }
          ]
        },
        "pending_admin": {
          "oneOf": [
            { "type": "string", "description": "Address awaiting acceptance via accept_admin() after propose_admin()." },
            { "type": "null",   "description": "Null when no admin transfer is in flight." }
          ]
        },
        "initialized": {
          "type": "boolean",
          "description": "True once initialize(admin) has completed."
        },
        "version":        { "\$ref": "#/types/ContractMeta" },
        "allowlist_mode": { "\$ref": "#/types/AllowlistMode" },
        "paused": {
          "type": "boolean",
          "description": "Whether the contract is currently paused (writes disabled)."
        }
      },
      "required": ["admin", "pending_admin", "initialized", "version", "allowlist_mode", "paused"],
      "additionalProperties": false
    },
    "PaymentHistoryPage": {
      "description": "Bounded, cursor-friendly slice of payment history returned by payment_history() (admin-gated, issue #512).",
      "type": "object",
      "properties": {
        "records": {
          "type": "array",
          "items": { "\$ref": "#/types/PaymentRecord" },
          "description": "Records returned for this page."
        },
        "next_cursor": {
          "type": "integer",
          "description": "Cursor to pass to the next call.",
          "minimum": 0
        },
        "has_more": {
          "type": "boolean",
          "description": "True when more entries are available after next_cursor."
        }
      },
      "required": ["records", "next_cursor", "has_more"],
      "additionalProperties": false
    },
    "SettlementRefEntry": {
      "description": "A single settlement-reference to invoice_id mapping, as recorded by record_payment() or backfilled by migration.",
      "type": "object",
      "properties": {
        "settlement_ref": {
          "type": "string",
          "description": "SHA-256 commitment of the settlement reference — never the plaintext (issue #512)."
        },
        "invoice_id": {
          "type": "string",
          "description": "Invoice ID that consumed this settlement reference."
        }
      },
      "required": ["settlement_ref", "invoice_id"],
      "additionalProperties": false
    },
    "SettlementRefPage": {
      "description": "Bounded, cursor-friendly slice of the settlement-reference index returned by settlement_ref_history() (admin-gated, issue #512). Mirrors PaymentHistoryPage's pagination and gap-skipping conventions.",
      "type": "object",
      "properties": {
        "records": {
          "type": "array",
          "items": { "\$ref": "#/types/SettlementRefEntry" },
          "description": "Entries returned for this page, in write order."
        },
        "next_cursor": {
          "type": "integer",
          "description": "Cursor to pass to the next call.",
          "minimum": 0
        },
        "has_more": {
          "type": "boolean",
          "description": "True when more entries are available after next_cursor."
        },
        "gaps_skipped": {
          "type": "integer",
          "description": "Number of index slots in this page's range that were expected to hold an entry but did not (e.g. a corrupted or partially-rebuilt index). Always 0 for a healthy index.",
          "minimum": 0
        }
      },
      "required": ["records", "next_cursor", "has_more", "gaps_skipped"],
      "additionalProperties": false
    },
    "AllowlistEntry": {
      "description": "A single allowlisted (code, issuer) pair, as recorded by allow_asset() or backfilled by migration.",
      "type": "object",
      "properties": {
        "code": {
          "type": "string",
          "description": "Asset code (e.g. USDC)."
        },
        "issuer": {
          "type": "string",
          "description": "Issuer Stellar Address (G...), not an untyped string."
        },
        "decimals": {
          "type": "integer",
          "description": "Decimal places recorded for the asset.",
          "minimum": 0,
          "maximum": 18
        }
      },
      "required": ["code", "issuer", "decimals"],
      "additionalProperties": false
    },
    "AllowlistPage": {
      "description": "Bounded, cursor-friendly slice of the currently-allowlisted assets returned by allowed_assets(). Mirrors PaymentHistoryPage's pagination and gap-skipping conventions, except a hole here is a normal outcome of revoke_asset(), not only a sign of corruption.",
      "type": "object",
      "properties": {
        "records": {
          "type": "array",
          "items": { "\$ref": "#/types/AllowlistEntry" },
          "description": "Entries returned for this page, in write (allow) order."
        },
        "next_cursor": {
          "type": "integer",
          "description": "Cursor to pass to the next call.",
          "minimum": 0
        },
        "has_more": {
          "type": "boolean",
          "description": "True when more entries are available after next_cursor."
        },
        "gaps_skipped": {
          "type": "integer",
          "description": "Number of log slots in this page's range that have been revoked (or, on a legacy pre-migration deployment, not yet backfilled).",
          "minimum": 0
        }
      },
      "required": ["records", "next_cursor", "has_more", "gaps_skipped"],
      "additionalProperties": false
    }
  },
  "events": {
    "InvoicePaymentRecorded": {
      "description": "Emitted by record_payment(). As of issue #512 this is minimized to signal only that an invoice_id was recorded — no payer, asset, amount, or settlement_ref. A consumer that needs the full record must already know invoice_id and call get_payment(invoice_id).",
      "topic": "invoice_payment_recorded",
      "fields": {
        "schema_version": { "type": "integer", "description": "Event payload schema version.", "minimum": 1 },
        "invoice_id":     { "type": "string",  "description": "Unique invoice identifier." }
      },
      "required": ["invoice_id", "schema_version"]
    },
    "AssetAllowlisted": {
      "description": "Emitted by allow_asset(). Signals a token was added to the allowlist. issuer is a Stellar Address.",
      "topic": "asset_allowlisted",
      "fields": {
        "schema_version": { "type": "integer", "description": "Event payload schema version.", "minimum": 1 },
        "code":   { "type": "string", "description": "Asset code." },
        "issuer": { "type": "string", "description": "Validated issuer Address (G...)." }
      },
      "required": ["schema_version", "code", "issuer"]
    },
    "AssetRevoked": {
      "description": "Emitted by revoke_asset(). Signals a token was removed from the allowlist. issuer is a Stellar Address.",
      "topic": "asset_revoked",
      "fields": {
        "schema_version": { "type": "integer", "description": "Event payload schema version.", "minimum": 1 },
        "code":   { "type": "string", "description": "Asset code." },
        "issuer": { "type": "string", "description": "Validated issuer Address (G...)." }
      },
      "required": ["schema_version", "code", "issuer"]
    },
    "NativeAllowChanged": {
      "description": "Emitted by set_allow_native(). Signals the XLM allowance flag changed.",
      "topic": "native_allow_changed",
      "fields": {
        "schema_version": { "type": "integer", "description": "Event payload schema version.", "minimum": 1 },
        "allowed": { "type": "boolean", "description": "New value of the native XLM allow flag." }
      },
      "required": ["schema_version", "allowed"]
    },
    "StorageSchemaUpgraded": {
      "description": "Emitted by upgrade_storage(). Signals a storage schema version upgrade.",
      "topic": "storage_schema_upgraded",
      "fields": {
        "schema_version": { "type": "integer", "description": "Event payload schema version.", "minimum": 1 },
        "from_version": { "type": "integer", "description": "Previous schema version." },
        "to_version":   { "type": "integer", "description": "New schema version." },
        "upgraded_at":  { "type": "integer", "description": "Ledger timestamp when upgrade occurred." }
      },
      "required": ["schema_version", "from_version", "to_version", "upgraded_at"]
    },
    "ContractPaused": {
      "description": "Emitted by set_paused(). Signals a pause or unpause state change.",
      "topic": "contract_paused",
      "fields": {
        "schema_version": { "type": "integer", "description": "Event payload schema version.", "minimum": 1 },
        "paused": { "type": "boolean", "description": "New paused state." },
        "triggered_by": { "type": "string", "description": "Admin address that triggered the change." },
        "timestamp": { "type": "integer", "description": "Ledger timestamp when change occurred." }
      },
      "required": ["schema_version", "paused", "triggered_by", "timestamp"]
    },
    "AdminTransferProposed": {
      "description": "Emitted by propose_admin(). Signals step 1 of the two-step admin handoff.",
      "topic": "admin_transfer_proposed",
      "fields": {
        "schema_version": { "type": "integer", "description": "Event payload schema version.", "minimum": 1 },
        "current_admin": { "type": "string", "description": "Admin that initiated the handoff." },
        "new_admin": { "type": "string", "description": "Address proposed to become the next admin." },
        "timestamp": { "type": "integer", "description": "Ledger timestamp when the proposal was made." }
      },
      "required": ["schema_version", "current_admin", "new_admin", "timestamp"]
    },
    "AdminTransferAccepted": {
      "description": "Emitted by accept_admin(). Signals step 2 of the two-step admin handoff — the role has transferred.",
      "topic": "admin_transfer_accepted",
      "fields": {
        "schema_version": { "type": "integer", "description": "Event payload schema version.", "minimum": 1 },
        "previous_admin": { "type": "string", "description": "Admin that relinquished the role." },
        "new_admin": { "type": "string", "description": "Address that accepted and is now the contract admin." },
        "timestamp": { "type": "integer", "description": "Ledger timestamp when the transfer completed." }
      },
      "required": ["schema_version", "previous_admin", "new_admin", "timestamp"]
    },
    "AdminTransferCancelled": {
      "description": "Emitted by cancel_admin_transfer(). Signals a pending admin handoff was revoked before acceptance.",
      "topic": "admin_transfer_cancelled",
      "fields": {
        "schema_version": { "type": "integer", "description": "Event payload schema version.", "minimum": 1 },
        "current_admin": { "type": "string", "description": "Admin that cancelled the pending handoff." },
        "cancelled_admin": { "type": "string", "description": "Address that had been proposed and is no longer in line for the role." },
        "timestamp": { "type": "integer", "description": "Ledger timestamp when the cancellation occurred." }
      },
      "required": ["schema_version", "current_admin", "cancelled_admin", "timestamp"]
    },
    "HistoryIndexRebuilt": {
      "description": "Emitted by rebuild_history_index(). Signals the payment history index was successfully rebuilt.",
      "topic": "history_index_rebuilt",
      "fields": {
        "schema_version": { "type": "integer", "description": "Event payload schema version.", "minimum": 1 },
        "record_count": { "type": "integer", "description": "Number of records in the rebuilt index.", "minimum": 0 },
        "rebuilt_at": { "type": "integer", "description": "Ledger timestamp when the rebuild completed." }
      },
      "required": ["schema_version", "record_count", "rebuilt_at"]
    },
    "SettlementRefsMigrated": {
      "description": "Emitted during a storage upgrade when settlement references are backfilled/migrated.",
      "topic": "settlement_refs_migrated",
      "fields": {
        "schema_version": { "type": "integer", "description": "Event payload schema version.", "minimum": 1 },
        "count": { "type": "integer", "description": "Number of settlement references migrated.", "minimum": 0 },
        "conflicts_skipped": { "type": "integer", "description": "Number of payments whose settlement_ref was already owned by a different invoice in the index and was therefore left untouched rather than overwritten. Non-zero means a genuine pre-existing duplicate was found and needs operator investigation.", "minimum": 0 },
        "migrated_at": { "type": "integer", "description": "Ledger timestamp when the migration occurred." }
      },
      "required": ["schema_version", "count", "conflicts_skipped", "migrated_at"]
    },
    "AllowlistIndexBackfilled": {
      "description": "Emitted by the V3 -> V4 storage migration after backfilling the allowlist enumeration index from payment history. discovered is not necessarily the deployment's full allowlist: an asset allowlisted but never paid with before the upgrade is not discoverable this way (Soroban has no key enumeration).",
      "topic": "allowlist_index_backfilled",
      "fields": {
        "schema_version": { "type": "integer", "description": "Event payload schema version.", "minimum": 1 },
        "discovered": { "type": "integer", "description": "Number of distinct, still-allowed (code, issuer) pairs newly indexed.", "minimum": 0 },
        "migrated_at": { "type": "integer", "description": "Ledger timestamp when the migration occurred." }
      },
      "required": ["schema_version", "discovered", "migrated_at"]
    },
    "IssuersMigrated": {
      "description": "Emitted by the V5 -> V6 storage migration after rewriting Token issuers from unvalidated strings into Address values on payment records, history slots, and allowlist keys. skipped_malformed counts string issuers that were not a well-formed Stellar address and were left on the legacy key rather than dropped.",
      "topic": "issuers_migrated",
      "fields": {
        "payments": { "type": "integer", "description": "Number of payment records rewritten in this batch.", "minimum": 0 },
        "allowlist": { "type": "integer", "description": "Number of allowlist entries moved from the string key to AllowListV6.", "minimum": 0 },
        "skipped_malformed": { "type": "integer", "description": "Number of stored issuer strings that were not a well-formed G... address and were left in place.", "minimum": 0 },
        "migrated_at": { "type": "integer", "description": "Ledger timestamp when this batch completed." }
      },
      "required": ["payments", "allowlist", "skipped_malformed", "migrated_at"]
    },
    "LegacyPaymentsMigrated": {
      "description": "Emitted by migrate_legacy_payments() when at least one legacy Payment(invoice_id) entry was migrated to PaymentV1 and its legacy copy removed. migrated excludes ids that were already current or not found in that call.",
      "topic": "legacy_payments_migrated",
      "fields": {
        "schema_version": { "type": "integer", "description": "Event payload schema version.", "minimum": 1 },
        "migrated": { "type": "integer", "description": "Number of legacy entries actually migrated (copied to PaymentV1 and removed from the legacy key) this call.", "minimum": 0 },
        "migrated_at": { "type": "integer", "description": "Ledger timestamp when the migration occurred." }
      },
      "required": ["schema_version", "migrated", "migrated_at"]
    },
    "ContractUpgraded": {
      "description": "Emitted by upgrade(). Signals the deployed WASM was swapped in place.",
      "topic": "contract_upgraded",
      "fields": {
        "schema_version": { "type": "integer", "description": "Event payload schema version.", "minimum": 1 },
        "previous_version": { "type": "integer", "description": "Packed semver of the code that was running when upgrade() was called." },
        "new_version": { "type": "integer", "description": "Caller-supplied packed semver of the code being deployed. Not verified on-chain against new_wasm_hash." },
        "new_wasm_hash": { "type": "string", "description": "Hex-encoded 32-byte hash of the newly installed WASM.", "contentEncoding": "hex" },
        "upgraded_by": { "type": "string", "description": "Admin address that triggered the upgrade." },
        "upgraded_at": { "type": "integer", "description": "Ledger timestamp when the upgrade occurred." }
      },
      "required": ["schema_version", "previous_version", "new_version", "new_wasm_hash", "upgraded_by", "upgraded_at"]
    }
  },
  "errors": {
${ERRORS_JSON}  },
  "methods": {
${METHODS_JSON}  }
}
JSON

echo "schema.json written (contract_version=${CONTRACT_VERSION}, storage_schema_version=${SCHEMA_VER}, ${#ERROR_NAMES[@]} errors, ${#METHOD_NAMES[@]} methods, ${#EVENT_NAMES[@]} events)"
