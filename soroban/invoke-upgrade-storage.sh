#!/usr/bin/env bash
#
# Run the storage schema migration on the Invoisio Soroban contract
#
# Usage: ./invoke-upgrade-storage.sh
#
# Environment variables:
#   STELLAR_NETWORK   - Network to use (default: testnet)
#   STELLAR_IDENTITY  - Identity to sign with (default: invoisio-admin)
#   CONTRACT_ID       - Override contract ID (default: read from .contract-id file)
#
# This calls the contract's upgrade_storage(admin) method, which migrates
# on-chain storage to the current STORAGE_SCHEMA_VERSION. Safe to call
# multiple times — idempotent.
#
# This is step 3 of the documented upgrade runbook (docs/upgrade-runbook.md):
# run it after ./invoke-upgrade.sh has switched the contract over to the new
# code, and before ./invoke-unpause.sh.

set -e
set -o pipefail

cd "$(dirname "$0")"

NETWORK="${STELLAR_NETWORK:-testnet}"
IDENTITY="${STELLAR_IDENTITY:-invoisio-admin}"
CONTRACT_ID_FILE="contracts/invoice-payment/.contract-id"
if [ "$NETWORK" = "mainnet" ]; then
    CONTRACT_ID_FILE="contracts/invoice-payment/.contract-id-mainnet"
fi

if [ -n "${CONTRACT_ID:-}" ]; then
    echo "ℹ️  Using CONTRACT_ID from environment: $CONTRACT_ID"
elif [ -f "$CONTRACT_ID_FILE" ]; then
    CONTRACT_ID=$(tr -d '[:space:]' < "$CONTRACT_ID_FILE")
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
echo "Running Storage Migration"
echo "========================================="
echo "Contract ID: $CONTRACT_ID"
echo "Network:     $NETWORK"
echo "Identity:    $IDENTITY ($ADMIN_ADDRESS)"
echo ""
echo "🚀 Invoking upgrade_storage(admin)..."
echo ""

stellar contract invoke \
    --id "$CONTRACT_ID" \
    --source "$IDENTITY" \
    --network "$NETWORK" \
    --send yes \
    -- upgrade_storage \
    --admin "$ADMIN_ADDRESS"

echo ""
echo "✅ Storage migration complete!"
echo ""
echo "Verify before unpausing:"
echo "  ./invoke-inspect-config.sh"
echo ""
echo "Then unpause:"
echo "  ./invoke-unpause.sh"
echo ""
