#!/usr/bin/env bash
# generate-schema.sh — emit schema.json from the contract's Rust source.
# Run from the contract directory (soroban/contracts/invoice-payment/), or via
# `make schema`.
#
# The `errors` and `methods` sections below are derived directly from
# src/errors.rs and src/lib.rs: this script fails loudly if a contract error
# variant or public method is added, removed, or renamed without a matching
# update here, so schema.json can never silently drift from the contract.
# `types` and `events` stay hand-authored (their rich field descriptions
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
  [InvalidAsset]="asset_code empty, or non-XLM asset supplied without asset_issuer."
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
  [initialize]="admin"
  [record_payment]="admin"
  [get_payment]="none"
  [has_payment]="none"
  [payment_count]="none"
  [payment_history]="none"
  [payments_by_payer]="none"
  [config]="none"
  [contract_version]="none"
  [version_info]="none"
  [admin]="none"
  [pending_admin]="none"
  [propose_admin]="admin"
  [accept_admin]="proposed_admin"
  [cancel_admin_transfer]="admin"
  [allow_asset]="admin"
  [revoke_asset]="admin"
  [set_allow_native]="admin"
  [upgrade_storage]="admin"
  [set_paused]="admin"
  [is_paused]="none"
  [rebuild_history_index]="admin"
  [history_index_status]="none"
)
declare -A METHOD_DESC=(
  [initialize]="One-time setup; sets the admin."
  [record_payment]="Persist PaymentRecord + emit InvoicePaymentRecorded."
  [get_payment]="Return PaymentRecord for invoice_id."
  [has_payment]="Return true if a payment exists for invoice_id."
  [payment_count]="Return total recorded payment count."
  [payment_history]="Return a bounded, cursor-paginated PaymentHistoryPage across all payments."
  [payments_by_payer]="Return a bounded, cursor-paginated PaymentHistoryPage filtered to one payer."
  [config]="Return ContractConfig snapshot."
  [contract_version]="Return packed semver as u32."
  [version_info]="Return on-chain ContractMeta."
  [admin]="Return current admin address."
  [pending_admin]="Return the address proposed as next admin, if any."
  [propose_admin]="Step 1 of two-step handoff: propose the next admin."
  [accept_admin]="Step 2 of two-step handoff: accept the role and become admin."
  [cancel_admin_transfer]="Cancel a pending admin transfer proposed via propose_admin()."
  [allow_asset]="Add (code, issuer) to allowlist."
  [revoke_asset]="Remove (code, issuer) from allowlist."
  [set_allow_native]="Toggle native XLM acceptance."
  [upgrade_storage]="Explicitly upgrade storage schema to current version."
  [set_paused]="Pause or unpause the contract. Writes rejected when paused."
  [is_paused]="Return true if the contract is currently paused."
  [rebuild_history_index]="Rebuild the payment history index from existing records after a corruption or incomplete migration."
  [history_index_status]="Return (history_count, payment_count, is_consistent) diagnostic status for the history index."
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
  AdminTransferCancelled HistoryIndexRebuilt SettlementRefsMigrated
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
            "issuer": { "type": "string", "description": "Issuer Stellar account address (G...)." }
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
          "description": "Payment amount in the asset's smallest unit (stroops for XLM; 7-decimal units for USDC). Must be > 0.",
          "minimum": 1
        },
        "timestamp": {
          "type": "integer",
          "description": "Unix timestamp (seconds) sourced from the ledger at recording time.",
          "minimum": 0
        },
        "settlement_ref": {
          "type": "string",
          "description": "Normalised settlement reference for backend deduplication and idempotent reconciliation (e.g. SHA-256 hex). Max 128 chars.",
          "minLength": 1,
          "maxLength": 128
        }
      },
      "required": ["invoice_id", "payer", "asset", "amount", "timestamp", "settlement_ref"],
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
      "description": "Asset allowlist policy for this contract instance.",
      "type": "object",
      "properties": {
        "native_allowed": {
          "type": "boolean",
          "description": "Whether native XLM payments are accepted."
        },
        "requires_token_allowlist": {
          "type": "boolean",
          "description": "Whether issued assets must be explicitly allowlisted. Currently always true."
        }
      },
      "required": ["native_allowed", "requires_token_allowlist"],
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
      "description": "Bounded, cursor-friendly slice of payment history returned by payment_history() and payments_by_payer().",
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
    }
  },
  "events": {
    "InvoicePaymentRecorded": {
      "description": "Emitted by record_payment(). Primary indexer event — carries the full payment details.",
      "topic": "invoice_payment_recorded",
      "fields": {
        "invoice_id":   { "type": "string",  "description": "Unique invoice identifier." },
        "payer":        { "type": "string",  "description": "Stellar account address of the payer." },
        "asset_code":   { "type": "string",  "description": "Asset code (XLM or token code)." },
        "asset_issuer": { "type": "string",  "description": "Asset issuer address; empty string for native XLM." },
        "amount":       { "type": "integer", "description": "Payment amount in smallest denomination. Must be > 0.", "minimum": 1 },
        "settlement_ref": { "type": "string", "description": "Normalised settlement reference for backend deduplication and idempotent reconciliation." }
      },
      "required": ["invoice_id", "payer", "asset_code", "asset_issuer", "amount", "settlement_ref"]
    },
    "AssetAllowlisted": {
      "description": "Emitted by allow_asset(). Signals a token was added to the allowlist.",
      "topic": "asset_allowlisted",
      "fields": {
        "code":   { "type": "string", "description": "Asset code." },
        "issuer": { "type": "string", "description": "Issuer address." }
      },
      "required": ["code", "issuer"]
    },
    "AssetRevoked": {
      "description": "Emitted by revoke_asset(). Signals a token was removed from the allowlist.",
      "topic": "asset_revoked",
      "fields": {
        "code":   { "type": "string", "description": "Asset code." },
        "issuer": { "type": "string", "description": "Issuer address." }
      },
      "required": ["code", "issuer"]
    },
    "NativeAllowChanged": {
      "description": "Emitted by set_allow_native(). Signals the XLM allowance flag changed.",
      "topic": "native_allow_changed",
      "fields": {
        "allowed": { "type": "boolean", "description": "New value of the native XLM allow flag." }
      },
      "required": ["allowed"]
    },
    "StorageSchemaUpgraded": {
      "description": "Emitted by upgrade_storage(). Signals a storage schema version upgrade.",
      "topic": "storage_schema_upgraded",
      "fields": {
        "from_version": { "type": "integer", "description": "Previous schema version." },
        "to_version":   { "type": "integer", "description": "New schema version." },
        "upgraded_at":  { "type": "integer", "description": "Ledger timestamp when upgrade occurred." }
      },
      "required": ["from_version", "to_version", "upgraded_at"]
    },
    "ContractPaused": {
      "description": "Emitted by set_paused(). Signals a pause or unpause state change.",
      "topic": "contract_paused",
      "fields": {
        "paused": { "type": "boolean", "description": "New paused state." },
        "triggered_by": { "type": "string", "description": "Admin address that triggered the change." },
        "timestamp": { "type": "integer", "description": "Ledger timestamp when change occurred." }
      },
      "required": ["paused", "triggered_by", "timestamp"]
    },
    "AdminTransferProposed": {
      "description": "Emitted by propose_admin(). Signals step 1 of the two-step admin handoff.",
      "topic": "admin_transfer_proposed",
      "fields": {
        "current_admin": { "type": "string", "description": "Admin that initiated the handoff." },
        "new_admin": { "type": "string", "description": "Address proposed to become the next admin." },
        "timestamp": { "type": "integer", "description": "Ledger timestamp when the proposal was made." }
      },
      "required": ["current_admin", "new_admin", "timestamp"]
    },
    "AdminTransferAccepted": {
      "description": "Emitted by accept_admin(). Signals step 2 of the two-step admin handoff — the role has transferred.",
      "topic": "admin_transfer_accepted",
      "fields": {
        "previous_admin": { "type": "string", "description": "Admin that relinquished the role." },
        "new_admin": { "type": "string", "description": "Address that accepted and is now the contract admin." },
        "timestamp": { "type": "integer", "description": "Ledger timestamp when the transfer completed." }
      },
      "required": ["previous_admin", "new_admin", "timestamp"]
    },
    "AdminTransferCancelled": {
      "description": "Emitted by cancel_admin_transfer(). Signals a pending admin handoff was revoked before acceptance.",
      "topic": "admin_transfer_cancelled",
      "fields": {
        "current_admin": { "type": "string", "description": "Admin that cancelled the pending handoff." },
        "cancelled_admin": { "type": "string", "description": "Address that had been proposed and is no longer in line for the role." },
        "timestamp": { "type": "integer", "description": "Ledger timestamp when the cancellation occurred." }
      },
      "required": ["current_admin", "cancelled_admin", "timestamp"]
    },
    "HistoryIndexRebuilt": {
      "description": "Emitted by rebuild_history_index(). Signals the payment history index was successfully rebuilt.",
      "topic": "history_index_rebuilt",
      "fields": {
        "record_count": { "type": "integer", "description": "Number of records in the rebuilt index.", "minimum": 0 },
        "rebuilt_at": { "type": "integer", "description": "Ledger timestamp when the rebuild completed." }
      },
      "required": ["record_count", "rebuilt_at"]
    },
    "SettlementRefsMigrated": {
      "description": "Emitted during a storage upgrade when settlement references are backfilled/migrated.",
      "topic": "settlement_refs_migrated",
      "fields": {
        "count": { "type": "integer", "description": "Number of settlement references migrated.", "minimum": 0 },
        "migrated_at": { "type": "integer", "description": "Ledger timestamp when the migration occurred." }
      },
      "required": ["count", "migrated_at"]
    }
  },
  "errors": {
${ERRORS_JSON}  },
  "methods": {
${METHODS_JSON}  }
}
JSON

echo "schema.json written (contract_version=${CONTRACT_VERSION}, storage_schema_version=${SCHEMA_VER}, ${#ERROR_NAMES[@]} errors, ${#METHOD_NAMES[@]} methods, ${#EVENT_NAMES[@]} events)"
