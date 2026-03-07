#!/bin/bash

set -e

echo "========================================="
echo "Soroban Integration Setup"
echo "========================================="
echo ""

# Check if contract is deployed
CONTRACT_ID_FILE="../soroban/contracts/invoice-payment/.contract-id"

if [ ! -f "$CONTRACT_ID_FILE" ]; then
  echo "❌ Contract not deployed yet"
  echo ""
  echo "Please deploy the contract first:"
  echo "  cd ../soroban"
  echo "  ./build.sh"
  echo "  ./deploy.sh"
  echo ""
  exit 1
fi

CONTRACT_ID=$(cat "$CONTRACT_ID_FILE")

echo "✅ Found deployed contract: $CONTRACT_ID"
echo ""

# Check if .env exists
if [ ! -f ".env" ]; then
  echo "Creating .env from .env.example..."
  cp .env.example .env
fi

# Update .env with contract ID
if grep -q "^SOROBAN_CONTRACT_ID=" .env; then
  sed -i.bak "s|^SOROBAN_CONTRACT_ID=.*|SOROBAN_CONTRACT_ID=$CONTRACT_ID|" .env
  rm .env.bak 2>/dev/null || true
else
  echo "SOROBAN_CONTRACT_ID=$CONTRACT_ID" >> .env
fi

echo "✅ Updated .env with SOROBAN_CONTRACT_ID"
echo ""

# Run migration
echo "Running database migration..."
npx prisma migrate deploy

echo ""
echo "========================================="
echo "✅ Setup Complete!"
echo "========================================="
echo ""
echo "Contract ID: $CONTRACT_ID"
echo ""
echo "Start the backend:"
echo "  npm run start:dev"
echo ""
