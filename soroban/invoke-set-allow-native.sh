#!/usr/bin/env bash
#
# Toggle whether native XLM payments are permitted on the Invoisio contract
#
# Usage: ./invoke-set-allow-native.sh <true|false>
#
# Arguments:
#   allowed       - true or false
#
# Environment variables:
#   STELLAR_NETWORK   - Network to use (default: testnet)
#   STELLAR_IDENTITY  - Identity to sign with (default: invoisio-admin)
#   CONTRACT_ID       - Override contract ID (default: read from .contract-id file)
#

set -e
set -o pipefail

cd "$(dirname "$0")"

NETWORK="${STELLAR_NETWORK:-testnet}"
IDENTITY="${STELLAR_IDENTITY:-invoisio-admin}"
CONTRACT_ID_FILE="contracts/invoice-payment/.contract-id"

ALLOWED="$1"

if [ -z "$ALLOWED" ]; then
    echo "Usage: $0 <true|false>"
    echo ""
    echo "Arguments:"
    echo "  allowed       - true or false"
    exit 1
fi

if [ "$ALLOWED" != "true" ] && [ "$ALLOWED" != "false" ]; then
    echo "❌ Error: Argument must be exactly 'true' or 'false'"
    exit 1
fi

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
echo "Setting Allow Native"
echo "========================================="
echo "Contract ID:    $CONTRACT_ID"
echo "Allowed:        $ALLOWED"
echo "Network:        $NETWORK"
echo "Identity:       $IDENTITY"
echo ""
echo "🚀 Invoking set_allow_native..."
echo ""

stellar contract invoke \
    --id "$CONTRACT_ID" \
    --source "$IDENTITY" \
    --network "$NETWORK" \
    --send yes \
    -- set_allow_native \
    --allowed "$ALLOWED"

echo ""
echo "✅ Native allowlist status updated successfully!"
echo ""
