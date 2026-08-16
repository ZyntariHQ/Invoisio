#!/usr/bin/env bash
# ============================================================================
# invoke-list-assets.sh — Query the current allowlist from the Invoisio contract
# ============================================================================
#
# Calls config() on the deployed contract and prints the allowed asset list
# along with contract state (admin, paused status, version).
#
# Usage:
#   ./invoke-list-assets.sh [--json]
#
# Options:
#   --json    Output raw JSON from the contract's config() call and exit.
#             Useful for scripting / CI assertions.
#
# Environment variables:
#   STELLAR_NETWORK   Network to use             (default: testnet)
#   STELLAR_IDENTITY  Identity/key to query with (default: invoisio-admin)
#   CONTRACT_ID       Override the contract ID   (default: read .contract-id)
#
# Exit codes:
#   0  Success — config read and printed
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
  --json   Print raw JSON output from config() and exit

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

# ── Call config() ─────────────────────────────────────────────────────────────

if [[ "$JSON_OUTPUT" != "true" ]]; then
    echo "" >&2
    info "Calling config() on $NETWORK ..."
    echo "" >&2
fi

CONFIG_OUTPUT=$(stellar contract invoke \
    --id "$CONTRACT_ID" \
    --source "$IDENTITY" \
    --network "$NETWORK" \
    -- config 2>/dev/null) || {
    die 3 "config() invocation failed
   Possible reasons:
     - Contract is not yet initialized (run ./deploy.sh first)
     - Contract ID is wrong
     - Identity '$IDENTITY' does not exist locally"
}

# ── JSON mode — raw output and exit ──────────────────────────────────────────

if [[ "$JSON_OUTPUT" == "true" ]]; then
    echo "$CONFIG_OUTPUT"
    exit 0
fi

# ── Human-readable display ───────────────────────────────────────────────────

echo "" >&2
echo "═══════════════════════════════════════════" >&2
echo "  Invoisio Contract State — $NETWORK" >&2
echo "═══════════════════════════════════════════" >&2
echo "" >&2

echo "$CONFIG_OUTPUT" >&2

echo "" >&2
ok "Config retrieved successfully."
echo "" >&2
echo "  Allowlist operations:" >&2
echo "    Add asset:     ./invoke-allow-asset.sh  <code> <issuer>" >&2
echo "    Remove asset:  ./invoke-revoke-asset.sh <code> <issuer>" >&2
echo "    Unified tool:  ./manage-allowlist.sh" >&2
echo "" >&2
