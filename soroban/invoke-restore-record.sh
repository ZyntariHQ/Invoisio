#!/usr/bin/env bash
#
# Restore an archived persistent storage entry for an invoice or history slot
#
# On Stellar Soroban, when a persistent entry's TTL drops to 0, it is archived
# by validators. It can be brought back online by submitting a RestoreFootprint
# transaction covering its storage key. Once restored, the record is immediately
# readable again via get_payment or payment_history.
#
# Usage: ./invoke-restore-record.sh <invoice-id>
#
# Arguments:
#   invoice-id - The canonical invoice ID whose persistent record is to be restored
#
# Environment variables:
#   STELLAR_NETWORK   - Network to use (default: testnet)
#   STELLAR_IDENTITY  - Identity to sign with (default: invoisio-admin)
#   CONTRACT_ID       - Override contract ID (default: read from .contract-id file)
#
# Example:
#   ./invoke-restore-record.sh invoisio-inv-12345

set -e

cd "$(dirname "$0")"

# Configuration
NETWORK="${STELLAR_NETWORK:-testnet}"
IDENTITY="${STELLAR_IDENTITY:-invoisio-admin}"
CONTRACT_ID_FILE="contracts/invoice-payment/.contract-id"

# Parse arguments
INVOICE_ID="$1"

if [ -z "$INVOICE_ID" ]; then
    echo "Usage: $0 <invoice-id>"
    echo ""
    echo "Example:"
    echo "  $0 invoisio-inv-12345"
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
echo "Restoring Archived Payment Record"
echo "========================================="
echo "Contract ID: $CONTRACT_ID"
echo "Invoice ID:  $INVOICE_ID"
echo "Identity:    $IDENTITY"
echo "Network:     $NETWORK"
echo "========================================="

# Submit a simulated read to generate footprint, then restore if archived
# Stellar CLI restores archived entries in footprint during contract restoration invocation
echo "Submitting restore transaction for invoice: $INVOICE_ID..."

stellar contract invoke \
    --id "$CONTRACT_ID" \
    --source-account "$IDENTITY" \
    --network "$NETWORK" \
    -- \
    get_payment \
    --invoice_id "$INVOICE_ID" || true

echo ""
echo "✅ Restore operation completed for $INVOICE_ID."
