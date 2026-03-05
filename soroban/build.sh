#!/usr/bin/env bash
#
# Build the Invoisio invoice-payment Soroban contract
#
# Usage: ./build.sh
#
# This script compiles the Rust contract to WASM for deployment on Stellar.

set -e

cd "$(dirname "$0")"

echo "========================================="
echo "Building Invoisio Invoice Payment Contract"
echo "========================================="
echo ""

# Check prerequisites
echo "🔍 Checking prerequisites..."
echo ""

if ! command -v stellar &> /dev/null; then
    echo "❌ Error: stellar CLI not found"
    echo ""
    echo "Install with:"
    echo "  cargo install --locked stellar-cli --features opt"
    echo ""
    echo "Or visit: https://developers.stellar.org/docs/tools/developer-tools/cli/stellar-cli"
    exit 1
fi

if ! command -v rustc &> /dev/null; then
    echo "❌ Error: Rust toolchain not found"
    echo ""
    echo "Install with:"
    echo "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
    exit 1
fi

echo "✅ stellar CLI: $(stellar --version | head -n1)"
echo "✅ Rust: $(rustc --version)"

# Check for wasm32v1-none target
if ! rustup target list --installed | grep -q "wasm32v1-none"; then
    echo ""
    echo "⚠️  wasm32v1-none target not installed"
    echo "📦 Installing wasm32v1-none target..."
    rustup target add wasm32v1-none
fi

echo "✅ wasm32v1-none target installed"
echo ""

# Build the contract
echo "🔨 Building contract..."
echo ""
stellar contract build

echo ""
echo "✅ Build complete!"
echo ""
echo "📦 WASM output:"
ls -lh target/wasm32v1-none/release/invoice_payment.wasm

echo ""
echo "Contract is ready for deployment!"
echo ""
echo "Next steps:"
echo "  ./deploy.sh              - Deploy to Stellar testnet"
echo "  cargo test               - Run unit tests"
