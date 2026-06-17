# Build the contract
build:
	stellar contract build

# Optimize the WASM
optimize:
	stellar contract optimize --wasm target/wasm32-unknown-unknown/release/invoice_escrow.wasm

# Test the contract
test:
	cargo test

# Clean
clean:
	cargo clean

# Deploy to testnet
deploy-testnet:
	stellar contract deploy \
		--source $(SOURCE) \
		--network testnet \
		--wasm target/wasm32-unknown-unknown/release/invoice_escrow.wasm

.PHONY: build optimize test clean deploy-testnet
