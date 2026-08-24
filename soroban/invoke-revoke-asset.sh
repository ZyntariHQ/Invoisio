#!/usr/bin/env bash
# ============================================================================
# invoke-revoke-asset.sh — Remove an asset from the Invoisio contract allowlist
# ============================================================================
#
# Usage:
#   ./invoke-revoke-asset.sh [--dry-run] <asset_code> <asset_issuer>
#
# Options:
#   --dry-run   Validate all inputs and check connectivity without submitting
#               the transaction. Safe to run in CI pre-flight checks.
#
# Arguments:
#   asset_code    Asset code; 1-12 alphanumeric characters (e.g. USDC, EURT)
#   asset_issuer  Stellar issuer address — starts with G, 56 characters total
#
# Environment variables:
#   STELLAR_NETWORK   Network to use             (default: testnet)
#   STELLAR_IDENTITY  Identity/key to sign with  (default: invoisio-admin)
#   CONTRACT_ID       Override the contract ID   (default: read .contract-id)
#
# Exit codes:
#   0  Success (or dry-run passed all checks)
#   1  Validation error — bad input, missing tool, contract not found
#   2  Network/RPC connectivity failure
#   3  Contract invocation failed
# ============================================================================

set -euo pipefail

cd "$(dirname "$0")"

# ── Helpers ──────────────────────────────────────────────────────────────────

DRY_RUN=false

step()  { echo "  $*" >&2; }
info()  { echo "ℹ️  $*" >&2; }
ok()    { echo "✅ $*" >&2; }
warn()  { echo "⚠️  $*" >&2; }
fail()  { echo "❌ $*" >&2; }
banner(){ echo "" >&2; echo "═══════════════════════════════════════════" >&2; echo "  $*" >&2; echo "═══════════════════════════════════════════" >&2; }

die() {
    local code="${1}"; shift
    fail "$*"
    exit "$code"
}

# ── Argument parsing ─────────────────────────────────────────────────────────

if [[ "${1:-}" == "--dry-run" ]]; then
    DRY_RUN=true
    shift
fi

if [[ $# -lt 2 ]]; then
    cat >&2 <<EOF

Usage: $0 [--dry-run] <asset_code> <asset_issuer>

Options:
  --dry-run   Validate inputs and check connectivity without submitting

Arguments:
  asset_code    1-12 alphanumeric characters  (e.g. USDC, EURT, MYTOKEN)
  asset_issuer  Stellar issuer address        (G... 56 chars)

Environment:
  STELLAR_NETWORK   testnet | mainnet  (default: testnet)
  STELLAR_IDENTITY  key name           (default: invoisio-admin)
  CONTRACT_ID       override contract  (default: read from .contract-id)

Examples:
  # Dry-run — validate only, no transaction sent
  ./invoke-revoke-asset.sh --dry-run USDC GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5

  # Submit to testnet
  ./invoke-revoke-asset.sh USDC GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5

  # Submit to mainnet
  STELLAR_NETWORK=mainnet ./invoke-revoke-asset.sh USDC GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN

EOF
    exit 1
fi

ASSET_CODE="$1"
ASSET_ISSUER="$2"
NETWORK="${STELLAR_NETWORK:-testnet}"
IDENTITY="${STELLAR_IDENTITY:-invoisio-admin}"
CONTRACT_ID_FILE="contracts/invoice-payment/.contract-id"

# ── Validation functions ─────────────────────────────────────────────────────

validate_asset_code() {
    local code="$1"
    if [[ -z "$code" ]]; then
        die 1 "asset_code cannot be empty"
    fi
    if ! [[ "$code" =~ ^[A-Za-z0-9]{1,12}$ ]]; then
        die 1 "Invalid asset_code: '$code'
   Asset codes must be 1-12 alphanumeric characters (e.g. USDC, EURT, XLM2).
   Got ${#code} character(s): '$code'"
    fi
}

validate_stellar_address() {
    local addr="$1" label="$2"
    if [[ -z "$addr" ]]; then
        die 1 "${label} cannot be empty"
    fi
    if ! [[ "$addr" =~ ^G[A-Z2-7]{55}$ ]]; then
        die 1 "Invalid Stellar address for ${label}: '$addr'
   Expected: G followed by 55 base-32 characters (A-Z, 2-7)
   Got ${#addr} character(s)"
    fi
}

validate_network() {
    local net="$1"
    case "$net" in
        testnet|mainnet) ;;
        *)
            die 1 "Unknown network: '$net'
   Supported values: testnet, mainnet
   Set via: STELLAR_NETWORK=testnet or STELLAR_NETWORK=mainnet"
            ;;
    esac
}

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
    esac

    step "Checking RPC connectivity to $rpc_url ..."
    if ! curl -sf --max-time 8 "$rpc_url" -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
            -H "Content-Type: application/json" -o /dev/null 2>/dev/null; then
        die 2 "Cannot reach Soroban RPC at $rpc_url
   Check your internet connection or use a different network:
     STELLAR_NETWORK=testnet $0 $ASSET_CODE $ASSET_ISSUER"
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
     2. Set CONTRACT_ID env var:    CONTRACT_ID=C... $0 $ASSET_CODE $ASSET_ISSUER"
    fi

    CONTRACT_ID=$(tr -d '[:space:]' < "$CONTRACT_ID_FILE")

    if [[ -z "$CONTRACT_ID" ]]; then
        die 1 "Contract ID file is empty: $CONTRACT_ID_FILE
   Re-deploy the contract or set CONTRACT_ID manually."
    fi
}

# ── Run validations ──────────────────────────────────────────────────────────

banner "revoke_asset — Pre-flight Checks"

step "Validating asset code ..."
validate_asset_code    "$ASSET_CODE"
ok  "Asset code valid: $ASSET_CODE"

step "Validating asset issuer address ..."
validate_stellar_address "$ASSET_ISSUER" "asset_issuer"
ok  "Issuer address valid: $ASSET_ISSUER"

step "Validating network selection ..."
validate_network "$NETWORK"
ok  "Network: $NETWORK"

step "Checking stellar CLI ..."
check_stellar_cli
ok  "stellar CLI found: $(stellar --version 2>&1 | head -1)"

check_network_connectivity "$NETWORK"

step "Resolving contract ID ..."
resolve_contract_id
ok  "Contract ID: $CONTRACT_ID"

# ── Summary ──────────────────────────────────────────────────────────────────

echo "" >&2
echo "  Operation     : revoke_asset" >&2
echo "  Asset Code    : $ASSET_CODE" >&2
echo "  Asset Issuer  : $ASSET_ISSUER" >&2
echo "  Contract ID   : $CONTRACT_ID" >&2
echo "  Network       : $NETWORK" >&2
echo "  Identity      : $IDENTITY" >&2

# ── Dry-run exit ─────────────────────────────────────────────────────────────

if [[ "$DRY_RUN" == "true" ]]; then
    echo "" >&2
    ok "Dry-run passed — all inputs are valid. No transaction was submitted."
    echo "" >&2
    echo "  To submit for real, run:" >&2
    echo "    $0 $ASSET_CODE $ASSET_ISSUER" >&2
    echo "" >&2
    exit 0
fi

# ── Confirmation guard for mainnet ───────────────────────────────────────────

if [[ "$NETWORK" == "mainnet" && "${SKIP_CONFIRM:-}" != "true" ]]; then
    echo "" >&2
    warn "You are about to REVOKE an asset on MAINNET."
    warn "This will prevent $ASSET_CODE payments from being accepted until re-added."
    echo "" >&2
    read -r -p "  Type 'yes' to confirm: " CONFIRM >&2 </dev/tty || true
    if [[ "$CONFIRM" != "yes" ]]; then
        echo "" >&2
        info "Aborted. No changes made."
        echo "  To skip this prompt in CI, set: SKIP_CONFIRM=true" >&2
        exit 0
    fi
fi

# ── Submit transaction ───────────────────────────────────────────────────────

banner "Submitting revoke_asset Transaction"

echo "" >&2
info "Invoking revoke_asset on $NETWORK ..."
echo "" >&2

if stellar contract invoke \
    --id "$CONTRACT_ID" \
    --source "$IDENTITY" \
    --network "$NETWORK" \
    --send yes \
    -- revoke_asset \
    --code "$ASSET_CODE" \
    --issuer "$ASSET_ISSUER"; then

    echo "" >&2
    ok "Asset revoked successfully!"
    echo "" >&2
    echo "  $ASSET_CODE ($ASSET_ISSUER) will no longer be accepted on $NETWORK." >&2
    echo "" >&2
    echo "  Verify with:" >&2
    echo "    ./invoke-list-assets.sh" >&2
    echo "" >&2
    if [[ "$NETWORK" == "mainnet" ]]; then
        warn "Revoking on mainnet affects live payment acceptance immediately."
        warn "Re-add with: ./invoke-allow-asset.sh $ASSET_CODE $ASSET_ISSUER"
        echo "" >&2
    fi
else
    echo "" >&2
    die 3 "revoke_asset invocation failed (see output above)
   Common causes:
     - Identity '$IDENTITY' does not have admin rights on the contract
     - Asset is not currently in the allowlist (check with ./invoke-list-assets.sh)
     - Contract is paused (check with ./invoke-config.sh)"
fi
