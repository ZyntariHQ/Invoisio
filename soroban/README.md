# Invoisio — Soroban Smart Contracts

Soroban (Stellar) smart contracts for the Invoisio invoice payment platform.
Initialized with `stellar contract init` following the [official Soroban template](https://developers.stellar.org/docs/build/smart-contracts/getting-started).

## Project Structure

This workspace uses the recommended structure for a Soroban project:

```text
soroban/
├── Cargo.toml                      # Workspace manifest (soroban-sdk = "25")
├── README.md                       # This file
├── build.sh                        # Build contract WASM
├── deploy.sh                       # Deploy to testnet + initialize
├── invoke-record-payment.sh        # Record invoice payment
├── invoke-get-payment.sh           # Query payment record
├── invoke-config.sh                # Query high-level contract config
├── invoke-has-payment.sh           # Check payment existence
├── invoke-payment-history.sh       # Page through payment history
├── invoke-payments-by-payer.sh     # Page through payment history for one payer
└── contracts/
    └── invoice-payment/            # ← Main Invoisio contract
        ├── src/lib.rs              # Contract logic + inline docs
        ├── src/test.rs             # Unit tests
        ├── src/storage.rs          # Persistent storage helpers
        ├── src/events.rs           # Event definitions / emitters
        ├── src/errors.rs           # Contract error types
        ├── Cargo.toml
        ├── Makefile                # build / test / deploy / invoke targets
        └── examples/               # Demo scripts
```

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| **Rust** | stable | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| **wasm32v1-none** target | — | `rustup target add wasm32v1-none` |
| **Stellar CLI** | ≥ 22 | `cargo install --locked stellar-cli --features opt` |
| **Testnet XLM** | — | Auto-funded by deploy script via [Friendbot](https://friendbot.stellar.org) |

### Platform-specific notes

- **macOS / Linux**: All scripts work natively with bash
- **Windows**: Use **WSL 2** (Windows Subsystem for Linux) to run the shell scripts
  - Install WSL: `wsl --install` in PowerShell (as Administrator)
  - The scripts will NOT work in PowerShell or CMD directly
- **Git Bash** (Windows): Should work but WSL 2 is recommended for best compatibility

---

## Quick Start (4 steps)

All commands run from the `soroban/` directory.

### Step 1: Build the contract

```bash
./build.sh
```

**Expected output:**
```
=========================================
Building Invoisio Invoice Payment Contract
=========================================

🔍 Checking prerequisites...

✅ stellar CLI: stellar 25.1.0 (a048a57...)
✅ Rust: rustc 1.93.1 (01f6ddf75 2026-02-11)
✅ wasm32v1-none target installed

🔨 Building contract...

   Compiling invoice-payment v0.1.0
    Finished `release` profile [optimized] target(s) in 1m 41s

✅ Build complete!

📦 WASM output:
-rwxrwxrwx 1 user user 9.9K invoice_payment.wasm

Next steps:
  ./deploy.sh              - Deploy to Stellar testnet
```

### Step 2: Deploy to testnet

```bash
./deploy.sh
```

**Expected output:**
```
=========================================
Deploying Invoisio Contract
=========================================

Network:  testnet
Identity: invoisio-admin

🔑 Step 1/4: Setting up identity 'invoisio-admin'...

✅ Identity created
   Address: GAIC6UD7QYAYHJ3Q5LLXWRBWGNLNKAZBFIN4CEH77CQASDOCTDRIHENL

💰 Step 2/4: Funding account from Friendbot...

✅ Account funded successfully

🚀 Step 3/4: Deploying contract to testnet...

✅ Contract deployed!
   Contract ID: CA5KFRYL64YTI5Y4OWCLVJRM6UJB3D37WXGV7VVFPGYERBREF6BWOWD2

💾 Contract ID saved to contracts/invoice-payment/.contract-id

⚙️  Step 4/4: Initializing contract...

✅ Contract initialized with admin: GAIC6UD7QYAYHJ3Q5LLXWRBWGNLNKAZBFIN4CEH77CQASDOCTDRIHENL

=========================================
🎉 Deployment Complete!
=========================================

Contract ID: CA5KFRYL64YTI5Y4OWCLVJRM6UJB3D37WXGV7VVFPGYERBREF6BWOWD2
Admin:       GAIC6UD7QYAYHJ3Q5LLXWRBWGNLNKAZBFIN4CEH77CQASDOCTDRIHENL
Network:     testnet
```

### Step 3: Record a payment

**XLM payment** (1 XLM = 10,000,000 stroops):

```bash
./invoke-record-payment.sh \
  invoisio-demo-001 \
  GAIC6UD7QYAYHJ3Q5LLXWRBWGNLNKAZBFIN4CEH77CQASDOCTDRIHENL \
  XLM "" 10000000
```

**Expected output:**
```
=========================================
Recording Payment
=========================================
Contract ID:    CA5KFRYL64YTI5Y4OWCLVJRM6UJB3D37WXGV7VVFPGYERBREF6BWOWD2
Invoice ID:     invoisio-demo-001
Payer:          GAIC6UD7QYAYHJ3Q5LLXWRBWGNLNKAZBFIN4CEH77CQASDOCTDRIHENL
Asset Code:     XLM
Asset Issuer:   <native XLM>
Amount:         10000000
Network:        testnet

🚀 Invoking record_payment...

null

✅ Payment recorded successfully!
```

**USDC payment** (5 USDC with 7 decimals = 50,000,000):

```bash
./invoke-record-payment.sh \
  invoisio-usdc-001 \
  GAIC6UD7QYAYHJ3Q5LLXWRBWGNLNKAZBFIN4CEH77CQASDOCTDRIHENL \
  USDC \
  GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5 \
  50000000
```

### Step 4: Query a payment

```bash
./invoke-get-payment.sh invoisio-demo-001
```

**Expected output:**
```
=========================================
Retrieving Payment Record
=========================================
Contract ID: CA5KFRYL64YTI5Y4OWCLVJRM6UJB3D37WXGV7VVFPGYERBREF6BWOWD2
Invoice ID:  invoisio-demo-001
Network:     testnet

{
  "amount": "10000000",
  "asset": "Native",
  "invoice_id": "invoisio-demo-001",
  "payer": "GAIC6UD7QYAYHJ3Q5LLXWRBWGNLNKAZBFIN4CEH77CQASDOCTDRIHENL",
  "timestamp": 1772475360
}
```

### Step 5: Inspect contract config

Use one permissionless call to read admin ownership, initialization status,
version metadata, and current allowlist policy:

```bash
./invoke-config.sh
```

**Expected output:**
```json
{
  "admin": "GAIC6UD7QYAYHJ3Q5LLXWRBWGNLNKAZBFIN4CEH77CQASDOCTDRIHENL",
  "initialized": true,
  "version": {
    "contract_version": 1000000,
    "storage_schema_version": 1
  },
  "allowlist_mode": {
    "native_allowed": false,
    "requires_token_allowlist": true
  }
}
```

---

## Script Reference

### `./build.sh`

Builds the contract WASM file for deployment.

- **Prerequisites check**: Validates Rust, Stellar CLI, and wasm32v1-none target
- **Auto-installs** wasm32v1-none if missing
- **Output**: `target/wasm32v1-none/release/invoice_payment.wasm` (~10KB)

### `./deploy.sh`

Deploys the contract to Stellar testnet and initializes it.

**Environment variables:**
- `STELLAR_NETWORK` — Network to use (default: `testnet`)
- `STELLAR_IDENTITY` — Identity name (default: `invoisio-admin`)

**What it does:**
1. Creates/verifies the identity exists
2. Funds the account from Friendbot (testnet only)
3. Deploys the WASM to the network
4. Initializes the contract with the admin address
5. Saves `CONTRACT_ID` to `contracts/invoice-payment/.contract-id`

### Deploy Manifests

Network configuration is stored in `manifests/` as TOML files. `deploy.sh`
reads the correct manifest automatically based on `STELLAR_NETWORK`.

| File | Purpose |
|------|---------|
| `manifests/testnet.toml` | Testnet (default) — Friendbot-funded, SDF RPC |
| `manifests/mainnet.toml` | Mainnet — pre-funded admin required |

Each manifest covers:

- **`[network]`** — passphrase, RPC URL, Horizon URL
- **`[identity]`** — local keys identity name and the env var that holds the secret key
- **`[contract]`** — WASM path and where to write the deployed contract ID
- **`[assets]`** — allowlist of accepted payment assets (`CODE:ISSUER` or `"native"`)

Secrets are never stored in the manifest — they are referenced by env var name only.

**Testnet (default):**
```bash
./build.sh
./deploy.sh
# or explicitly:
STELLAR_NETWORK=testnet ./deploy.sh
```

**Mainnet:**
```bash
./build.sh
STELLAR_NETWORK=mainnet INVOISIO_ADMIN_SECRET=S... ./deploy.sh
```

**Adding a new environment** (e.g. futurenet): copy `manifests/testnet.toml`,
rename it `manifests/futurenet.toml`, update the `[network]` block, and run:
```bash
STELLAR_NETWORK=futurenet ./deploy.sh
```

### `./invoke-record-payment.sh`

Records an invoice payment on-chain.

**Usage:**
```bash
./invoke-record-payment.sh <invoice_id> <payer> <asset_code> <asset_issuer> <amount>
```

**Arguments:**
- `invoice_id` — Unique invoice identifier (e.g., `invoisio-abc123`)
- `payer` — Stellar account that made the payment (`G...`)
- `asset_code` — `XLM` for native, or `USDC`, `EURT`, etc.
- `asset_issuer` — Issuer address for tokens (use `""` for XLM)
- `amount` — Amount in smallest unit (stroops for XLM)

**Environment variables:**
- `STELLAR_NETWORK` — Network (default: `testnet`)
- `STELLAR_IDENTITY` — Signing identity (default: `invoisio-admin`)
- `CONTRACT_ID` — Override contract ID

**Examples:**
```bash
# XLM payment (1 XLM)
./invoke-record-payment.sh invoisio-001 GB7TAYRUZGE6T... XLM "" 10000000

# USDC payment (5 USDC)
./invoke-record-payment.sh invoisio-002 GB7TAYRUZGE6T... USDC GBBD47IF6LWK... 50000000
```

### `./invoke-get-payment.sh`

Retrieves a payment record from the contract.

**Usage:**
```bash
./invoke-get-payment.sh <invoice_id>
```

**Returns:** JSON payment record with invoice_id, payer, asset, amount, timestamp

### Contract `config()` view

Returns a stable JSON snapshot with:

- `admin` — current admin address, or `null` before initialization
- `initialized` — whether `initialize(admin)` has been called
- `version.contract_version` — packed semver for the state-writing contract build
- `version.storage_schema_version` — storage layout version
- `allowlist_mode.native_allowed` — whether native XLM is accepted
- `allowlist_mode.requires_token_allowlist` — whether issued assets must be explicitly allowlisted

### `./invoke-has-payment.sh`

Checks if a payment exists for an invoice (non-panicking).

**Usage:**
```bash
./invoke-has-payment.sh <invoice_id>
```

**Returns:** `true` if payment exists, `false` otherwise

### `./invoke-payment-history.sh`

Retrieves a bounded page of payment history.

**Usage:**
```bash
./invoke-payment-history.sh <cursor> [limit]
```

**Returns:** a page of payment records with `next_cursor` and `has_more`

### `./invoke-payments-by-payer.sh`

Retrieves a bounded page of payment history filtered to a single payer.

**Usage:**
```bash
./invoke-payments-by-payer.sh <payer> <cursor> [limit]
```

**Returns:** a page of payment records made by `payer`, with `next_cursor` and
`has_more`. A payer with no recorded payments returns an empty page rather
than an error.

---

## `invoice-payment` Contract

### What it does

Tracks invoice payments on Soroban so any off-chain indexer can reconcile
on-chain activity with native Stellar `Payment` operations observed via Horizon.

Every call to `record_payment` both **persists** the record and **emits a Soroban
event**, giving the Invoisio backend two independent reconciliation paths:

1. **Horizon polling** — watch for native `Payment` ops with memo `invoisio-<id>`.
2. **Soroban event streaming** — subscribe to `invoice_payment_recorded` events via `getEvents`.

### Key design decisions

| Decision | Rationale |
|----------|-----------|
| **Admin-gated writes** | Only the backend service account (`admin`) may call `record_payment` |
| **One record per `invoice_id`** | Idempotent; prevents double-counting in reconciliation |
| **Persistent storage** | Records survive ledger archival windows |
| **Soroban events** | Full `PaymentRecord` in each event; subscribers don't need to poll state |

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
| `get_payment(invoice_id) → PaymentRecord` | — | Return stored record. Errors: `InvalidInvoiceId` (empty id), `PaymentNotFound` (no record). |
| `has_payment(invoice_id) → bool` | — | Returns `true` if a payment exists; `false` if invoice_id is empty or no record. |
| `payment_count() → u32` | — | Total payments recorded. |
| `payment_history(cursor, limit) → PaymentHistoryPage` | — | Return a bounded, cursor-friendly page of payment history. `limit` is capped on-chain. |
| `contract_version() → u32` | — | Current WASM code version (packed semver). |
| `version_info() → ContractMeta` | — | On-chain state metadata (`contract_version`, `storage_schema_version`). |
| `admin() → Address` | — | Current admin. |
| `set_admin(new_admin)` | admin | Transfer admin rights. |

`payment_history(cursor, limit)` pages the append-only indexed history maintained by the contract, and the contract caps `limit` on-chain so the read remains bounded.

### Contract error codes

The contract uses `#[contracterror]`; these codes are returned as `ScError::Contract(code)` in Horizon and when invoking via `stellar contract invoke`. They are stable part of the on-chain ABI — do not reorder or remove.

| Code (u32) | Name | Description |
|------------|------|-------------|
| 1 | AlreadyInitialized | `initialize()` was called on a contract that is already set up. |
| 2 | NotInitialized | A method requiring admin was called before `initialize()`. |
| 3 | PaymentAlreadyRecorded | `record_payment()` was called with an `invoice_id` already recorded. |
| 4 | PaymentNotFound | `get_payment()` was called for an `invoice_id` that has no record. |
| 5 | InvalidAmount | `amount` was zero or negative; payments must be strictly positive. |
| 6 | InvalidInvoiceId | `invoice_id` was empty or otherwise invalid. |
| 7 | InvalidAsset | `asset_code` empty, or non-XLM asset without `asset_issuer`; or invalid allowlist args. |
| 8 | AssetNotAllowed | The asset (code, issuer) is not in the admin-controlled allowlist. |
| 9 | Unauthorized | The caller is not authorized to perform the operation. |

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

**Multi-Asset Support**: The contract supports both native XLM and any Stellar-issued token (USDC, EURT, etc.) through the `Asset` enum.

### Emitted events

Every `record_payment` call publishes a flattened event payload so off-chain indexers and backends can parse it reliably:

```
Topics : (Symbol "invoice_payment_recorded")
Data   : InvoicePaymentRecorded { schema_version, invoice_id, payer, asset_code, asset_issuer, amount, settlement_ref }
```

Note: The `tx_hash` is not directly inside the payload, but is automatically included by Horizon in the event envelope when fetching via RPC.

The leading `schema_version` field (currently `1`, see `EVENT_SCHEMA_VERSION` in `events.rs`) lets off-chain indexers detect the event payload shape and stay forward-compatible. Consumers should read `schema_version` first and branch on it; when the payload changes in a breaking way the version is bumped (and, per the event compatibility policy above, a new event name may also be introduced).

Subscribe and decode via CLI:
```sh
stellar events \
  --id <CONTRACT_ID> \
  --network testnet \
  --type contract \
  --start-ledger 1
```

The CLI automatically deserializes the XDR payload into human-readable JSON. A backend client can directly consume these events using generated TypeScript bindings (`stellar contract bindings typescript`).

---

## Troubleshooting

### `stellar: command not found`

**Cause:** Stellar CLI not installed

**Fix:**
```bash
cargo install --locked stellar-cli --features opt
```

Verify installation:
```bash
stellar --version
```

### `error: target 'wasm32v1-none' is not installed`

**Cause:** Missing WASM compilation target

**Fix:**
```bash
rustup target add wasm32v1-none
```

The `build.sh` script auto-installs this if missing.

### `ERROR: Contract WASM not found`

**Cause:** Contract not built before deploying

**Fix:**
```bash
./build.sh
./deploy.sh
```

### `error: Account not found` or funding fails

**Cause:** Network issues with Friendbot or account already exists

**Fix:**
- Check internet connection
- Friendbot may be rate-limited; wait 1 minute and retry
- For existing accounts, the script continues automatically

### `error: a value is required for '--asset_issuer'`

**Cause:** Old script version or incorrect usage

**Fix:** For XLM payments, pass empty string as `""`:
```bash
./invoke-record-payment.sh invoice-001 G... XLM "" 10000000
#                                            ↑↑
#                                         Empty string for XLM
```

### Windows: `bash: ./build.sh: Permission denied`

**Cause:** Scripts not executable (shouldn't happen on Windows)

**Fix:**
```bash
chmod +x *.sh
```

### Windows: Scripts don't work in PowerShell

**Cause:** Bash scripts require a Unix-like environment

**Fix:** Use **WSL 2**:
```powershell
# In PowerShell as Administrator
wsl --install

# Then access your project in WSL
wsl
cd /mnt/c/Users/YourName/path/to/Invoisio/soroban
./build.sh
```

---

## Advanced Usage

### Running unit tests

```bash
cargo test
```

Tests run locally without network access using `soroban-sdk` test utilities.

### Using the Makefile (alternative to scripts)

From `contracts/invoice-payment/`:

```bash
make build                       # Build contract
make test                        # Run tests
make deploy                      # Deploy (requires env setup)
make invoke-record-payment \
  CONTRACT_ID=<id> \
  INVOICE_ID=invoisio-001 \
  PAYER=G... \
  ASSET_CODE=XLM \
  ASSET_ISSUER="" \
  AMOUNT=10000000
```

### Custom network / identity

```bash
# Deploy to different network
STELLAR_NETWORK=futurenet ./deploy.sh

# Use custom identity
STELLAR_IDENTITY=my-admin ./deploy.sh

# Override contract ID for invocations
CONTRACT_ID=CXXXXXXXXX... ./invoke-get-payment.sh invoisio-001
```

### Multi-asset demo

See [contracts/invoice-payment/examples/multi_asset_demo.sh](contracts/invoice-payment/examples/multi_asset_demo.sh) for a complete demo of XLM and USDC payments.

---

## Network Configuration

Aligned with the backend `.env` described in the root `README.md`:

| Variable | Testnet value |
|----------|---------------|
| `STELLAR_NETWORK_PASSPHRASE` | `"Test SDF Network ; September 2015"` |
| Horizon URL | `https://horizon-testnet.stellar.org` |
| Soroban RPC | `https://soroban-testnet.stellar.org` |
| Friendbot | `https://friendbot.stellar.org` |

For mainnet use `"Public Global Stellar Network ; September 2015"` and the mainnet RPC.

---

## TypeScript Client Helper

A minimal TypeScript client library lives in `soroban/client/`. It is the
reference implementation for any service that needs to interact with the
deployed contract from Node.js.

### Prerequisites

| Requirement | Notes |
|-------------|-------|
| Node.js ≥ 18 | LTS recommended |
| `@stellar/stellar-sdk ^14.6.0` | Bundled as a dependency |
| Funded Stellar account | Source for simulation transactions |
| Admin secret key | Required only for write operations |

### Setup

```bash
# 1. Install and build the client library
cd soroban/client
npm install
npm run build

# 2. Copy and configure environment variables
cp .env.example .env
# Edit .env — fill in SOROBAN_RPC_URL, SOROBAN_CONTRACT_ID, etc.
```

### Configuration (`.env`)

| Variable | Description |
|----------|-------------|
| `SOROBAN_RPC_URL` | Soroban RPC endpoint (testnet: `https://soroban-testnet.stellar.org`) |
| `STELLAR_NETWORK_PASSPHRASE` | Network passphrase |
| `SOROBAN_CONTRACT_ID` | Deployed contract ID from `.contract-id` |
| `ADMIN_SECRET_KEY` | Admin secret key — write operations only; never commit |
| `SOURCE_PUBLIC_KEY` | Any funded public key — read-only operations |

### Usage

```typescript
import { SorobanInvoiceClient, SorobanContractError } from '@invoisio/soroban-client';

const client = new SorobanInvoiceClient({
  rpcUrl: process.env.SOROBAN_RPC_URL!,
  networkPassphrase: process.env.STELLAR_NETWORK_PASSPHRASE!,
  contractId: process.env.SOROBAN_CONTRACT_ID!,
  signerSecretKey: process.env.ADMIN_SECRET_KEY,   // write operations
  sourcePublicKey: process.env.SOURCE_PUBLIC_KEY,  // read-only fallback
});

// ── Write (admin-gated) ──────────────────────────────────────────────────────
// Call this after confirming the companion Stellar Payment on Horizon.
// 150 USDC: Stellar tokens use 7 decimal places → 150 × 10_000_000 = 1_500_000_000
const result = await client.recordPayment({
  invoiceId: 'invoisio-abc123',
  payer: 'GCEZ...NYJH',
  assetCode: 'USDC',
  assetIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  amount: 1_500_000_000n,
});
console.log(`Confirmed — hash: ${result.hash}, ledger: ${result.ledger}`);

// ── Read (permissionless) ────────────────────────────────────────────────────
const config = await client.getConfig();
console.log(config.initialized, config.admin, config.allowlistMode.nativeAllowed);

const exists = await client.hasPayment('invoisio-abc123');
if (exists) {
  const record = await client.getPayment('invoisio-abc123');
  console.log(record.invoiceId, record.amount, record.timestamp);
}

const total = await client.getPaymentCount();
console.log(`Total payments on-chain: ${total}`);
```

### Running the examples end-to-end

```bash
cd soroban/client

# Record a payment (requires ADMIN_SECRET_KEY + PAYER_PUBLIC_KEY in .env)
npm run example:record

# Query a payment (requires SOURCE_PUBLIC_KEY in .env)
npm run example:query

# Query high-level contract config (requires SOURCE_PUBLIC_KEY + CONTRACT_ID)
npm run example:config
```

**Sample output — record:**
```
Recording payment for invoice invoisio-demo-001 ...
✓  Transaction confirmed
   Hash   : e7a4b2c1d9f83a56b0e2c4d7f1a3b8e9c0d2f4a6b8c1d3e5f7a9b0c2d4e6f8a0
   Ledger : 588412
```

**Sample output — query:**
```
Checking invoice invoisio-demo-001 ...
Payment recorded: true

PaymentRecord {
  invoiceId : invoisio-demo-001
  payer     : GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGKRFAXMSYF6AEQYEOJ2NYJH
  asset     : USDC (GA5ZSEJ...K4KZVN)
  amount    : 1500000000  (150.0000000 USDC)
  timestamp : 1741910400  (2025-03-14T00:00:00.000Z)
}

Total payments on-chain: 1
```

### Error handling

All contract-level rejections are thrown as `SorobanContractError`:

```typescript
try {
  await client.recordPayment({ invoiceId: 'invoisio-abc123', ... });
} catch (err) {
  if (err instanceof SorobanContractError) {
    // err.code: 'PaymentAlreadyRecorded' | 'InvalidAmount' | 'NotInitialized' | ...
    console.error(`Rejected by contract [${err.code}]`);
  }
}
```

---

## Backend Integration Notes

The Invoisio backend (`backend/`) integrates via the `SorobanModule` at
`backend/src/soroban/`. It imports `@invoisio/soroban-client` as a local
package reference and exposes a NestJS-injectable `SorobanService`.

### Backend setup

```bash
# Build the client library first (one-time step)
cd soroban/client && npm install && npm run build

# Install backend dependencies (picks up the file: reference)
cd ../../backend && npm install
```

Add to `backend/.env`:
```
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
SOROBAN_CONTRACT_ID=<from .contract-id>
ADMIN_SECRET_KEY=<admin secret>
```

### Backend usage (NestJS)

```typescript
// Injected automatically via SorobanModule → InvoicesModule
constructor(private readonly sorobanService: SorobanService) {}

// Idempotency-safe reconciliation after Horizon confirms a Payment
await invoicesService.reconcilePayment(
  invoiceId, payerAddress, 'USDC',
  'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  '1500000000',
);
```

The backend exposes two on-chain interaction paths:

1. **Write path** — after confirming a native `Payment` on Horizon (matched by memo `invoisio-<invoiceId>`), call `recordInvoicePayment` to anchor the data on-chain.
2. **Event path** — subscribe to `getEvents` on the Soroban RPC, filtering on `CONTRACT_ID` and topic `payment_recorded` for push-based reconciliation without polling Horizon.

Both paths are independent; the backend can start with just the Horizon watcher and add the Soroban write path later without breaking existing invoices.

---

## Contributing

When adding new functionality:

1. Add tests in `contracts/invoice-payment/src/test.rs`
2. Run `cargo test` to verify
3. Update this README if adding new public methods
4. Consider updating shell scripts if the contract API changes

---

## Resources

- [Stellar Documentation](https://developers.stellar.org/)
- [Soroban Smart Contracts](https://developers.stellar.org/docs/build/smart-contracts)
- [Stellar CLI Reference](https://developers.stellar.org/docs/tools/developer-tools/cli/stellar-cli)
- [Soroban SDK](https://docs.rs/soroban-sdk/latest/soroban_sdk/)
