# Invoice Payment Contract

## Storage TTL Policy

### Overview

Soroban contracts must manage storage TTL (time-to-live) to prevent state from being archived when it's not accessed frequently. This contract implements a consistent TTL extension strategy across all storage operations.

### TTL Constants

| Constant | Value | Duration (approx) |
|----------|-------|-------------------|
| `MIN_TTL` | 17,280 ledgers | ~1 day |
| `BUMP_TTL` | 518,400 ledgers | ~30 days |

### Extension Strategy

#### Instance Storage (Critical Configuration)

Instance storage contains critical contract state that must remain available:

| Key | Purpose | TTL Behavior |
|-----|---------|--------------|
| `Admin` | Current admin address | Extended on every read and write |
| `PendingAdmin` | Proposed next admin | Extended on every read and write |
| `AllowNative` | XLM acceptance flag | Extended on every read and write |
| `Paused` | Contract pause state | Extended on every read and write |
| `PaymentCount` | Total payment counter | Extended on every read and write |
| `PaymentHistoryCount` | History index counter | Extended on every read and write |
| `ContractMeta` | Version metadata | Extended on every read and write |
| `AllowListCount` | Live allowlist membership counter (schema V4, issue #464) | Extended on every read and write |
| `AllowListLogCount` | Allowlist enumeration log write-order length (schema V4, issue #464) | Extended on every read and write |

**Rule**: Every instance storage read MUST call `extend_ttl(MIN_TTL, BUMP_TTL)` after the read. Every instance storage write MUST call `extend_ttl(MIN_TTL, BUMP_TTL)` after the write.

#### Persistent Storage (Payment Records)

Persistent storage contains payment records and history indexes:

| Key | Purpose | TTL Behavior |
|-----|---------|--------------|
| `PaymentV1(invoice_id)` | Payment record | Extended on read and write |
| `PaymentHistory(index)` | History index entry | Extended on read and write |
| `AllowList(code, issuer)` | Asset allowlist entry | Extended on read (when present) and write |
| `AllowListLog(slot)` | Allowlist enumeration log entry (schema V4, issue #464) | Extended on read (when present) and write; removed (a hole) on `revoke_asset` |
| `AllowListIndex(code, issuer)` | Reverse lookup from a pair to its `AllowListLog` slot (schema V4, issue #464) | Extended on write; removed on `revoke_asset` |

**Rule**: Read operations should extend TTL when a record exists. Write operations should always extend TTL.

### Read Operations That Extend TTL

The following permissionless view functions automatically extend instance storage TTL:

- `config()` - Full contract configuration snapshot
- `admin()` - Current admin address
- `pending_admin()` - Proposed next admin address
- `is_paused()` - Pause state
- `version_info()` - Version metadata
- `get_payment()` - Individual payment record (extends persistent storage)
- `has_payment()` - Payment existence check (extends persistent storage)

The following are admin-gated bulk/volume reads (issue #512 — see "Disclosure guarantee / threat model" below) but still extend TTL the same way on a hit:

- `payment_count(admin)` - Total payments recorded
- `payment_history(admin, cursor, limit)` - History pagination (extends persistent storage)
- `settlement_ref_history(admin, cursor, limit)` - Settlement-reference index pagination (extends persistent storage)
- `settlement_ref_index_status(admin)` - Settlement-reference index consistency summary
- `history_index_status(admin)` - Payment history index consistency summary

### Writing New Storage Helpers

When adding new storage helpers, follow these patterns:

**Instance Storage Read**:
```rust
pub fn get_my_value(env: &Env) -> MyType {
    let value = env.storage().instance().get(&DataKey::MyKey).unwrap_or(default);
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
    value
}
```

**Instance Storage Write**:
```rust 
pub fn set_my_value(env: &Env, value: &MyType) {
    env.storage().instance().set(&DataKey::MyKey, value);
    env.storage().instance().extend_ttl(MIN_TTL, BUMP_TTL);
}
```

**Persistent Storage Read**:
```rust
pub fn get_my_record(env: &Env) -> Option<MyRecord> {
    let key = DataKey::MyKey;
    let record: Option<MyRecord> = env.storage().persistent().get(&key);
    if record.is_some() {
        env.storage().persistent().extend_ttl(&key, MIN_TTL, BUMP_TTL);
    }
    record
}
```

**Persistent Storage Write**:
```rust
pub fn set_my_record(env: &Env, record: &MyRecord) {
    let key = DataKey::MyKey;
    env.storage().persistent().set(&key, record);
    env.storage().persistent().extend_ttl(&key, MIN_TTL, BUMP_TTL);
}
```

## Testing TTL Behavior

TTL extension is tested indirectly through storage access patterns. When adding new storage helpers, ensure they follow the same TTL extension patterns as existing helpers.

## Monitoring

Operators can monitor instance storage TTL health via:

- Soroban RPC storage endpoints
- Regular `config()` calls to keep TTL extended
- `is_paused()` calls to refresh critical state, and admin-signed `payment_count(admin)` calls where ops tooling already has admin access

## Emergency Recovery

If instance storage expires (becomes archived), the contract may still be recoverable:

1. The contract instance itself remains (it doesn't expire)
2. A new admin can be set via contract initialization if the contract is not initialized
3. For initialized contracts with expired storage, a migration may be required

**Note**: Instance storage expiry is rare given the 30-day `BUMP_TTL` and frequent reads from operational tooling.

## Disclosure guarantee / threat model (issue #512)

This contract is Invoisio's on-chain payment-verification ledger, built to the following privacy guarantee: **a third party who does not already know a specific `invoice_id` or a specific `settlement_ref` cannot learn anything about the platform's payment activity.** A party who already knows one of those identifiers can fully verify what it points to. The contract admin (the Invoisio backend) retains full enumeration/audit ability for legitimate ops/reconciliation.

Concretely, for an unauthenticated third party:

**Can learn:**
- Whether a *specific* `invoice_id` they already know about has been paid, and its full record — `get_payment(invoice_id)`.
- Whether a *specific* `settlement_ref` they already possess (e.g. a Horizon transaction hash they already hold) maps to an invoice — `settlement_ref_owner(settlement_ref)`.
- The current allowlist/config/pause state — `config()`, `allowed_assets()`, `allowlist_count()`, `is_paused()` — none of this is payment data.

**Cannot learn:**
- The full set of invoices/payments ever recorded on the platform (no permissionless bulk enumeration — `payment_history` is admin-gated).
- A specific payer's payment history (`payments_by_payer` was removed entirely — it served no documented product need and was the sharpest disclosure the contract made).
- Aggregate payment volume or counts (`payment_count`, `history_index_status`, `settlement_ref_index_status` are admin-gated).
- The timing or ordering of payments they don't already know about.
- The plaintext settlement reference / Horizon transaction hash from on-chain data alone — `PaymentRecord.settlement_ref` and the emitted event both hold a SHA-256 **commitment** of what the backend supplied, not the plaintext (see `storage::commit_settlement_ref`). The public `invoice_payment_recorded` event itself now carries only `schema_version` and `invoice_id` — no payer, asset, amount, or settlement reference — so streaming `getEvents` can no longer be used to bulk-browse the payment ledger the way the read methods now also refuse to permit.

**What the contract admin (Invoisio backend) can still do:** everything above, plus full enumeration via `payment_count(admin)`, `payment_history(admin, cursor, limit)`, `settlement_ref_history(admin, cursor, limit)`, `settlement_ref_index_status(admin)`, and `history_index_status(admin)` — gated on `admin.require_auth()` and never blocked by pause, so ops/reconciliation tooling keeps working during an incident.

**Scope note:** `invoice_id` enumerability itself is a separate, already-tracked concern (issue #498) that this change does not fix on its own — an `invoice_id` that's guessable or otherwise discoverable off-chain still lets someone call `get_payment`/`settlement_ref_owner` for it. What this change removes is the *additional* correlation power an enumerable `invoice_id` would otherwise grant: bulk payer/volume views and a full-detail public event stream that made "guess an ID" unnecessary in the first place.

## Permanence for existing deployments

**Data already written to a deployment before this change is permanently public and cannot be retracted.** A code upgrade only changes contract *behavior* for future calls — it cannot un-publish an already-emitted Soroban event, and it does not rewrite or re-hash a payment record's stored value unless a migration explicitly does so.

Concretely, on a deployment that recorded payments before upgrading to this code:
- Every `invoice_payment_recorded` event emitted before the upgrade already carries the full pre-#512 payload (payer, asset, amount, plaintext settlement_ref) and is permanently retrievable from Horizon/RPC event history by anyone. Upgrading the contract does not, and cannot, remove or redact that history.
- Every `PaymentRecord.settlement_ref` written before the upgrade is stored as **plaintext**, not a commitment. The V2→V3 settlement-reference migration (`migration::migrate_schema_v2_to_v3`) and the V0→V1 equivalent (`migration::migrate_settlement_refs`) read each existing `PaymentRecord.settlement_ref` off-chain-log-order and hash it (via `storage::commit_settlement_ref`) when building the `settlement_ref_owner` index — but they do **not** rewrite the original `PaymentRecord.settlement_ref` field itself. That field remains exactly as originally written: plaintext for a pre-#512 record, a commitment only for a record written by the upgraded code. `get_payment` on an old record returns that original plaintext value as-is.
- Anything readable via `payments_by_payer` (now removed) or the bulk `payment_history`/`settlement_ref_history`/counters (now admin-gated) before an operator upgrades and locks them down was, and remains, exposed to whoever read it.

**What this means operationally:** treat any deployment that has processed real payments before this fix as having its full payment history, payer identities, and settlement references already exposed to anyone who was watching. This fix protects only payments recorded **going forward** on a deployment that has been upgraded per the runbook (`docs/upgrade-runbook.md`) — it is not retroactive and cannot be made retroactive.

