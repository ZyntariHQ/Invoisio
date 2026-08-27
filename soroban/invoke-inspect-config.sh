#!/usr/bin/env bash
# ============================================================================
# invoke-inspect-config.sh — Inspect general configuration of Invoisio contract
# ============================================================================
#
# Query and display initialization status, admin identity, version metadata,
# and high-level policies.
#
# Usage:
#   ./invoke-inspect-config.sh
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
echo "Inspecting Contract Configuration"
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

# Parse variables out of JSON
ADMIN=$(echo "$CONFIG_OUTPUT" | grep -o '"admin":[^,]*' | head -n 1 | cut -d: -f2- | tr -d '[:space:]"' || true)
PENDING_ADMIN=$(echo "$CONFIG_OUTPUT" | grep -o '"pending_admin":[^,]*' | head -n 1 | cut -d: -f2- | tr -d '[:space:]"' || true)
INITIALIZED=$(echo "$CONFIG_OUTPUT" | grep -o '"initialized":[^,]*' | head -n 1 | cut -d: -f2- | tr -d '[:space:]"}' || true)
PAUSED=$(echo "$CONFIG_OUTPUT" | grep -o '"paused":[^,]*' | head -n 1 | cut -d: -f2- | tr -d '[:space:]"}' || true)
CONTRACT_VERSION=$(echo "$CONFIG_OUTPUT" | grep -o '"contract_version":[^,]*' | head -n 1 | cut -d: -f2- | tr -d '[:space:]"}' || true)
SCHEMA_VERSION=$(echo "$CONFIG_OUTPUT" | grep -o '"storage_schema_version":[^,]*' | head -n 1 | cut -d: -f2- | tr -d '[:space:]"}' || true)

# Print human-readable operational checklist
echo "On-Chain Operational Status:"
echo "-----------------------------------------"
if [ "$INITIALIZED" = "true" ]; then
    echo "Status:          🟢 Initialized"
    echo "Current Admin:   $ADMIN"
else
    echo "Status:          🔴 Uninitialized (Not ready)"
    echo "Current Admin:   None"
fi

if [ -n "$PENDING_ADMIN" ] && [ "$PENDING_ADMIN" != "null" ]; then
    echo "Pending Admin:   ⚠️  $PENDING_ADMIN (Awaiting accept_admin)"
else
    echo "Pending Admin:   None"
fi

if [ "$PAUSED" = "true" ]; then
    echo "Contract State:  ⚠️  PAUSED (Writes disabled)"
else
    echo "Contract State:  ✅ ACTIVE"
fi

echo ""
echo "Contract Metadata:"
echo "-----------------------------------------"
echo "Contract Code Version: $CONTRACT_VERSION"
echo "Storage Schema Version: $SCHEMA_VERSION"
echo ""

echo "Allowlist Policies:"
echo "-----------------------------------------"
echo "To view full allowlist details, run: ./invoke-inspect-allowlist.sh"
echo ""
