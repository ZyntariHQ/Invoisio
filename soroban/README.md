# Invoisio — Soroban Smart Contracts

Soroban (Stellar) smart contracts for the Invoisio invoice payment platform.
Initialized with `stellar contract init` following the [official Soroban template](https://developers.stellar.org/docs/build/smart-contracts/getting-started).

## Project Structure

This workspace uses the recommended structure for a Soroban project:

```text
smart-contracts/
├── Cargo.toml                    # Workspace manifest (soroban-sdk = "25")
├── rust-toolchain.toml           # Pins stable channel + wasm32v1-none target
├── README.md
└── contracts/
  └── invoice-payment/          # ← Main Invoisio contract
    ├── src/lib.rs            # Contract logic + inline docs
    ├── src/test.rs           # Unit tests
    ├── src/storage.rs        # Persistent storage (state helpers)
    ├── src/events.rs         # Event definitions / emitters
    ├── src/errors.rs         # Contract error types
    ├── Cargo.toml
    └── Makefile              # build / test / deploy / invoke targets
```

- New contracts go in `contracts/<name>/` — the `members = ["contracts/*"]` glob picks them up automatically.
- All contracts share `soroban-sdk` via `[workspace.dependencies]` in the root `Cargo.toml`.
- Frontend libraries can be added to the top-level directory if needed.

---

## Prerequisites

| Tool | Install |
|------|---------|
| **Rust** (stable) | `curl https://sh.rustup.rs -sSf \| sh` |
| **wasm32v1-none** target | `rustup target add wasm32v1-none` |
| **Stellar CLI** ≥ 22 | `cargo install --locked stellar-cli --features opt` |
| **Testnet XLM** | [Friendbot](https://friendbot.stellar.org/?addr=YOUR_G_KEY) |

> **Windows users:** run Makefile targets inside **WSL 2** or **Git Bash** where
> `make` is available, or copy the individual `stellar` CLI commands from the
> Makefile and run them directly in PowerShell.

---

## `invoice-payment` Contract

### What it does

Tracks invoice payments on Soroban so any off-chain indexer can reconcile
on-chain activity with native Stellar `Payment` operations observed via Horizon.

Every call to `record_payment` both **persists** the record and **emits a Soroban
event**, giving the Invoisio backend two independent reconciliation paths:

1. **Horizon polling** — watch for native `Payment` ops with memo `invoisio-<id>`.
2. **Soroban event streaming** — subscribe to `payment_recorded` events via `getEvents`.

### Key design decisions

| Decision | Rationale |
|----------|-----------|
| **Admin-gated writes** | Only the backend service account (`admin`) may call `record_payment`. |
| **One record per `invoice_id`** | Idempotent; prevents double-counting in reconciliation. |
| **Persistent storage** | Records survive ledger archival windows. |
| **Soroban events** | Full `PaymentRecord` in each event; subscribers don't need to poll state. |

### Upgrade and versioning strategy

The contract uses a practical hybrid strategy:

1. **Semver for contract code** (`CONTRACT_VERSION`).
2. **Explicit on-chain schema metadata** (`ContractMeta { contract_version, storage_schema_version }`).
3. **Versioned storage keys** for records (`PaymentV1(invoice_id)`), while retaining **legacy read support** (`Payment(invoice_id)`).

#### Why this pattern

- **Major breaking changes** (new required fields, behavioral changes): deploy a **new contract address**.
- **Backward-compatible updates** (bug fixes, additive methods): code can be upgraded in place, and metadata tracks state/schema.
- **Legacy safety**: reads still accept old keys and lazily migrate them to the current key namespace.

#### Event compatibility policy

- Keep the existing `PaymentRecorded` event and topic (`payment_recorded`) stable for v1 consumers.
- For future breaking event payload changes, emit a new event name (for example, `payment_recorded_v2`) instead of mutating the old one.
- During migrations, optionally emit both events for one release window so indexers can cut over safely.

#### Upgrade decision matrix

| Change type | Address strategy | State strategy |
|-------------|------------------|----------------|
| Patch/minor, no schema break | Same contract address (WASM update) | Keep schema version, or increment only if data layout changes |
| Additive schema change with fallback | Same address possible | Increment schema, keep legacy read path |
| Breaking schema/API change | New contract address | Migrate data off-chain and repopulate new contract |

#### Hypothetical migration flow (v1 -> v2)

```
Contract v1 (C1) live
  -> freeze new writes in backend
  -> export invoice/payment records from C1 (state + events)
  -> deploy v2 contract (C2) and initialize admin
  -> replay/import records into C2 (idempotent write path)
  -> backend dual-read (C1 + C2), write only to C2
  -> switch indexers/clients to C2 as primary
  -> retire C1 after verification window
```

#### Client integration guidance

- Clients should call `contract_version()` and `version_info()` to detect runtime compatibility.
- Prefer bindings generated from the exact contract artifact version in use.
- Keep a per-network contract registry in backend config, for example:
  - `invoice_payment_v1_contract_id`
  - `invoice_payment_v2_contract_id`

### Contract API

| Method | Auth | Description |
|--------|------|-------------|
| `initialize(admin)` | — | One-time setup; registers the admin address. |
| `record_payment(invoice_id, payer, asset_code, asset_issuer, amount)` | admin | Persist record + emit event. |
| `get_payment(invoice_id) → PaymentRecord` | — | Return stored record (panics if absent). |
| `has_payment(invoice_id) → bool` | — | Non-panicking existence check. |
| `payment_count() → u32` | — | Total payments recorded. |
| `contract_version() → u32` | — | Current WASM code version (packed semver). |
| `version_info() → ContractMeta` | — | On-chain state metadata (`contract_version`, `storage_schema_version`). |
| `admin() → Address` | — | Current admin. |
| `set_admin(new_admin)` | admin | Transfer admin rights. |

### `PaymentRecord` struct

```rust
pub struct PaymentRecord {
    pub invoice_id:   String,   // e.g. "invoisio-abc123"
    pub payer:        Address,  // Stellar account that paid
    pub asset:        Asset,    // Native XLM or Token(code, issuer)
    pub amount:       i128,     // stroops for XLM; token-specific decimals
    pub timestamp:    u64,      // ledger Unix timestamp at recording time
}

pub enum Asset {
    Native,                     // XLM
    Token(String, String),      // (asset_code, issuer_address)
}
```

**Multi-Asset Support**: The contract supports both native XLM and any Stellar-issued token (USDC, EURT, etc.) through the `Asset` enum. See [MULTI_ASSET_SUPPORT.md](contracts/invoice-payment/MULTI_ASSET_SUPPORT.md) for detailed documentation.

### Emitted event

Every `record_payment` call publishes:

```
Topics : (Symbol "payment_recorded")
Data   : PaymentRecorded { 
           record: PaymentRecord { invoice_id, payer, asset_code, asset_issuer, amount, timestamp }
         }
```

Subscribe via:
```sh
stellar events \
  --id <CONTRACT_ID> \
  --network testnet \
  --type contract \
  --start-ledger 1
```

---

## Quick Start (testnet)

All commands run from `smart-contracts/contracts/invoice-payment/`.

### 1 - 

```bash
rustup target add wasm32v1-none
```

### 1 — Build

```sh
# From workspace root (smart-contracts/)
stellar contract build
# WASM: target/wasm32v1-none/release/invoice_payment.wasm

make build   # same + prints file size
```

### 2 — Run tests (no network needed)

```sh
make test
# Runs unit tests using soroban-sdk testutils
```

### 3 — Deploy to testnet

```sh
make generate-identity   # creates "invoisio-admin" key locally
make fund                # tops it up via Friendbot
make deploy              # deploys WASM, stores CONTRACT_ID in .contract-id
```

### 4 — Initialise

```sh
ADMIN=$(stellar keys address invoisio-admin)
make invoke-initialize CONTRACT_ID=$(cat .contract-id) ADMIN=$ADMIN
```

### 5 — Record a payment (XLM)

```sh
make invoke-record-payment \
  CONTRACT_ID=$(cat .contract-id) \
  INVOICE_ID=invoisio-abc123 \
  PAYER=GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX \
  ASSET_CODE=XLM \
  ASSET_ISSUER="" \
  AMOUNT=10000000
# Returns: null  (void)
```

**Record a token payment (USDC)**:

```sh
make invoke-record-payment \
  CONTRACT_ID=$(cat .contract-id) \
  INVOICE_ID=invoisio-usdc-001 \
  PAYER=GBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX \
  ASSET_CODE=USDC \
  ASSET_ISSUER=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5 \
  AMOUNT=50000000
# Returns: null  (void)
```

See [examples/multi_asset_demo.sh](contracts/invoice-payment/examples/multi_asset_demo.sh) for a complete demo.

### 6 — Verify

```sh
make invoke-get-payment \
  CONTRACT_ID=$(cat .contract-id) \
  INVOICE_ID=invoisio-abc123
# Returns the full PaymentRecord as JSON
```

### 7 — Stream events

```sh
make events CONTRACT_ID=$(cat .contract-id)
```

---

## Network configuration

Aligned with the backend `.env` described in the root `README.md`:

| Variable | Testnet value |
|----------|---------------|
| `STELLAR_NETWORK_PASSPHRASE` | `"Test SDF Network ; September 2015"` |
| Horizon URL | `https://horizon-testnet.stellar.org` |
| Soroban RPC | `https://soroban-testnet.stellar.org` |
| Friendbot | `https://friendbot.stellar.org` |

For mainnet use `"Public Global Stellar Network ; September 2015"` and the mainnet RPC.

---

## Backend integration notes

The Invoisio backend (`backend/`) can consume this contract in two ways:

1. **Write path** — after confirming a native `Payment` on Horizon (matched by memo `invoisio-<invoiceId>`), call `record_payment` to anchor the data on-chain.
2. **Event path** — subscribe to `getEvents` on the Soroban RPC, filtering on `CONTRACT_ID` and topic `payment_recorded` for push-based reconciliation without polling Horizon.

Both paths are independent; the backend can start with just the Horizon watcher and add the Soroban write path later without breaking existing invoices.
