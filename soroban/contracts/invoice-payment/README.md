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

**Rule**: Every instance storage read MUST call `extend_ttl(MIN_TTL, BUMP_TTL)` after the read. Every instance storage write MUST call `extend_ttl(MIN_TTL, BUMP_TTL)` after the write.

#### Persistent Storage (Payment Records)

Persistent storage contains payment records and history indexes:

| Key | Purpose | TTL Behavior |
|-----|---------|--------------|
| `PaymentV1(invoice_id)` | Payment record | Extended on read and write |
| `PaymentHistory(index)` | History index entry | Extended on read and write |
| `PayerPaymentCount(payer)` | Per-payer payment total (schema V2) | Extended on read and write |
| `PayerPaymentIdx(payer, ordinal)` | Per-payer history slot mapping (schema V2) | Extended on read and write |
| `AllowList(code, issuer)` | Asset allowlist entry | Extended on write only (existence check doesn't extend) |

**Rule**: Read operations should extend TTL when a record exists. Write operations should always extend TTL.

### Read Operations That Extend TTL

The following permissionless view functions automatically extend instance storage TTL:

- `config()` - Full contract configuration snapshot
- `admin()` - Current admin address
- `pending_admin()` - Proposed next admin address
- `is_paused()` - Pause state
- `payment_count()` - Total payments recorded
- `version_info()` - Version metadata
- `payment_history()` - History pagination (extends persistent storage)
- `payments_by_payer()` - Per-payer history pagination (extends persistent storage)
- `get_payment()` - Individual payment record (extends persistent storage)
- `has_payment()` - Payment existence check (extends persistent storage)

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
- `payment_count()` and `is_paused()` calls to refresh critical state

## Emergency Recovery

If instance storage expires (becomes archived), the contract may still be recoverable:

1. The contract instance itself remains (it doesn't expire)
2. A new admin can be set via contract initialization if the contract is not initialized
3. For initialized contracts with expired storage, a migration may be required

**Note**: Instance storage expiry is rare given the 30-day `BUMP_TTL` and frequent reads from operational tooling.

