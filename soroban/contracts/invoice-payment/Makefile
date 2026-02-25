default: build

all: test

# Build
build:
	stellar contract build
	@ls -l ../../target/wasm32v1-none/release/invoice_payment.wasm

# Test
test: build
	cargo test

fmt:
	cargo fmt --all

clean:
	cargo clean

# Testnet deployment & invocation
# Prerequisites:
#   export ADMIN_SECRET=S...   (testnet secret key for the admin / backend account)
#   The account must have testnet XLM; fund via: https://friendbot.stellar.org
#
# Run targets in order: generate-identity → fund → deploy → invoke-initialize
# → invoke-record-payment → invoke-get-payment

# Generate a fresh local identity (one-time setup)
generate-identity:
	stellar keys generate --global invoisio-admin --network testnet

# Fund the identity from Friendbot
fund:
	stellar keys fund invoisio-admin --network testnet

# Deploy contract WASM to Stellar testnet; saves CONTRACT_ID to .contract-id
deploy: build
	stellar contract deploy \
	  --wasm ../../target/wasm32v1-none/release/invoice_payment.wasm \
	  --source invoisio-admin \
	  --network testnet \
	| tee .contract-id
	@echo "Contract deployed. ID stored in .contract-id"

# Call initialize(admin) once after deployment
# Usage: make invoke-initialize CONTRACT_ID=<id> ADMIN=<G...>
invoke-initialize:
	stellar contract invoke \
	  --id $(CONTRACT_ID) \
	  --source invoisio-admin \
	  --network testnet \
	  -- initialize \
	  --admin $(ADMIN)

# Record a sample invoice payment
# Usage: make invoke-record-payment CONTRACT_ID=<id> \
#          INVOICE_ID=invoisio-abc123 PAYER=<G...> \
#          ASSET_CODE=XLM ASSET_ISSUER="" AMOUNT=10000000
invoke-record-payment:
	stellar contract invoke \
	  --id $(CONTRACT_ID) \
	  --source invoisio-admin \
	  --network testnet \
	  -- record_payment \
	  --invoice_id   "$(INVOICE_ID)" \
	  --payer        "$(PAYER)" \
	  --asset_code   "$(ASSET_CODE)" \
	  --asset_issuer "$(ASSET_ISSUER)" \
	  --amount       $(AMOUNT)

# Read back a recorded payment
# Usage: make invoke-get-payment CONTRACT_ID=<id> INVOICE_ID=invoisio-abc123
invoke-get-payment:
	stellar contract invoke \
	  --id $(CONTRACT_ID) \
	  --source invoisio-admin \
	  --network testnet \
	  -- get_payment \
	  --invoice_id "$(INVOICE_ID)"

# Check whether an invoice has been recorded (returns true/false)
# Usage: make invoke-has-payment CONTRACT_ID=<id> INVOICE_ID=invoisio-abc123
invoke-has-payment:
	stellar contract invoke \
	  --id $(CONTRACT_ID) \
	  --source invoisio-admin \
	  --network testnet \
	  -- has_payment \
	  --invoice_id "$(INVOICE_ID)"

# Return current payment count
invoke-payment-count:
	stellar contract invoke \
	  --id $(CONTRACT_ID) \
	  --source invoisio-admin \
	  --network testnet \
	  -- payment_count

# Stream contract events from testnet (pipe to jq for readability)
events:
	stellar events \
	  --id $(CONTRACT_ID) \
	  --network testnet \
	  --type contract \
	  --start-ledger 1

.PHONY: default all build test fmt clean \
	generate-identity fund deploy \
	invoke-initialize invoke-record-payment invoke-get-payment \
	invoke-has-payment invoke-payment-count events
