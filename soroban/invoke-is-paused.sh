#!/usr/bin/env bash
# ============================================================================
# invoke-is-paused.sh — Check if the Invoisio contract is currently paused
# ============================================================================
#
# Query the pause status of the contract by invoking the is_paused() read-only view.
#
# Usage:
#   ./invoke-is-paused.sh
#
# Environment variables:
#   STELLAR_NETWORK   Network to use (default: testnet)
#   CONTRACT_ID       Override contract ID (default: read from .contract-id file)
#   STELLAR_IDENTITY  Identity to sign query with (default: invoisio-admin)
# ============================================================================

set -euo pipefail

cd "$(dirname "$0")"

NETWORK="${STELLAR_NETWORK:-testnet}"
IDENTITY="${STELLAR_IDENTITY:-invoisio-admin}"
CONTRACT_ID_FILE="contracts/invoice-payment/.contract-id"

# Get contract ID based on network
if [ "$NETWORK" = "mainnet" ]; then
    CONTRACT_ID_FILE="contracts/invoice-payment/.contract-id-mainnet"
fi

if [ -n "${CONTRACT_ID:-}" ]; then
    echo "ℹ️  Using CONTRACT_ID from environment: $CONTRACT_ID" >&2
elif [ -f "$CONTRACT_ID_FILE" ]; then
    CONTRACT_ID=$(tr -d '[:space:]' < "$CONTRACT_ID_FILE")
else
    echo "❌ Error: Contract ID not found" >&2
    echo "" >&2
    echo "Either:" >&2
    echo "  1. Deploy the contract first: ./deploy.sh" >&2
    echo "  2. Set CONTRACT_ID environment variable" >&2
    exit 1
fi

echo "========================================="
echo "Checking Contract Pause State"
echo "========================================="
echo "Contract ID: $CONTRACT_ID"
echo "Network:     $NETWORK"
echo ""

RESULT=$(stellar contract invoke \
    --id "$CONTRACT_ID" \
    --source "$IDENTITY" \
    --network "$NETWORK" \
    -- is_paused 2>/dev/null) || {
    echo "❌ Error: Failed to invoke is_paused on contract." >&2
    exit 3
}

echo "Raw Result: $RESULT"
echo ""

if [ "$RESULT" = "true" ]; then
    echo "⚠️  Contract is currently PAUSED."
    echo "All write operations (record_payment) will be rejected."
    echo "To unpause, run: ./invoke-unpause.sh"
else
    echo "✅ Contract is currently ACTIVE (not paused)."
    echo "Write operations are enabled."
    echo "To pause, run: ./invoke-pause.sh"
fi
echo ""
