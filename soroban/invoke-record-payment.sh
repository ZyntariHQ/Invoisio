#!/usr/bin/env bash
#
# Record an invoice payment on the Invoisio Soroban contract
#
# Usage: ./invoke-record-payment.sh <invoice_id> <payer> <asset_code> <asset_issuer> <amount>
#
# Arguments:
#   invoice_id    - Unique invoice identifier (e.g., 'invoisio-abc123')
#   payer         - Stellar account address that made the payment (G...)
#   asset_code    - Asset code ('XLM' for native, or 'USDC', 'EURT', etc.)
#   asset_issuer  - Issuer address for tokens (use empty string "" for XLM)
#   amount        - Amount in smallest unit (stroops for XLM, token base units otherwise)
#
# Environment variables:
#   STELLAR_NETWORK   - Network to use (default: testnet)
#   STELLAR_IDENTITY  - Identity to sign with (default: invoisio-admin)
#   CONTRACT_ID       - Override contract ID (default: read from .contract-id file)
#
# Examples:
#   XLM payment (1 XLM = 10,000,000 stroops):
#     ./invoke-record-payment.sh invoisio-001 GB7TAYRUZGE6TVT7NHP5SMIZRNQA6PLM423EYISAOAP3MKYIQMVYP2JO XLM "" 10000000
#
#   USDC payment (5 USDC with 7 decimals = 50,000,000):
#     ./invoke-record-payment.sh invoisio-002 GB7TAYRUZGE6TVT7NHP5SMIZRNQA6PLM423EYISAOAP3MKYIQMVYP2JO USDC GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5 50000000

set -e
set -o pipefail

cd "$(dirname "$0")"

# Address validation function
validate_stellar_address() {
    if ! [[ $1 =~ ^G[A-Z2-7]{55}$ ]]; then
        return 1
    fi
    return 0
}

# Configuration
NETWORK="${STELLAR_NETWORK:-testnet}"
IDENTITY="${STELLAR_IDENTITY:-invoisio-admin}"
CONTRACT_ID_FILE="contracts/invoice-payment/.contract-id"

# Parse arguments
INVOICE_ID="$1"
PAYER="$2"
ASSET_CODE="$3"
ASSET_ISSUER="$4"
AMOUNT="$5"

# Show usage if arguments are missing
if [ $# -lt 5 ]; then
    echo "Usage: $0 <invoice_id> <payer> <asset_code> <asset_issuer> <amount>"
    echo ""
    echo "Arguments:"
    echo "  invoice_id    - Unique invoice identifier (e.g., 'invoisio-abc123')"
    echo "  payer         - Stellar account that made the payment (G...)"
    echo "  asset_code    - Asset code ('XLM' for native, or 'USDC', 'EURT', etc.)"
    echo "  asset_issuer  - Issuer address for tokens (use \"\" for XLM)"
    echo "  amount        - Amount in smallest unit (stroops for XLM)"
    echo ""
    echo "Examples:"
    echo "  XLM payment (1 XLM = 10,000,000 stroops):"
    echo "    $0 invoisio-001 GB... XLM \"\" 10000000"
    echo ""
    echo "  USDC payment (5 USDC with 7 decimals = 50,000,000):"
    echo "    $0 invoisio-002 GB... USDC GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5 50000000"
    exit 1
fi

# Input validation
if [ -z "$INVOICE_ID" ]; then
    echo "❌ Error: invoice_id cannot be empty"
    exit 1
fi

if [ -z "$PAYER" ]; then
    echo "❌ Error: payer address cannot be empty"
    exit 1
fi

if ! validate_stellar_address "$PAYER"; then
    echo "❌ Error: Invalid Stellar address format for payer: $PAYER"
    echo "   Expected format: G followed by 55 base-32 characters"
    exit 1
fi

if [ -z "$ASSET_CODE" ]; then
    echo "❌ Error: asset_code cannot be empty"
    exit 1
fi

if ! [[ "$AMOUNT" =~ ^[0-9]+$ ]] || [ "$AMOUNT" -le 0 ]; then
    echo "❌ Error: amount must be a positive integer"
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

# Display operation details
echo "========================================="
echo "Recording Payment"
echo "========================================="
echo "Contract ID:    $CONTRACT_ID"
echo "Invoice ID:     $INVOICE_ID"
echo "Payer:          $PAYER"
echo "Asset Code:     $ASSET_CODE"
if [ -z "$ASSET_ISSUER" ]; then
    echo "Asset Issuer:   <native XLM>"
else
    echo "Asset Issuer:   $ASSET_ISSUER"
fi
echo "Amount:         $AMOUNT"
echo "Network:        $NETWORK"
echo "Identity:       $IDENTITY"
echo ""

# Invoke record_payment
echo "🚀 Invoking record_payment..."
echo ""

# For XLM (empty issuer), we need to pass '""' as a JSON empty string
if [ -z "$ASSET_ISSUER" ]; then
    ISSUER_ARG='""'
else
    ISSUER_ARG="$ASSET_ISSUER"
fi

stellar contract invoke \
    --id "$CONTRACT_ID" \
    --source "$IDENTITY" \
    --network "$NETWORK" \
    --send yes \
    -- record_payment \
    --invoice_id "$INVOICE_ID" \
    --payer "$PAYER" \
    --asset_code "$ASSET_CODE" \
    --asset_issuer "$ISSUER_ARG" \
    --amount "$AMOUNT"

echo ""
echo "✅ Payment recorded successfully!"
echo ""
echo "Verify the payment:"
echo "  ./invoke-get-payment.sh $INVOICE_ID"
echo ""
echo "Check if payment exists:"
echo "  ./invoke-has-payment.sh $INVOICE_ID"
