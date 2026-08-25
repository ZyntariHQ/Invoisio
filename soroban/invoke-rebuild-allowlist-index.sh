#!/usr/bin/env bash
# ============================================================================
# invoke-rebuild-allowlist-index.sh — Rebuild the enumerable allowlist index
# ============================================================================
#
# Calls rebuild_allowlist_index() on the deployed contract with a caller-
# supplied list of (code, issuer) pairs.
#
# Use this script ONCE after upgrading a legacy deployment (one that predates
# the enumerable-allowlist WASM) to populate the new enumerable index from
# the known set of previously-allowlisted pairs.
#
# For fresh deployments (already on the enumerable-allowlist WASM) this is
# NOT needed: allow_asset() automatically maintains the index.
#
# Usage:
#   ./invoke-rebuild-allowlist-index.sh CODE1:ISSUER1 [CODE2:ISSUER2 ...]
#
# Arguments:
#   CODE:ISSUER   One or more asset pairs in CODE:ISSUER format.
#                 CODE must be 1-12 alphanumeric characters.
#                 ISSUER must be a valid Stellar address (G...).
#
# Environment variables:
#   STELLAR_NETWORK   Network to use             (default: testnet)
#   STELLAR_IDENTITY  Identity/key to sign with  (default: invoisio-admin)
#   CONTRACT_ID       Override the contract ID   (default: read .contract-id)
#
# Exit codes:
#   0  Success
#   1  Validation error — bad input, missing tool, contract not found
#   2  Network/RPC connectivity failure
#   3  Contract invocation failed
#
# Example:
#   ./invoke-rebuild-allowlist-index.sh \
#     USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5 \
#     EURC:GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP
# ============================================================================

set -euo pipefail

cd "$(dirname "$0")"

# ── Helpers ──────────────────────────────────────────────────────────────────

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

# ── Usage ────────────────────────────────────────────────────────────────────

if [[ $# -lt 1 || "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    cat >&2 <<EOF

Usage: $0 CODE1:ISSUER1 [CODE2:ISSUER2 ...]

Arguments:
  CODE:ISSUER   Asset pairs in CODE:ISSUER format.
                CODE must be 1-12 alphanumeric characters.
                ISSUER must be a valid Stellar address (G...).

Environment:
  STELLAR_NETWORK   testnet | mainnet  (default: testnet)
  STELLAR_IDENTITY  key name           (default: invoisio-admin)
  CONTRACT_ID       override contract  (default: read from .contract-id)

Example (testnet):
  $0 \\
    USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5 \\
    EURC:GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP

EOF
    [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]] && exit 0 || exit 1
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
        *)       die 1 "Unknown network: '$net'. Supported: testnet, mainnet" ;;
    esac

    step "Checking RPC connectivity to $rpc_url ..."
    if ! curl -sf --max-time 8 "$rpc_url" \
            -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' \
            -H "Content-Type: application/json" -o /dev/null 2>/dev/null; then
        die 2 "Cannot reach Soroban RPC at $rpc_url"
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
     2. Set CONTRACT_ID env var:    CONTRACT_ID=C... $0 ..."
    fi

    CONTRACT_ID=$(tr -d '[:space:]' < "$CONTRACT_ID_FILE")

    if [[ -z "$CONTRACT_ID" ]]; then
        die 1 "Contract ID file is empty: $CONTRACT_ID_FILE"
    fi
}

# ── Parse + validate pairs ────────────────────────────────────────────────────

PAIRS=()
for arg in "$@"; do
    # Expected format: CODE:ISSUER
    if [[ "$arg" != *:* ]]; then
        die 1 "Invalid pair format: '$arg'. Expected CODE:ISSUER (e.g. USDC:GBBD47...)"
    fi
    CODE="${arg%%:*}"
    ISSUER="${arg#*:}"

    if [[ -z "$CODE" ]]; then
        die 1 "Empty asset code in pair: '$arg'"
    fi
    if ! [[ "$CODE" =~ ^[A-Za-z0-9]{1,12}$ ]]; then
        die 1 "Invalid asset code '$CODE': must be 1-12 alphanumeric characters"
    fi
    if [[ -z "$ISSUER" ]]; then
        die 1 "Empty issuer in pair: '$arg'"
    fi
    if ! [[ "$ISSUER" =~ ^G[A-Z2-7]{55}$ ]]; then
        die 1 "Invalid Stellar address for issuer in '$arg': must be G followed by 55 base-32 chars"
    fi
    PAIRS+=("$CODE" "$ISSUER")
done

PAIR_COUNT=$(( ${#PAIRS[@]} / 2 ))

# ── Pre-flight ────────────────────────────────────────────────────────────────

banner "Rebuild Allowlist Index — Pre-flight"

step "Checking stellar CLI ..."
check_stellar_cli
ok "stellar CLI found"

check_network_connectivity "$NETWORK"

step "Resolving contract ID ..."
resolve_contract_id
ok "Contract ID: $CONTRACT_ID"

# ── Summary ───────────────────────────────────────────────────────────────────

echo "" >&2
echo "  Operation   : rebuild_allowlist_index" >&2
echo "  Pair count  : $PAIR_COUNT" >&2
echo "  Network     : $NETWORK" >&2
echo "  Identity    : $IDENTITY" >&2
echo "  Contract ID : $CONTRACT_ID" >&2
echo "" >&2

for (( i=0; i<${#PAIRS[@]}; i+=2 )); do
    echo "  [$(( i/2 + 1 ))] ${PAIRS[$i]} — ${PAIRS[$((i+1))]}" >&2
done
echo "" >&2

# Mainnet confirmation guard
if [[ "$NETWORK" == "mainnet" && "${SKIP_CONFIRM:-}" != "true" ]]; then
    warn "You are about to REBUILD the allowlist index on MAINNET."
    warn "This clears and re-seeds the enumerable index. Ensure the pair list is complete."
    echo "" >&2
    read -r -p "  Type 'yes' to confirm: " CONFIRM >&2 </dev/tty || true
    if [[ "$CONFIRM" != "yes" ]]; then
        echo "" >&2
        info "Aborted. No changes made."
        exit 0
    fi
fi

# ── Build CLI args for pairs vec ──────────────────────────────────────────────

# The contract function signature is:
#   rebuild_allowlist_index(env, admin: Address, pairs: Vec<AllowedAssetEntry>)
# The stellar CLI encodes Vec<{code,issuer}> as repeated --pairs-code/--pairs-issuer flags
# (struct fields are passed as adjacent --field-name flags per entry).
#
# Since the CLI does not support complex nested vectors through simple flags,
# we use --send yes with direct XDR encoding via the stellar lab xdr encode
# approach, but for simplicity we call the contract using soroban contract invoke
# with the JSON argument approach (--pairs as a JSON string) which is supported
# in Stellar CLI >= 0.36.

CLI_ARGS=(--id "$CONTRACT_ID" --source "$IDENTITY" --network "$NETWORK" --send yes -- rebuild_allowlist_index --admin "$(stellar keys address "$IDENTITY" 2>/dev/null || echo "")")

# Build the pairs JSON array: [{"code":"USDC","issuer":"G..."},...]
PAIRS_JSON="["
FIRST=true
for (( i=0; i<${#PAIRS[@]}; i+=2 )); do
    if [[ "$FIRST" == "true" ]]; then
        FIRST=false
    else
        PAIRS_JSON+=","
    fi
    PAIRS_JSON+="{\"code\":\"${PAIRS[$i]}\",\"issuer\":\"${PAIRS[$((i+1))]}\"}"
done
PAIRS_JSON+="]"

CLI_ARGS+=(--pairs "$PAIRS_JSON")

# ── Submit ────────────────────────────────────────────────────────────────────

banner "Submitting rebuild_allowlist_index"

if stellar contract invoke "${CLI_ARGS[@]}"; then
    echo "" >&2
    ok "Allowlist index rebuilt successfully!"
    echo "" >&2
    echo "  $PAIR_COUNT pair(s) were seeded into the enumerable index." >&2
    echo "  Any pairs without an on-chain existence sentinel were silently dropped." >&2
    echo "" >&2
    echo "  Verify with:" >&2
    echo "    ./invoke-list-assets.sh" >&2
    echo "" >&2
else
    echo "" >&2
    die 3 "rebuild_allowlist_index invocation failed
   Common causes:
     - Identity '$IDENTITY' does not have admin rights on the contract
     - Contract is not yet upgraded to the enumerable-allowlist WASM
     - Stellar CLI version too old (>= 0.36 required for --pairs JSON flag)"
fi
