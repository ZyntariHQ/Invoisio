#!/usr/bin/env bash
#
# Pause the Invoisio Soroban contract
#
# Usage: ./invoke-pause.sh
#
# Environment variables:
#   STELLAR_NETWORK   - Network to use (default: testnet)
#   STELLAR_IDENTITY  - Identity to sign with (default: invoisio-admin)
#   CONTRACT_ID       - Override contract ID (default: read from .contract-id file)
#
# This calls the contract's set_paused(true) method.
# Only the contract admin can call this method.


set -e
set -o pipefail

cd "$(dirname "$0")"

NETWORK="${STELLAR_NETWORK:-testnet}"
IDENTITY="${STELLAR_IDENTITY:-invoisio-admin}"
CONTRACT_ID_FILE="contracts/invoice-payment/.contract-id"

if [ -n "$CONTRACT_ID" ]; then
    echo "ℹ️  Using CONTRACT_ID from environment: $CONTRACT_ID"
elif [ -f "$CONTRACT_ID_FILE" ]; then
    CONTRACT_ID=$(cat "$CONTRACT_ID_FILE")
else
    echo "❌ Error: Contract ID not found"
    echo ""
    echo "Either:"
    echo "  1. Deploy the contract first: ./deploy.sh"
    echo "  2. Set CONTRACT_ID environment variable"
    exit 1
fi

echo "========================================="
echo "Pausing Contract"
echo "========================================="
echo "Contract ID: $CONTRACT_ID"
echo "Network:     $NETWORK"
echo "Identity:    $IDENTITY"
echo ""
echo "🚀 Invoking set_paused(true)..."
echo ""

stellar contract invoke \
    --id "$CONTRACT_ID" \
    --source "$IDENTITY" \
    --network "$NETWORK" \
    --send yes \
    -- set_paused \
    --caller "$IDENTITY" \
    --paused true

echo ""
echo "✅ Contract paused successfully!"
echo ""
