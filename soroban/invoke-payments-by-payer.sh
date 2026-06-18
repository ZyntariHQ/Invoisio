#!/usr/bin/env bash
#
# Retrieve a bounded page of payment history filtered to a single payer
# from the Invoisio Soroban contract
#
# Usage: ./invoke-payments-by-payer.sh <payer> <cursor> [limit]
#
# Arguments:
#   payer  - Stellar account address (G...) to filter payments by
#   cursor - Next history index to read from
#   limit  - Optional page size (default: 25)
#
# Environment variables:
#   STELLAR_NETWORK   - Network to use (default: testnet)
#   CONTRACT_ID       - Override contract ID (default: read from .contract-id file)
#
# Example:
#   ./invoke-payments-by-payer.sh GB7TAYRUZGE6T... 0 25

set -e

cd "$(dirname "$0")"

# Configuration
NETWORK="${STELLAR_NETWORK:-testnet}"
IDENTITY="${STELLAR_IDENTITY:-invoisio-admin}"
CONTRACT_ID_FILE="contracts/invoice-payment/.contract-id"

# Parse arguments
PAYER="$1"
CURSOR="$2"
LIMIT="${3:-25}"

# Show usage if required arguments are missing
if [ -z "$PAYER" ] || [ -z "$CURSOR" ]; then
    echo "Usage: $0 <payer> <cursor> [limit]"
    echo ""
    echo "Example:"
    echo "  $0 GB7TAYRUZGE6T... 0 25"
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

echo "========================================="
echo "Retrieving Payments By Payer"
echo "========================================="
echo "Contract ID: $CONTRACT_ID"
echo "Payer:       $PAYER"
echo "Cursor:      $CURSOR"
echo "Limit:       $LIMIT"
echo "Network:     $NETWORK"
echo ""

# Invoke payments_by_payer
stellar contract invoke \
    --id "$CONTRACT_ID" \
    --source "$IDENTITY" \
    --network "$NETWORK" \
    -- payments_by_payer \
    --payer "$PAYER" \
    --cursor "$CURSOR" \
    --limit "$LIMIT"

echo ""
