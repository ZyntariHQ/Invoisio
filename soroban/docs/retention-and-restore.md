# Soroban Storage Retention, Archival & Restore Policy

## Overview

The Invoisio Invoice Payment Tracking contract implements a robust tiered storage and retention model designed for high auditability, predictable ledger rent economics, and resilience against ledger entry archival.

---

## 1. Storage Retention Tiers

The contract separates data across three distinct retention tiers:

| Tier | Storage Type | Lifespan | Stored Data | Retention Guarantee |
|---|---|---|---|---|
| **Tier 1: Hot Tier** | Instance Storage | Permanent (Lifetime of Contract) | `Admin`, `PendingAdmin`, `ContractMeta`, `Paused`, `AllowNative`, `PaymentCount`, `PaymentHistoryCount`, `SettlementRefCount`, `AllowListCount` | Automatically extended on **every** contract read and write. Never expires as long as contract is accessed. |
| **Tier 2: Active Tier** | Persistent Storage | Quarterly Retention Window (90 days) | `PaymentV1(invoice_id)`, `PaymentHistory(index)`, `PaymentLog(index)`, `SettlementRef(hash)`, `SettlementRefLog(index)`, `AllowListV6(asset)` | Extended to `BUMP_TTL` (~90 days / 1,555,200 ledgers) on access or via automated batch sweeps (`extend_history_ttl`). |
| **Tier 3: Cold Tier** | Network Archival | Indefinite (Restorable / Reconstructible) | Expired persistent payment records & history entries | Retained in cold state by validators. Restorable on demand via `RestoreFootprint` or reconstructible via on-chain `payment_recorded` events. |

---

## 2. TTL Constants & Rent Economics

At ~5-second ledger close times:
- `MIN_TTL = 120,960 ledgers` (~7 days): Remaining TTL threshold that triggers an extension.
- `BUMP_TTL = 1,555,200 ledgers` (~90 days): Target TTL applied upon write, read, or bulk extension.
- `MAX_TTL_EXTEND_BATCH = 20`: Maximum records processed in a single `extend_history_ttl` transaction.

### Rent Cost Model
- On Stellar mainnet, extending an active payment entry for 90 days costs ~0.0001 XLM in rent.
- Extending a batch of 20 payment records costs less than 0.005 XLM.
- Quarterly batch sweeps keep the entire active payment history retrievable on-chain at minimal cost.

---

## 3. Bulk TTL Extension Automation

To maintain active retention for records that are not frequently read:

### CLI Usage
```bash
# Extend TTL for first 20 records
./invoke-extend-history-ttl.sh 0 20

# Extend next batch from cursor 20
./invoke-extend-history-ttl.sh 20 20
```

### TypeScript Client
```typescript
import { SorobanInvoiceClient } from '@invoisio/soroban-client';

const client = new SorobanInvoiceClient({ /* config */ });

// Extend batch starting at cursor 0
const result = await client.extendHistoryTtl(0, 20);
console.log(`Extended batch: ${result.hash}`);
```

---

## 4. Archival Detection vs. Corruption Gaps

The contract strictly distinguishes between normal TTL archival and genuine index corruption:

### Read Paths (`get_payment`)
- If an invoice is not present in persistent storage, the contract checks the on-chain write log (`PaymentLog`).
- If present in the log $\rightarrow$ returns `ContractError::PaymentArchived` (error code 24).
- If not present in the log $\rightarrow$ returns `ContractError::PaymentNotFound` (error code 4).
- **Backend Safety:** Invoisio services recognize `PaymentArchived` as confirmation that an invoice was already anchored, preventing double-anchoring.

### Pagination (`payment_history`)
- `PaymentHistoryPage` provides two independent counters:
  - `archived_skipped`: Number of slots with a valid payment in `PaymentLog` whose `PaymentHistory` entry has expired.
  - `gaps_skipped`: Number of slots missing from both history and log (genuine corruption).
- If `archived_skipped > 0`, operators should run `extend_history_ttl` or restore footprints, NOT `rebuild_history_index`.
- If `gaps_skipped > 0`, operators should run `rebuild_history_index`.

---

## 5. Restoration Procedure

When a payment record has been archived:

### Step 1: Detect Archival
Calling `get_payment(invoice_id)` returns error code 24 (`PaymentArchived`).

### Step 2: Restore Footprint
Submit a transaction containing a `RestoreFootprint` operation for the contract and key footprint:

```bash
./invoke-restore-record.sh invoisio-inv-12345
```

Or via the Stellar CLI directly:
```bash
stellar contract invoke \
  --id <CONTRACT_ID> \
  --source-account <IDENTITY> \
  --network testnet \
  -- \
  get_payment \
  --invoice_id "invoisio-inv-12345"
```
The RPC simulation detects the archived state, populates the restore footprint, and restores the record online.

### Step 3: Verify Restoration
Subsequent calls to `get_payment(invoice_id)` will return the full `PaymentRecord` with its TTL extended to `BUMP_TTL`.
