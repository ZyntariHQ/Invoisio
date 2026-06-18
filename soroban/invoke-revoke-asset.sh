#!/usr/bin/env bash
#
# Remove an asset from the allowlist on the Invoisio Soroban contract
#
# Usage: ./invoke-revoke-asset.sh <asset_code> <asset_issuer>
#
# Arguments:
#   asset_code    - Asset code (e.g., 'USDC', 'EURT')
#   asset_issuer  - Stellar account address of the issuer (G...)
#
# Environment variables:
#   STELLAR_NETWORK   - Network to use (default: testnet)
#   STELLAR_IDENTITY  - Identity to sign with (default: invoisio-admin)
#   CONTRACT_ID       - Override contract ID (default: read from .contract-id file)
#

set -e
set -o pipefail

cd "$(dirname "$0")"

validate_stellar_address() {
    if ! [[ $1 =~ ^G[A-Z2-7]{55}$ ]]; then
        return 1
    fi
    return 0
}

NETWORK="${STELLAR_NETWORK:-testnet}"
IDENTITY="${STELLAR_IDENTITY:-invoisio-admin}"
CONTRACT_ID_FILE="contracts/invoice-payment/.contract-id"

ASSET_CODE="$1"
ASSET_ISSUER="$2"

if [ $# -lt 2 ]; then
    echo "Usage: $0 <asset_code> <asset_issuer>"
    echo ""
    echo "Arguments:"
    echo "  asset_code    - Asset code (e.g., 'USDC')"
    echo "  asset_issuer  - Stellar account address of the issuer (G...)"
    exit 1
fi

if [ -z "$ASSET_CODE" ]; then
    echo "❌ Error: asset_code cannot be empty"
    exit 1
fi

if ! validate_stellar_address "$ASSET_ISSUER"; then
    echo "❌ Error: Invalid Stellar address format for asset_issuer: $ASSET_ISSUER"
    echo "   Expected format: G followed by 55 base-32 characters"
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
echo "Revoking Asset"
echo "========================================="
echo "Contract ID:    $CONTRACT_ID"
echo "Asset Code:     $ASSET_CODE"
echo "Asset Issuer:   $ASSET_ISSUER"
echo "Network:        $NETWORK"
echo "Identity:       $IDENTITY"
echo ""
echo "🚀 Invoking revoke_asset..."
echo ""

stellar contract invoke \
    --id "$CONTRACT_ID" \
    --source "$IDENTITY" \
    --network "$NETWORK" \
    --send yes \
    -- revoke_asset \
    --code "$ASSET_CODE" \
    --issuer "$ASSET_ISSUER"

echo ""
echo "✅ Asset revoked successfully!"
echo ""
