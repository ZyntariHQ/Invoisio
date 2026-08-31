#!/usr/bin/env bash
#
# Extend persistent storage TTL for a bounded range of payment history records
#
# Usage: ./invoke-extend-history-ttl.sh [cursor] [limit]
#
# Arguments:
#   cursor - Starting history slot (default: 0)
#   limit  - Maximum records to extend per batch (default: 20, max: 20)
#
# Environment variables:
#   STELLAR_NETWORK   - Network to use (default: testnet)
#   STELLAR_IDENTITY  - Identity to sign with (default: invoisio-admin)
#   CONTRACT_ID       - Override contract ID (default: read from .contract-id file)
#
# Example:
#   ./invoke-extend-history-ttl.sh 0 20

set -e

cd "$(dirname "$0")"

# Configuration
NETWORK="${STELLAR_NETWORK:-testnet}"
IDENTITY="${STELLAR_IDENTITY:-invoisio-admin}"
CONTRACT_ID_FILE="contracts/invoice-payment/.contract-id"

# Parse arguments
CURSOR="${1:-0}"
LIMIT="${2:-20}"

# Get contract ID
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

ADMIN_ADDRESS=$(stellar keys address "$IDENTITY")

echo "========================================="
echo "Extending History TTL (admin-gated)"
echo "========================================="
echo "Contract ID: $CONTRACT_ID"
echo "Admin:       $IDENTITY ($ADMIN_ADDRESS)"
echo "Cursor:      $CURSOR"
echo "Limit:       $LIMIT"
echo "Network:     $NETWORK"
echo "========================================="

stellar contract invoke \
    --id "$CONTRACT_ID" \
    --source-account "$IDENTITY" \
    --network "$NETWORK" \
    -- \
    extend_history_ttl \
    --admin "$ADMIN_ADDRESS" \
    --cursor "$CURSOR" \
    --limit "$LIMIT"

echo ""
echo "✅ TTL extension batch completed."
