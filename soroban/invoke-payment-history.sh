#!/usr/bin/env bash
#
# Retrieve a bounded page of payment history from the Invoisio Soroban contract
#
# Usage: ./invoke-payment-history.sh <cursor> [limit]
#
# Arguments:
#   cursor - Next history index to read from
#   limit  - Optional page size (default: 25)
#
# Environment variables:
#   STELLAR_NETWORK   - Network to use (default: testnet)
#   STELLAR_IDENTITY  - Identity to sign with (default: invoisio-admin)
#   CONTRACT_ID       - Override contract ID (default: read from .contract-id file)
#
# Example:
#   ./invoke-payment-history.sh 0 25
#
# NOTE (issue #512): payment_history is admin-gated — it enumerates every
# payment on the platform, which is exactly the bulk disclosure this
# contract's privacy guarantee exists to prevent for anyone but the admin.
# STELLAR_IDENTITY must be the current contract admin's identity; this
# script derives its address and passes it as the admin argument, signing
# the call as that identity. The old invoke-payments-by-payer.sh was removed
# entirely along with the payments_by_payer() method it called (issue #512).

set -e

cd "$(dirname "$0")"

# Configuration
NETWORK="${STELLAR_NETWORK:-testnet}"
IDENTITY="${STELLAR_IDENTITY:-invoisio-admin}"
CONTRACT_ID_FILE="contracts/invoice-payment/.contract-id"

# Parse arguments
CURSOR="$1"
LIMIT="${2:-25}"

# Show usage if cursor is missing
if [ -z "$CURSOR" ]; then
    echo "Usage: $0 <cursor> [limit]"
    echo ""
    echo "Example:"
    echo "  $0 0 25"
    exit 1
fi

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
echo "Retrieving Payment History (admin-gated)"
echo "========================================="
echo "Contract ID: $CONTRACT_ID"
echo "Admin:       $IDENTITY ($ADMIN_ADDRESS)"
echo "Cursor:      $CURSOR"
echo "Limit:       $LIMIT"
echo "Network:     $NETWORK"
echo ""

# Invoke payment_history(admin, cursor, limit)
stellar contract invoke \
    --id "$CONTRACT_ID" \
    --source "$IDENTITY" \
    --network "$NETWORK" \
    -- payment_history \
    --admin "$ADMIN_ADDRESS" \
    --cursor "$CURSOR" \
    --limit "$LIMIT"

echo ""
