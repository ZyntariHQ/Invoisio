# Soroban Payment Anchoring

This module anchors confirmed Horizon payments to the Soroban `invoice-payment` contract for on-chain verification and event streaming.

## Flow

1. **Horizon Watcher** detects payment with matching memo
2. Invoice marked as `paid` with Horizon `tx_hash`
3. **Soroban Service** invokes `record_payment` on contract
4. Contract stores record + emits event
5. Invoice updated with `soroban_tx_hash` and `soroban_contract_id`

## Configuration

Add to `backend/.env`:

```env
SOROBAN_CONTRACT_ID=CA5KFRYL64YTI5Y4OWCLVJRM6UJB3D37WXGV7VVFPGYERBREF6BWOWD2
STELLAR_NETWORK=testnet
SOROBAN_IDENTITY=invoisio-admin
SOROBAN_MAX_RETRIES=3
SOROBAN_RETRY_DELAY_MS=1000
```

Get `SOROBAN_CONTRACT_ID` from `soroban/contracts/invoice-payment/.contract-id` after running `./deploy.sh`.

## Database Schema

```sql
ALTER TABLE invoices ADD COLUMN tx_hash TEXT;
ALTER TABLE invoices ADD COLUMN soroban_tx_hash TEXT;
ALTER TABLE invoices ADD COLUMN soroban_contract_id TEXT;
ALTER TABLE invoices ADD COLUMN metadata JSONB;
```

Run migration:
```bash
npx prisma migrate deploy
```

## Error Handling

- **Retry with exponential backoff**: 3 attempts with 1s, 2s, 4s delays
- **Non-blocking**: Soroban failures logged but don't break payment processing
- **Graceful degradation**: If `SOROBAN_CONTRACT_ID` unset, anchoring is skipped

## Testing

```bash
# Unit tests
npm test -- soroban.service.spec.ts

# Integration tests
npm test -- soroban.integration.spec.ts
```

## Contract Invocation

The service calls:
```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --network testnet \
  --source invoisio-admin \
  -- record_payment \
  --invoice_id <memo> \
  --payer <payer_address> \
  --asset_code XLM \
  --asset_issuer "" \
  --amount 10000000
```

## Monitoring

Check logs for:
- `Soroban anchor complete for invoice <id> | tx: <hash>`
- `Soroban invocation failed after 3 attempts: <error>`

Query contract:
```bash
cd soroban
./invoke-get-payment.sh <invoice_memo>
```
