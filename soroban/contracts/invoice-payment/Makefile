.PHONY: default
default: build test

all: fmt build test

build:
	cargo build --target wasm32v1-none --release

test: build
	cargo test

fmt:
	cargo fmt --all

fmt-check:
	cargo fmt --all -- --check

clean:
	cargo clean

# Prerequisites:
#   export ADMIN_SECRET=S...   (testnet secret key for the admin / backend account)
#   The account must have testnet XLM; fund via: https://friendbot.stellar.org
#
# Run targets in order: generate-identity → fund → deploy → invoke-initialize
# → invoke-record-payment → invoke-get-payment

# Generate a fresh local identity (one-time setup)
generate-identity:
	stellar keys generate --name invoisio-admin --fund

# Fund the local identity (after generating fresh)
fund:
	@echo "Funding via friendbot: https://friendbot.stellar.org?addr=$$(stellar keys address invoisio-admin)"
	curl "https://friendbot.stellar.org?addr=$$(stellar keys address invoisio-admin)"

# Deploy contract
deploy: build
	stellar contract deploy \
	  --wasm target/wasm32v1-none/release/invoice_payment.wasm \
	  --source-account invoisio-admin \
	  --network testnet

# Initialize
# Usage: make invoke-initialize CONTRACT_ID=<id> ADMIN_ACCOUNT=<G...>
invoke-initialize:
	stellar contract invoke \
	  --id $(CONTRACT_ID) \
	  --source-account invoisio-admin \
	  --network testnet \
	  -- initialize \
	  --admin "$(ADMIN_ACCOUNT)"

# Record Payment
# Usage: make invoke-record-payment CONTRACT_ID=<id> \
#          INVOICE_ID=invoisio-abc123 PAYER=<G...> \
#          ASSET_CODE=XLM ASSET_ISSUER="" AMOUNT=10000000 SETTLEMENT_REF=settle-abc123
# Native XLM: omit ASSET_ISSUER (or set it empty) → --asset Native
# Token: ASSET_CODE=USDC ASSET_ISSUER=<G...> → --asset '{"Token":["USDC","G..."]}'
invoke-record-payment:
	stellar contract invoke \
	  --id $(CONTRACT_ID) \
	  --source-account invoisio-admin \
	  --network testnet \
	  -- record_payment \
	  --invoice_id "$(INVOICE_ID)" \
	  --payer "$(PAYER)" \
	  --asset "$(ASSET)" \
	  --amount $(AMOUNT) \
	  --settlement_ref "$(SETTLEMENT_REF)"

# Get Payment
# Usage: make invoke-get-payment CONTRACT_ID=<id> INVOICE_ID=invoisio-abc123
invoke-get-payment:
	stellar contract invoke \
	  --id $(CONTRACT_ID) \
	  --source-account invoisio-admin \
	  --network testnet \
	  -- get_payment \
	  --invoice_id "$(INVOICE_ID)"

# Has Payment
# Usage: make invoke-has-payment CONTRACT_ID=<id> INVOICE_ID=invoisio-abc123
invoke-has-payment:
	stellar contract invoke \
	  --id $(CONTRACT_ID) \
	  --source-account invoisio-admin \
	  --network testnet \
	  -- has_payment \
	  --invoice_id "$(INVOICE_ID)"

# Read a bounded page of payment history.
# Admin-gated (issue #512): bulk enumeration of every payment is exactly the
# disclosure this contract's privacy guarantee exists to prevent for anyone
# but the admin - invoisio-admin must be the current contract admin identity.
# Usage: make invoke-payment-history CONTRACT_ID=<id> CURSOR=0 LIMIT=25
invoke-payment-history:
	stellar contract invoke \
	  --id $(CONTRACT_ID) \
	  --source-account invoisio-admin \
	  --network testnet \
	  -- payment_history \
	  --cursor $(CURSOR) \
	  --limit $(LIMIT)

# Rotate admin
# Usage: make invoke-rotate-admin CONTRACT_ID=<id> NEW_ADMIN=<G...>
invoke-rotate-admin:
	stellar contract invoke \
	  --id $(CONTRACT_ID) \
	  --source-account invoisio-admin \
	  --network testnet \
	  -- rotate_admin \
	  --new_admin "$(NEW_ADMIN)"

# Accept admin role
# Usage: make invoke-accept-admin CONTRACT_ID=<id> NEW_ADMIN=<G...>
invoke-accept-admin:
	stellar contract invoke \
	  --id $(CONTRACT_ID) \
	  --source-account invoisio-admin \
	  --network testnet \
	  -- accept_admin \
	  --caller "$(NEW_ADMIN)"

# Return current payment count. Admin-gated (issue #512) - see
# invoke-payment-history above.
invoke-payment-count:
	stellar contract invoke \
	  --id $(CONTRACT_ID) \
	  --source-account invoisio-admin \
	  --network testnet \
	  -- payment_count

# Run Stellar CLI's contract spec command (useful for debugging ABI)
events:
	stellar contract event --id $(CONTRACT_ID) --network testnet

schema:
	bash generate-schema.sh

.PHONY: default all build test fmt fmt-check clean schema \
	generate-identity fund deploy \
	invoke-initialize invoke-record-payment invoke-get-payment \
	invoke-has-payment invoke-payment-count invoke-payment-history \
	invoke-rotate-admin invoke-accept-admin events
