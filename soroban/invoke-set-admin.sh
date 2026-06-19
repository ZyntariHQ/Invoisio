#!/usr/bin/env bash
#
# Transfer admin rights to a new admin on the Invoisio Soroban contract
#
# Usage: ./invoke-set-admin.sh <new_admin>
#
# Arguments:
#   new_admin     - Stellar account address for the new admin (G...)
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

NEW_ADMIN="$1"

if [ -z "$NEW_ADMIN" ]; then
    echo "Usage: $0 <new_admin>"
    echo ""
    echo "Arguments:"
    echo "  new_admin     - Stellar account address for the new admin (G...)"
    exit 1
fi

if ! validate_stellar_address "$NEW_ADMIN"; then
    echo "❌ Error: Invalid Stellar address format for new_admin: $NEW_ADMIN"
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
echo "Transferring Admin Rights"
echo "========================================="
echo "Contract ID:    $CONTRACT_ID"
echo "New Admin:      $NEW_ADMIN"
echo "Network:        $NETWORK"
echo "Identity:       $IDENTITY"
echo ""
echo "🚀 Invoking set_admin..."
echo ""

stellar contract invoke \
    --id "$CONTRACT_ID" \
    --source "$IDENTITY" \
    --network "$NETWORK" \
    --send yes \
    -- set_admin \
    --new_admin "$NEW_ADMIN"

echo ""
echo "✅ Admin transferred successfully!"
echo ""
