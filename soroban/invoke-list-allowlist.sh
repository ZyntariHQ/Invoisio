#!/usr/bin/env bash
#
# Retrieve a bounded page of the currently-allowlisted assets from the
# Invoisio Soroban contract (issue #464).
#
# Usage: ./invoke-list-allowlist.sh [cursor] [limit]
#
# Arguments:
#   cursor - Next write-order slot to read from (default: 0)
#   limit  - Optional page size (default: 25)
#
# Environment variables:
#   STELLAR_NETWORK   - Network to use (default: testnet)
#   CONTRACT_ID       - Override contract ID (default: read from .contract-id file)
#
# Example:
#   ./invoke-list-allowlist.sh 0 25

set -e

cd "$(dirname "$0")"

# Configuration
NETWORK="${STELLAR_NETWORK:-testnet}"
IDENTITY="${STELLAR_IDENTITY:-invoisio-admin}"
CONTRACT_ID_FILE="contracts/invoice-payment/.contract-id"

# Parse arguments
CURSOR="${1:-0}"
LIMIT="${2:-25}"

# Get contract ID
if [ -n "${CONTRACT_ID:-}" ]; then
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
echo "Listing Allowlisted Assets"
echo "========================================="
echo "Contract ID: $CONTRACT_ID"
echo "Cursor:      $CURSOR"
echo "Limit:       $LIMIT"
echo "Network:     $NETWORK"
echo ""

# Invoke allowed_assets
stellar contract invoke \
    --id "$CONTRACT_ID" \
    --source "$IDENTITY" \
    --network "$NETWORK" \
    -- allowed_assets \
    --cursor "$CURSOR" \
    --limit "$LIMIT"

echo ""
echo "Notes:"
echo "  - A 'has_more: true' result means more pages remain — re-run with the"
echo "    returned 'next_cursor' as this script's cursor argument."
echo "  - 'gaps_skipped' counts revoked (or, on a legacy pre-migration"
echo "    deployment, not-yet-backfilled) slots skipped in this page's range —"
echo "    not itself an error signal, since a revoke is expected to leave one."
echo "  - For a single O(1) count instead of paging through everything, use:"
echo "    stellar contract invoke --id \"$CONTRACT_ID\" --source \"$IDENTITY\" \\"
echo "        --network \"$NETWORK\" -- allowlist_count"
