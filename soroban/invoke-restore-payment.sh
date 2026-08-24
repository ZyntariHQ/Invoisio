#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# invoke-restore-payment.sh
# 
# This script restores an archived payment record using the `stellar contract restore`
# command. Archived records expire after their TTL (Time To Live) but remain available
# in the network history. This script recovers them back into the active ledger state.
# ==============================================================================

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 <invoice-id>"
    echo "Example: $0 INV-100234"
    exit 1
fi

INVOICE_ID="$1"

# Extract contract ID from .env
CONTRACT_ID=$(grep '^SOROBAN_CONTRACT_ID=' ../backend/.env | cut -d '=' -f 2- | tr -d '"'\'' ')
if [[ -z "$CONTRACT_ID" ]]; then
    echo "Error: SOROBAN_CONTRACT_ID not found in ../backend/.env"
    exit 1
fi

echo "Restoring payment record for invoice: ${INVOICE_ID}"
echo "Contract ID: ${CONTRACT_ID}"
echo ""

# The restore command builds a transaction containing a RestoreFootprintOp.
# The footprint must specify the exact contract data keys to restore.
# We build the footprint using the invoice_id directly, since the `get_payment` 
# method looks up the `PaymentKeyV1(invoice_id)` (or Legacy) entry.
# We use the `--key` argument which accepts SCVal JSON. 

# Construct the SCVal JSON for the payment key
# The V1 key is a tuple: ["PaymentV1", invoice_id]
SCVAL_KEY=$(cat <<EOF
{"vec":[{"sym":"PaymentV1"},{"str":"${INVOICE_ID}"}]}
EOF
)

# Run the restore command using the stellar CLI
# This will require the network and source account to be configured in your stellar CLI
stellar contract restore \
  --id "${CONTRACT_ID}" \
  --network testnet \
  --source admin \
  --key "${SCVAL_KEY}"

echo ""
echo "Restore transaction submitted."
echo "If successful, the payment record is now active again and its TTL has been bumped."
echo "You can verify by running: ./invoke-get-payment.sh ${INVOICE_ID}"
