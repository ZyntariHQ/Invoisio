#!/usr/bin/env bash
#
# Read the high-level Invoisio Soroban contract configuration snapshot
#
# Usage: ./invoke-config.sh
#
# Environment variables:
#   STELLAR_NETWORK   - Network to use (default: testnet)
#   CONTRACT_ID       - Override contract ID (default: read from .contract-id file)
#
# Returns: JSON config with admin, initialized, version, and allowlist mode

set -e

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
echo "Retrieving Contract Config"
echo "========================================="
echo "Contract ID: $CONTRACT_ID"
echo "Network:     $NETWORK"
echo ""

stellar contract invoke \
    --id "$CONTRACT_ID" \
    --source "$IDENTITY" \
    --network "$NETWORK" \
    -- config

echo ""
