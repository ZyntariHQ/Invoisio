#!/bin/bash
# Multi-Asset Payment Recording Demo
# This script demonstrates recording payments for both XLM and tokens

set -e

# Configuration
CONTRACT_ID="${CONTRACT_ID:-CBQHNAXSI55GX2GN6D67GK7BHVPSLJUGZQEU7WJ5LKR5PNUCGLIMAO4K}"
ADMIN="${ADMIN:-GADMIN...}"
PAYER="${PAYER:-GPAYER...}"
NETWORK="${NETWORK:-testnet}"

echo "==================================="
echo "Multi-Asset Payment Recording Demo"
echo "==================================="
echo ""
echo "Contract ID: $CONTRACT_ID"
echo "Network: $NETWORK"
echo ""

# Example 1: Record XLM payment
echo "📝 Example 1: Recording XLM payment"
echo "-----------------------------------"
echo "Invoice: invoisio-xlm-demo-001"
echo "Amount: 10 XLM (100,000,000 stroops)"
echo ""

stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source "$ADMIN" \
  --network "$NETWORK" \
  -- \
  record_payment \
  --invoice_id "invoisio-xlm-demo-001" \
  --payer "$PAYER" \
  --asset_code "XLM" \
  --asset_issuer "" \
  --amount "100000000"

echo "✅ XLM payment recorded"
echo ""

# Example 2: Record USDC payment
echo "📝 Example 2: Recording USDC payment"
echo "-------------------------------------"
echo "Invoice: invoisio-usdc-demo-001"
echo "Amount: 50 USDC (500,000,000 units)"
echo "Issuer: GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"
echo ""

stellar contract invoke \
  --id "$CONTRACT_ID" \
  --source "$ADMIN" \
  --network "$NETWORK" \
  -- \
  record_payment \
  --invoice_id "invoisio-usdc-demo-001" \
  --payer "$PAYER" \
  --asset_code "USDC" \
  --asset_issuer "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" \
  --amount "500000000"

echo "✅ USDC payment recorded"
echo ""

# Example 3: Query XLM payment
echo "🔍 Example 3: Querying XLM payment"
echo "-----------------------------------"

stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network "$NETWORK" \
  -- \
  get_payment \
  --invoice_id "invoisio-xlm-demo-001"

echo ""

# Example 4: Query USDC payment
echo "🔍 Example 4: Querying USDC payment"
echo "------------------------------------"

stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network "$NETWORK" \
  -- \
  get_payment \
  --invoice_id "invoisio-usdc-demo-001"

echo ""

# Example 5: Check payment count
echo "📊 Example 5: Total payment count"
echo "----------------------------------"

stellar contract invoke \
  --id "$CONTRACT_ID" \
  --network "$NETWORK" \
  -- \
  payment_count

echo ""
echo "==================================="
echo "Demo completed successfully! ✨"
echo "==================================="
