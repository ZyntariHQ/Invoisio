#!/usr/bin/env bash
#
# Check if a payment exists for an invoice in the Invoisio Soroban contract
#
# Usage: ./invoke-has-payment.sh <invoice_id>
#
# Arguments:
#   invoice_id - Invoice identifier to check
#
# Environment variables:
#   STELLAR_NETWORK   - Network to use (default: testnet)
#   CONTRACT_ID       - Override contract ID (default: read from .contract-id file)
#
# Returns: "true" if payment exists, "false" otherwise
#
# Example:
#   ./invoke-has-payment.sh invoisio-abc123

set -e

cd "$(dirname "$0")"

# Configuration
NETWORK="${STELLAR_NETWORK:-testnet}"
IDENTITY="${STELLAR_IDENTITY:-invoisio-admin}"
CONTRACT_ID_FILE="contracts/invoice-payment/.contract-id"

# Parse arguments
INVOICE_ID="$1"

# Show usage if invoice ID is missing
if [ -z "$INVOICE_ID" ]; then
    echo "Usage: $0 <invoice_id>"
    echo ""
    echo "Example:"
    echo "  $0 invoisio-abc123"
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

echo "Checking payment existence for invoice: $INVOICE_ID"
echo ""

# Invoke has_payment
RESULT=$(stellar contract invoke \
    --id "$CONTRACT_ID" \
    --source "$IDENTITY" \
    --network "$NETWORK" \
    -- has_payment \
    --invoice_id "$INVOICE_ID")

echo "Result: $RESULT"
echo ""

if [ "$RESULT" = "true" ]; then
    echo "✅ Payment exists for this invoice"
    echo ""
    echo "Retrieve the full record:"
    echo "  ./invoke-get-payment.sh $INVOICE_ID"
else
    echo "ℹ️  No payment recorded for this invoice"
    echo ""
    echo "Record a payment:"
    echo "  ./invoke-record-payment.sh $INVOICE_ID <payer> <asset_code> <asset_issuer> <amount>"
fi
