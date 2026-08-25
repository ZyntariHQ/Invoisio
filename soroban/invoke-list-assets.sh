#!/usr/bin/env bash
# ============================================================================
# invoke-list-assets.sh — Enumerate the current allowlist from the Invoisio contract
# ============================================================================
#
# Calls list_assets() (paginated) and allowlist_count() on the deployed contract
# and prints all allowlisted (code, issuer) pairs along with count metadata.
#
# Previously this script called config() which had no enumeration capability.
# It now calls the dedicated list_assets / allowlist_count entry-points added
# in the enumerable-allowlist upgrade.
#
# Usage:
#   ./invoke-list-assets.sh [--json]
#
# Options:
#   --json    Output raw JSON from the contract's list_assets() call and exit.
#             Useful for scripting / CI assertions.
#
# Environment variables:
#   STELLAR_NETWORK   Network to use             (default: testnet)
#   STELLAR_IDENTITY  Identity/key to query with (default: invoisio-admin)
#   CONTRACT_ID       Override the contract ID   (default: read .contract-id)
#
# Exit codes:
#   0  Success — allowlist read and printed
#   1  Validation error — missing tool, contract not found
#   2  Network/RPC connectivity failure
#   3  Contract invocation failed
# ============================================================================

set -euo pipefail

cd "$(dirname "$0")"

# ── Helpers ──────────────────────────────────────────────────────────────────

JSON_OUTPUT=false

info()  { echo "ℹ️  $*" >&2; }
ok()    { echo "✅ $*" >&2; }
fail()  { echo "❌ $*" >&2; }
step()  { echo "  $*" >&2; }
banner(){ echo "" >&2; echo "═══════════════════════════════════════════" >&2; echo "  $*" >&2; echo "═══════════════════════════════════════════" >&2; }

die() {
    local code="${1}"; shift
    fail "$*"
    exit "$code"
}

# ── Argument parsing ─────────────────────────────────────────────────────────

if [[ "${1:-}" == "--json" ]]; then
    JSON_OUTPUT=true
    shift
fi

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    cat >&2 <<EOF

Usage: $0 [--json]

Options:
  --json   Print raw JSON output from list_assets() + allowlist_count() and exit

Environment:
  STELLAR_NETWORK   testnet | mainnet  (default: testnet)
  STELLAR_IDENTITY  key name           (default: invoisio-admin)
  CONTRACT_ID       override contract  (default: read from .contract-id)

EOF
    exit 0
fi

NETWORK="${STELLAR_NETWORK:-testnet}"
IDENTITY="${STELLAR_IDENTITY:-invoisio-admin}"
CONTRACT_ID_FILE="contracts/invoice-payment/.contract-id"

# ── Validation helpers ────────────────────────────────────────────────────────

check_stellar_cli() {
    if ! command -v stellar &>/dev/null; then
        die 1 "stellar CLI not found in PATH
   Install: https://developers.stellar.org/docs/tools/developer-tools/cli/install-cli"
    fi
}

check_network_connectivity() {
    local net="$1"
    local rpc_url
    case "$net" in
        testnet) rpc_url="https://soroban-testnet.stellar.org" ;;
        mainnet) rpc_url="https://mainnet.sorobanrpc.com" ;;
        *)
            die 1 "Unknown network: '$net'. Supported: testnet, mainnet" ;;
    esac

    step "Checking RPC connectivity to $rpc_url ..."
    if ! curl -sf --max-time 8 "$rpc_url" \
            -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
            -H "Content-Type: application/json" -o /dev/null 2>/dev/null; then
        die 2 "Cannot reach Soroban RPC at $rpc_url
   Check your internet connection or set STELLAR_NETWORK correctly."
    fi
    ok "RPC endpoint reachable"
}

resolve_contract_id() {
    if [[ -n "${CONTRACT_ID:-}" ]]; then
        info "Using CONTRACT_ID from environment: $CONTRACT_ID"
        return
    fi

    if [[ "$NETWORK" == "mainnet" ]]; then
        CONTRACT_ID_FILE="contracts/invoice-payment/.contract-id-mainnet"
    fi

    if [[ ! -f "$CONTRACT_ID_FILE" ]]; then
        die 1 "Contract ID file not found: $CONTRACT_ID_FILE
   Either:
     1. Deploy the contract first:  ./deploy.sh
     2. Set CONTRACT_ID env var:    CONTRACT_ID=C... $0"
    fi

    CONTRACT_ID=$(tr -d '[:space:]' < "$CONTRACT_ID_FILE")

    if [[ -z "$CONTRACT_ID" ]]; then
        die 1 "Contract ID file is empty: $CONTRACT_ID_FILE"
    fi
}

invoke_contract() {
    local fn_name="$1"; shift
    stellar contract invoke \
        --id "$CONTRACT_ID" \
        --source "$IDENTITY" \
        --network "$NETWORK" \
        -- "$fn_name" "$@" 2>/dev/null
}

# ── Pre-flight ───────────────────────────────────────────────────────────────

if [[ "$JSON_OUTPUT" != "true" ]]; then
    banner "Querying Contract Allowlist"
fi

step "Checking stellar CLI ..."
check_stellar_cli
[[ "$JSON_OUTPUT" != "true" ]] && ok "stellar CLI found"

check_network_connectivity "$NETWORK"

step "Resolving contract ID ..."
resolve_contract_id
[[ "$JSON_OUTPUT" != "true" ]] && ok "Contract ID: $CONTRACT_ID"

# ── Fetch allowlist count ─────────────────────────────────────────────────────

COUNT_OUTPUT=$(invoke_contract allowlist_count) || {
    die 3 "allowlist_count() invocation failed
   Possible reasons:
     - Contract is not yet initialized (run ./deploy.sh first)
     - Contract has not been upgraded to the enumerable-allowlist version
     - Contract ID is wrong
     - Identity '$IDENTITY' does not exist locally"
}

TOTAL_COUNT=$(echo "$COUNT_OUTPUT" | tr -d '[:space:]')

# ── Fetch paginated allowlist ─────────────────────────────────────────────────

# Collect all pages; limit is 25 per page (contract cap).
CURSOR=0
LIMIT=25
ALL_ENTRIES="[]"
HAS_MORE=true

while [[ "$HAS_MORE" == "true" ]]; do
    PAGE_OUTPUT=$(invoke_contract list_assets --cursor "$CURSOR" --limit "$LIMIT") || {
        die 3 "list_assets(cursor=$CURSOR, limit=$LIMIT) invocation failed"
    }

    # Extract has_more and next_cursor from the raw JSON-like Soroban output.
    # Soroban CLI returns WASM-encoded ScVal; for simple structs it serialises
    # as JSON so we can grep the fields directly.
    HAS_MORE=$(echo "$PAGE_OUTPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(str(d.get('has_more', False)).lower())" 2>/dev/null || echo "false")
    NEXT_CURSOR=$(echo "$PAGE_OUTPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('next_cursor', 0))" 2>/dev/null || echo "0")
    PAGE_ENTRIES=$(echo "$PAGE_OUTPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(d.get('entries', [])))" 2>/dev/null || echo "[]")

    # Merge into ALL_ENTRIES (poor-man's JSON merge without jq dependency).
    ALL_ENTRIES=$(python3 -c "import json; a=json.loads('$ALL_ENTRIES'); b=json.loads('''$PAGE_ENTRIES'''); print(json.dumps(a + b))" 2>/dev/null || echo "[]")

    CURSOR="$NEXT_CURSOR"

    if [[ "$HAS_MORE" != "true" ]]; then
        HAS_MORE=false
    fi
done

# ── JSON mode — raw output and exit ──────────────────────────────────────────

if [[ "$JSON_OUTPUT" == "true" ]]; then
    python3 -c "import json; print(json.dumps({'total': $TOTAL_COUNT, 'entries': json.loads('$ALL_ENTRIES')}, indent=2))"
    exit 0
fi

# ── Human-readable display ───────────────────────────────────────────────────

echo "" >&2
echo "═══════════════════════════════════════════" >&2
echo "  Invoisio Allowlist — $NETWORK" >&2
echo "═══════════════════════════════════════════" >&2
echo "" >&2

echo "  Total allowlisted assets: $TOTAL_COUNT" >&2
echo "" >&2

if [[ "$TOTAL_COUNT" == "0" ]]; then
    echo "  (no assets allowlisted)" >&2
else
    echo "  Code         Issuer" >&2
    echo "  ──────────── ──────────────────────────────────────────────────────" >&2
    python3 -c "
import json, sys
entries = json.loads(sys.argv[1])
for e in entries:
    code = e.get('code', '?')
    issuer = e.get('issuer', '?')
    print(f'  {code:<12} {issuer}')
" "$ALL_ENTRIES" >&2
fi

echo "" >&2
ok "Allowlist retrieved successfully."
echo "" >&2
echo "  Allowlist operations:" >&2
echo "    Add asset:     ./invoke-allow-asset.sh  <code> <issuer>" >&2
echo "    Remove asset:  ./invoke-revoke-asset.sh <code> <issuer>" >&2
echo "    Rebuild index: ./invoke-rebuild-allowlist-index.sh <code1:issuer1> ..." >&2
echo "" >&2
