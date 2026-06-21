#!/usr/bin/env bash
#
# Deploy the Invoisio invoice-payment contract to Stellar
#
# Usage:
#   ./deploy.sh                          # deploys to testnet (default)
#   STELLAR_NETWORK=mainnet ./deploy.sh  # deploys to mainnet
#
# Environment variables:
#   STELLAR_NETWORK        - Network to deploy to (default: testnet)
#   STELLAR_IDENTITY       - Override identity name from manifest
#   INVOISIO_ADMIN_SECRET  - Admin secret key (optional; falls back to local keys identity)
#
# Manifest files (read automatically based on STELLAR_NETWORK):
#   manifests/testnet.toml
#   manifests/mainnet.toml
#
# The script will:
#   1. Load the network manifest for the target environment
#   2. Create/verify the identity exists
#   3. Fund the account from Friendbot (testnet only)
#   4. Deploy the contract WASM
#   5. Initialize the contract with the admin address
#   6. Save the CONTRACT_ID to the path defined in the manifest

set -e

cd "$(dirname "$0")"

# ── Load manifest ────────────────────────────────────────────────────────────

NETWORK="${STELLAR_NETWORK:-testnet}"
MANIFEST_FILE="manifests/${NETWORK}.toml"

if [ ! -f "$MANIFEST_FILE" ]; then
    echo "❌ Error: No manifest found for network '${NETWORK}'"
    echo "   Expected: ${MANIFEST_FILE}"
    echo "   Available manifests: $(ls manifests/*.toml 2>/dev/null | xargs -n1 basename | tr '\n' ' ')"
    exit 1
fi

echo "📋 Loading manifest: ${MANIFEST_FILE}"

# Parse TOML values with grep (no external deps required)
_toml_get() {
    grep -E "^${1}\s*=" "$MANIFEST_FILE" | head -1 | sed 's/^[^=]*=\s*//' | tr -d '"' | tr -d "'"
}

MANIFEST_IDENTITY="$(_toml_get identity.name 2>/dev/null || true)"
MANIFEST_WASM_PATH="$(_toml_get wasm_path 2>/dev/null || true)"
MANIFEST_CONTRACT_ID_FILE="$(_toml_get contract_id_file 2>/dev/null || true)"
MANIFEST_SECRET_KEY_ENV="$(_toml_get secret_key_env 2>/dev/null || true)"

# Resolve configuration (env overrides manifest)
IDENTITY="${STELLAR_IDENTITY:-${MANIFEST_IDENTITY:-invoisio-admin}}"
WASM_PATH="${MANIFEST_WASM_PATH:-target/wasm32v1-none/release/invoice_payment.wasm}"
CONTRACT_ID_FILE="${MANIFEST_CONTRACT_ID_FILE:-contracts/invoice-payment/.contract-id}"

# If a secret key env var is configured in the manifest, try to use it
if [ -n "$MANIFEST_SECRET_KEY_ENV" ]; then
    ADMIN_SECRET="${!MANIFEST_SECRET_KEY_ENV:-}"
fi

echo "========================================="
echo "Deploying Invoisio Contract"
echo "========================================="
echo ""
echo "Network:  $NETWORK"
echo "Identity: $IDENTITY"
echo ""

# Check prerequisites
if ! command -v stellar &> /dev/null; then
    echo "❌ Error: stellar CLI not found"
    echo "Run ./build.sh first to check prerequisites"
    exit 1
fi

# Check WASM exists
if [ ! -f "$WASM_PATH" ]; then
    echo "❌ Error: Contract WASM not found at $WASM_PATH"
    echo ""
    echo "Build the contract first:"
    echo "  ./build.sh"
    exit 1
fi

# Step 1: Create or verify identity
echo "🔑 Step 1/4: Setting up identity '$IDENTITY'..."
echo ""

if stellar keys show "$IDENTITY" &> /dev/null; then
    echo "✅ Identity '$IDENTITY' already exists"
    ADMIN_ADDRESS=$(stellar keys address "$IDENTITY")
    echo "   Address: $ADMIN_ADDRESS"
else
    echo "📝 Creating new identity '$IDENTITY'..."
    stellar keys generate --global "$IDENTITY" --network "$NETWORK"
    ADMIN_ADDRESS=$(stellar keys address "$IDENTITY")
    echo "✅ Identity created"
    echo "   Address: $ADMIN_ADDRESS"
fi

echo ""

# Step 2: Fund account (testnet only)
if [ "$NETWORK" = "testnet" ]; then
    echo "💰 Step 2/4: Funding account from Friendbot..."
    echo ""

    if stellar keys fund "$IDENTITY" --network "$NETWORK" 2>&1; then
        echo "✅ Account funded successfully"
    else
        echo "⚠️  Funding may have failed (account might already have balance)"
        echo "   Continuing with deployment..."
    fi
else
    echo "⚠️  Step 2/4: Skipping Friendbot funding (not on testnet)"
    echo "   Ensure the account has sufficient XLM balance"
fi

echo ""

# Step 3: Deploy contract
echo "🚀 Step 3/4: Deploying contract to $NETWORK..."
echo ""

CONTRACT_ID=$(stellar contract deploy \
    --wasm "$WASM_PATH" \
    --source "$IDENTITY" \
    --network "$NETWORK")

echo "✅ Contract deployed!"
echo "   Contract ID: $CONTRACT_ID"
echo ""

# Save contract ID with secure permissions
echo "$CONTRACT_ID" > "$CONTRACT_ID_FILE"
chmod 600 "$CONTRACT_ID_FILE" 2>/dev/null || true  # Secure file, ignore on Windows
echo "💾 Contract ID saved to $CONTRACT_ID_FILE"
echo ""

# Step 4: Initialize contract
echo "⚙️  Step 4/4: Initializing contract..."
echo ""

stellar contract invoke \
    --id "$CONTRACT_ID" \
    --source "$IDENTITY" \
    --network "$NETWORK" \
    -- initialize \
    --admin "$ADMIN_ADDRESS"

echo ""
echo "✅ Contract initialized with admin: $ADMIN_ADDRESS"
echo ""

# Success summary
echo "========================================="
echo "🎉 Deployment Complete!"
echo "========================================="
echo ""
echo "Contract ID: $CONTRACT_ID"
echo "Admin:       $ADMIN_ADDRESS"
echo "Network:     $NETWORK"
echo ""
echo "Next steps:"
echo ""
echo "  Record a payment (XLM):"
  echo "    ./invoke-record-payment.sh \\"
  echo "      invoisio-demo-001 \\"
  echo "      $ADMIN_ADDRESS \\"
  echo "      XLM \"\" 10000000 \\"
  echo "      settle-demo-001"
echo ""
echo "  Query a payment:"
echo "    ./invoke-get-payment.sh invoisio-demo-001"
echo ""
