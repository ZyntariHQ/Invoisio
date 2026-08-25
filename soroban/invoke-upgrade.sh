#!/usr/bin/env bash
# ============================================================================
# invoke-upgrade.sh — Upgrade the deployed Invoisio contract WASM in place
# ============================================================================
#
# Uploads a new contract WASM binary and calls the contract's
# upgrade(admin, new_wasm_hash, new_contract_version) entrypoint, which runs
# env.deployer().update_current_contract_wasm(...) under the hood.
#
# This is step 2 of the documented upgrade runbook
# (docs/upgrade-runbook.md). The contract enforces on-chain that it must
# already be PAUSED before upgrade() will succeed, so this script also
# refuses to proceed unless the contract reports paused=true — pause first
# with ./invoke-pause.sh.
#
# Usage:
#   ./invoke-upgrade.sh <new_wasm_path> <new_version> [--dry-run]
#
# Arguments:
#   new_wasm_path  - Path to the newly built contract WASM
#                    (e.g. target/wasm32v1-none/release/invoice_payment.wasm)
#   new_version    - The new build's packed semver, given either as
#                    MAJOR.MINOR.PATCH (e.g. 1.1.0) or as a raw packed u32
#                    (e.g. 1001000). This value is NOT verified against the
#                    WASM on-chain — it is only carried in the emitted
#                    ContractUpgraded event for off-chain indexers, so pass
#                    the value that actually matches what you built.
#
# Flags:
#   --dry-run      - Print the plan (resolved contract ID, pause state, the
#                     WASM hash that would be uploaded, and the exact
#                     `stellar contract invoke` command) without uploading
#                     the WASM or invoking upgrade(). Safe to run anytime.
#
# Environment variables:
#   STELLAR_NETWORK   - Network to use (default: testnet)
#   STELLAR_IDENTITY  - Identity to sign with (default: invoisio-admin)
#   CONTRACT_ID       - Override contract ID (default: read from .contract-id file)
#
# Runbook (see docs/upgrade-runbook.md for the full procedure):
#   1. ./invoke-pause.sh
#   2. ./invoke-upgrade.sh <new_wasm_path> <new_version>          <- this script
#   3. ./invoke-upgrade-storage.sh
#   4. Verify: ./invoke-inspect-config.sh
#   5. ./invoke-unpause.sh
#
# Examples:
#   Dry run before touching anything:
#     ./invoke-upgrade.sh target/wasm32v1-none/release/invoice_payment.wasm 1.1.0 --dry-run
#
#   Real upgrade on testnet:
#     ./invoke-pause.sh
#     ./invoke-upgrade.sh target/wasm32v1-none/release/invoice_payment.wasm 1.1.0
#     ./invoke-upgrade-storage.sh
#     ./invoke-inspect-config.sh
#     ./invoke-unpause.sh
# ============================================================================

set -euo pipefail

cd "$(dirname "$0")"

NETWORK="${STELLAR_NETWORK:-testnet}"
IDENTITY="${STELLAR_IDENTITY:-invoisio-admin}"
CONTRACT_ID_FILE="contracts/invoice-payment/.contract-id"
if [ "$NETWORK" = "mainnet" ]; then
    CONTRACT_ID_FILE="contracts/invoice-payment/.contract-id-mainnet"
fi

DRY_RUN=0
POSITIONAL=()
for arg in "$@"; do
    case "$arg" in
        --dry-run)
            DRY_RUN=1
            ;;
        *)
            POSITIONAL+=("$arg")
            ;;
    esac
done

NEW_WASM_PATH="${POSITIONAL[0]:-}"
RAW_VERSION="${POSITIONAL[1]:-}"

if [ -z "$NEW_WASM_PATH" ] || [ -z "$RAW_VERSION" ]; then
    echo "Usage: $0 <new_wasm_path> <new_version> [--dry-run]"
    echo ""
    echo "Arguments:"
    echo "  new_wasm_path  - Path to the newly built contract WASM"
    echo "  new_version    - MAJOR.MINOR.PATCH (e.g. 1.1.0) or a packed u32"
    echo ""
    echo "Flags:"
    echo "  --dry-run      - Print the plan without uploading WASM or invoking upgrade()"
    echo ""
    echo "Example:"
    echo "  $0 target/wasm32v1-none/release/invoice_payment.wasm 1.1.0 --dry-run"
    exit 1
fi

if [ ! -f "$NEW_WASM_PATH" ]; then
    echo "❌ Error: WASM not found at $NEW_WASM_PATH"
    echo "   Build it first: ./build.sh"
    exit 1
fi

# Resolve new_version into a packed u32.
if [[ "$RAW_VERSION" =~ ^([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
    VMAJOR="${BASH_REMATCH[1]}"
    VMINOR="${BASH_REMATCH[2]}"
    VPATCH="${BASH_REMATCH[3]}"
    NEW_VERSION=$((VMAJOR * 1000000 + VMINOR * 1000 + VPATCH))
elif [[ "$RAW_VERSION" =~ ^[0-9]+$ ]]; then
    NEW_VERSION="$RAW_VERSION"
else
    echo "❌ Error: new_version must be MAJOR.MINOR.PATCH (e.g. 1.1.0) or a packed u32"
    exit 1
fi

if ! command -v stellar &> /dev/null; then
    echo "❌ Error: stellar CLI not found"
    exit 1
fi

# Resolve contract ID.
if [ -n "${CONTRACT_ID:-}" ]; then
    echo "ℹ️  Using CONTRACT_ID from environment: $CONTRACT_ID"
elif [ -f "$CONTRACT_ID_FILE" ]; then
    CONTRACT_ID=$(tr -d '[:space:]' < "$CONTRACT_ID_FILE")
else
    echo "❌ Error: Contract ID not found"
    echo ""
    echo "Either:"
    echo "  1. Deploy the contract first: ./deploy.sh"
    echo "  2. Set CONTRACT_ID environment variable"
    exit 1
fi

ADMIN_ADDRESS=$(stellar keys address "$IDENTITY")

echo "========================================="
echo "Contract Upgrade"
echo "========================================="
echo "Contract ID:  $CONTRACT_ID"
echo "Network:      $NETWORK"
echo "Identity:     $IDENTITY ($ADMIN_ADDRESS)"
echo "New WASM:     $NEW_WASM_PATH"
echo "New version:  $RAW_VERSION (packed: $NEW_VERSION)"
[ "$DRY_RUN" -eq 1 ] && echo "Mode:         DRY RUN (no on-chain changes)"
echo ""

# Step 1: the contract must already be paused — upgrade() enforces this
# on-chain (MustBePausedForUpgrade) so a live write can never land between
# the code swap and the follow-up upgrade_storage() migration.
echo "🔍 Step 1: Checking pause state..."
PAUSED=$(stellar contract invoke \
    --id "$CONTRACT_ID" \
    --source "$IDENTITY" \
    --network "$NETWORK" \
    -- is_paused 2>/dev/null) || {
    echo "❌ Error: Failed to invoke is_paused on contract."
    exit 3
}

if [ "$PAUSED" != "true" ]; then
    echo "❌ Error: contract is not paused."
    echo "   upgrade() will be rejected with MustBePausedForUpgrade."
    echo "   Pause it first: ./invoke-pause.sh"
    exit 1
fi
echo "✅ Contract is paused."
echo ""

# Step 2: upload the new WASM (installs the code without switching to it
# yet) and capture its hash.
echo "📦 Step 2: Uploading new WASM..."
if [ "$DRY_RUN" -eq 1 ]; then
    echo "   (dry run) would run:"
    echo "   stellar contract upload --wasm $NEW_WASM_PATH --source $IDENTITY --network $NETWORK"
    NEW_WASM_HASH="<dry-run: not uploaded>"
else
    NEW_WASM_HASH=$(stellar contract upload \
        --wasm "$NEW_WASM_PATH" \
        --source "$IDENTITY" \
        --network "$NETWORK")
    echo "✅ Uploaded. WASM hash: $NEW_WASM_HASH"
fi
echo ""

# Step 3: switch the contract over to the new code.
echo "🚀 Step 3: Invoking upgrade(admin, new_wasm_hash, new_contract_version)..."
INVOKE_CMD=(stellar contract invoke
    --id "$CONTRACT_ID"
    --source "$IDENTITY"
    --network "$NETWORK"
    --send yes
    -- upgrade
    --admin "$ADMIN_ADDRESS"
    --new_wasm_hash "$NEW_WASM_HASH"
    --new_contract_version "$NEW_VERSION")

if [ "$DRY_RUN" -eq 1 ]; then
    echo "   (dry run) would run:"
    printf '   %q ' "${INVOKE_CMD[@]}"
    echo ""
    echo ""
    echo "🧪 Dry run complete — no on-chain changes were made."
    exit 0
fi

"${INVOKE_CMD[@]}"

echo ""
echo "✅ Contract upgraded to version $RAW_VERSION!"
echo ""
echo "Next steps (do not skip — the contract is still paused):"
echo "  1. Run the storage migration under the new code:"
echo "       ./invoke-upgrade-storage.sh"
echo "  2. Verify the deployment looks right:"
echo "       ./invoke-inspect-config.sh"
echo "  3. Only then unpause:"
echo "       ./invoke-unpause.sh"
echo ""
echo "See docs/upgrade-runbook.md for the full procedure and rollback notes."
echo ""
