#!/usr/bin/env bash
# ============================================================================
# invoke-inspect-allowlist.sh — Inspect allowlist settings on the Invoisio contract
# ============================================================================
#
# Query the allowlist settings of the contract by invoking the config() view.
#
# Usage:
#   ./invoke-inspect-allowlist.sh
#
# Environment variables:
#   STELLAR_NETWORK   Network to use (default: testnet)
#   CONTRACT_ID       Override contract ID (default: read from .contract-id file)
#   STELLAR_IDENTITY  Identity to sign query with (default: invoisio-admin)
# ============================================================================

set -euo pipefail

cd "$(dirname "$0")"

NETWORK="${STELLAR_NETWORK:-testnet}"
IDENTITY="${STELLAR_IDENTITY:-invoisio-admin}"
CONTRACT_ID_FILE="contracts/invoice-payment/.contract-id"

# Get contract ID based on network
if [ "$NETWORK" = "mainnet" ]; then
    CONTRACT_ID_FILE="contracts/invoice-payment/.contract-id-mainnet"
fi

if [ -n "${CONTRACT_ID:-}" ]; then
    echo "ℹ️  Using CONTRACT_ID from environment: $CONTRACT_ID" >&2
elif [ -f "$CONTRACT_ID_FILE" ]; then
    CONTRACT_ID=$(tr -d '[:space:]' < "$CONTRACT_ID_FILE")
else
    echo "❌ Error: Contract ID not found" >&2
    echo "" >&2
    echo "Either:" >&2
    echo "  1. Deploy the contract first: ./deploy.sh" >&2
    echo "  2. Set CONTRACT_ID environment variable" >&2
    exit 1
fi

echo "========================================="
echo "Inspecting Allowlist Settings"
echo "========================================="
echo "Contract ID: $CONTRACT_ID"
echo "Network:     $NETWORK"
echo ""

CONFIG_OUTPUT=$(stellar contract invoke \
    --id "$CONTRACT_ID" \
    --source "$IDENTITY" \
    --network "$NETWORK" \
    -- config 2>/dev/null) || {
    echo "❌ Error: Failed to invoke config on contract." >&2
    exit 3
}

# In Soroban, config returns a JSON object. We can check the native_allowed and requires_token_allowlist fields.
NATIVE_ALLOWED=$(echo "$CONFIG_OUTPUT" | grep -o '"native_allowed":[^,]*' | head -n 1 | cut -d: -f2 | tr -d '[:space:]"}' || true)
REQUIRES_TOKEN=$(echo "$CONFIG_OUTPUT" | grep -o '"requires_token_allowlist":[^,]*' | head -n 1 | cut -d: -f2 | tr -d '[:space:]"}' || true)

# Fallback parser for non-JSON formatted text representations (if any)
if [ -z "$NATIVE_ALLOWED" ]; then
    NATIVE_ALLOWED=$(echo "$CONFIG_OUTPUT" | grep -i "native_allowed" | grep -o -E "true|false" || echo "unknown")
fi
if [ -z "$REQUIRES_TOKEN" ]; then
    REQUIRES_TOKEN=$(echo "$CONFIG_OUTPUT" | grep -i "requires_token_allowlist" | grep -o -E "true|false" || echo "unknown")
fi

echo "Allowlist Configuration Status:"
echo "-----------------------------------------"

if [ "$NATIVE_ALLOWED" = "true" ]; then
    echo "✅ Native XLM: Allowed"
    echo "   (Payer can pay in native Stellar XLM. To disable, run ./invoke-set-allow-native.sh false)"
else
    echo "❌ Native XLM: Denied"
    echo "   (Payer cannot pay in native Stellar XLM. To enable, run ./invoke-set-allow-native.sh true)"
fi

if [ "$REQUIRES_TOKEN" = "true" ]; then
    echo "🔒 Token Allowlist: Enabled (requires_token_allowlist=true)"
    echo "   (Stellar tokens must be explicitly allowlisted before record_payment accepts them)"
else
    echo "🔓 Token Allowlist: Disabled (requires_token_allowlist=false)"
    echo "   (Any Stellar token is allowed)"
fi

echo ""
echo "Operations Guidance:"
echo "  - To list all configured assets, run: ./invoke-list-assets.sh"
echo "  - To allow a token, run:            ./invoke-allow-asset.sh <code> <issuer>"
echo "  - To revoke a token, run:           ./invoke-revoke-asset.sh <code> <issuer>"
echo ""
