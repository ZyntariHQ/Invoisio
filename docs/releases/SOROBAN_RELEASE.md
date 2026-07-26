# Soroban Smart Contract Release Runbook (Rust + soroban-sdk 25)

Surface: `soroban/` — Rust workspace containing the `invoice-payment` Soroban smart contract and its TypeScript client library. Tracks invoice payments on-chain so the backend can dual-reconcile against Horizon native Payment ops + Soroban events.

---

## 1. Scope and Ownership

| Item | Value |
|------|-------|
| Stack | Rust stable, soroban-sdk = "25", ethnum = "1.6", wasm32v1-none target |
| Contract | `soroban/contracts/invoice-payment/` — single primary contract today |
| TypeScript client | `soroban/client/` — `@invoisio/soroban-client`, consumed as a `file:` dep by `backend/package.json` |
| CI workflow | `.github/workflows/soroban.yml` — `cargo test` + WASM build on PR / push-to-main. **Path filters are Rust-specific** (`soroban/**` BUT does not re-trigger on `soroban/client` TypeScript changes per engineering conventions in project memory.) |
| Networks | Testnet (default + CI), Mainnet (prod), Futurenet (optional, pre-release) |
| Owner / maintainer group | Smart contract maintainers + backend maintainers (because backend calls the contract via the client library) |

Code references:
- Workspace manifest: [soroban/Cargo.toml](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/soroban/Cargo.toml#L1-L24)
- Contract README (deep API reference, events, upgrade policy): [soroban/README.md](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/soroban/README.md)
- Client package: [soroban/client/package.json](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/soroban/client/package.json)
- Network manifests: [soroban/manifests/testnet.toml](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/soroban/manifests/testnet.toml), [soroban/manifests/mainnet.toml](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/soroban/manifests/mainnet.toml)

---

## 2. Environment Variables and Secrets

### Shell scripts (`soroban/*.sh`)

All scripts in `soroban/` read these env vars. Defaults are noted.

| Variable | Default | Used by | Purpose | Rotation / Safety |
|----------|---------|---------|---------|-------------------|
| `STELLAR_NETWORK` | `testnet` | `deploy.sh`, all `invoke-*.sh` | Switches which network manifest to load from `manifests/` | Set explicitly for mainnet releases. |
| `STELLAR_IDENTITY` | `invoisio-admin` | `deploy.sh`, all `invoke-*.sh` | Name of the Stellar CLI identity whose secret key signs transactions | Must match the identity stored in `~/.config/stellar/identities.toml` or env-based injection (see next row). |
| `INVOISIO_ADMIN_SECRET` | (unset — looked up from identity or manifest env-var ref) | `deploy.sh`, `invoke-record-payment.sh`, other admin-gated scripts | The Stellar secret key (`S...`) used as the contract admin. **Never echo, never commit.** | Rotate via `invoke-set-admin.sh` to a new account, THEN rotate the key itself. |
| `CONTRACT_ID` | (read from `contracts/invoice-payment/.contract-id` by default) | All `invoke-*.sh` | The deployed contract address (`C...`). Override with this env var to point at a different deployment (e.g. new v2 contract). | Update after every new contract address deploy. |

### Backend `.env` (contracts are consumed indirectly via the backend)

The backend uses these to talk to the already-deployed contract via the TypeScript client:

| Variable | Purpose |
|----------|---------|
| `SOROBAN_RPC_URL` | RPC endpoint (testnet / mainnet) |
| `SOROBAN_CONTRACT_ID` | Deployed `C...` contract address |
| `ADMIN_SECRET_KEY` | Contract admin signing key for `record_payment` write ops |
| `STELLAR_NETWORK_PASSPHRASE` | Used in transaction signing — mismatch = signatures fail |
| `SOURCE_PUBLIC_KEY` | Optional; any funded public key, used for read-only simulations |

---

## 3. Prerequisites (Local Machine)

| Tool | Version / Target | Install |
|------|------------------|---------|
| Rust | stable | `rustup default stable` |
| wasm32v1-none target | — | `rustup target add wasm32v1-none` (auto-installed by `build.sh`) |
| Stellar CLI | ≥ 22, with `opt` features | `cargo install --locked stellar-cli --features opt` |
| Node.js | ≥ 18 | For rebuilding the TypeScript client |
| **Windows users** | Use WSL 2. Scripts are bash-only; PowerShell/CMD will fail. | `wsl --install`; then mount your project at `/mnt/c/...` |

Sanity-check your environment:
```bash
cd soroban
rustc --version
stellar --version
rustup target list --installed | grep wasm32v1-none
```

---

## 4. Pre-flight Checklist (Before Every Contract Release)

1. **Engineering convention — ethnum version check**
   - Project memory lesson: `ethnum 1.5.2` has a transmute size-mismatch bug on new Rust toolchains that produces `E0512`. Current workspace pins `ethnum = "1.6"` in the manifest ([soroban/Cargo.toml](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/soroban/Cargo.toml#L9-L9)), which is safe. Still: ensure `Cargo.lock` resolves ethnum ≥ `1.5.3` before cutting a release.
2. **Run unit tests (off-chain, fast — no network)**
   ```bash
   cd soroban
   cargo test
   ```
   Snapshot tests live in `contracts/invoice-payment/test_snapshots/test/*.1.json`. If they fail because you intentionally changed behavior, **review the diff carefully**, then update with:
   ```bash
   cargo test -- --nocapture  # examine outputs; then if correct:
   cargo insta::assert_snapshot...  # or use `cargo insta review` if you have cargo-insta
   ```
   **Never accept a snapshot diff blindly.** Contract snapshot changes are potential on-chain state-breaking changes.
3. **Build WASM (release profile, optimized for size)**
   ```bash
   cd soroban
   ./build.sh
   # Or manually:
   cargo build --target wasm32-unknown-unknown --release
   ```
   Expected output: `target/wasm32v1-none/release/invoice_payment.wasm` (~10 KB). Verify it's not 0 bytes.
4. **If `invoice-payment` ABI or storage changed → rebuild TypeScript client AND commit the dist/**
   ```bash
   cd soroban/client
   npm ci
   npm run build
   # Also regenerate stellar bindings if applicable (docs in soroban/README.md)
   # stellar contract bindings typescript --output-dir ../client/src/ ...
   ```
   **This step is critical.** The backend installs `@invoisio/soroban-client` via a `file:` reference ([backend/package.json](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/backend/package.json#L39-L39)). If you edit Rust code that changes the contract ABI but forget to rebuild the client dist, the backend calls the contract with stale argument encoding and every `record_payment` fails.
5. **Client typecheck**
   ```bash
   cd soroban/client
   npm run typecheck
   ```
6. **Optional but HIGHLY recommended for any non-trivial change**: deploy to Futurenet (or Testnet using a throwaway identity) and run the 5 invoke scripts end-to-end: `record_payment`, `get_payment`, `has_payment`, `payment_count`, `config`. Capture outputs in the release PR description.

---

## 5. Release Workflow Step-by-Step (Testnet → Mainnet)

### Step 1: Deploy to Testnet (always first — never deploy mainnet cold)

```bash
cd soroban

# 1. Ensure identity is set up. If INVOISIO_ADMIN_SECRET is provided, deploy.sh uses it;
#    otherwise it creates a local `invoisio-admin` identity and Friendbot-funds it (testnet only).
export STELLAR_NETWORK=testnet
# Optionally: export INVOISIO_ADMIN_SECRET=S... (if you have a pre-funded testnet admin)

# 2. Build WASM if not already built
./build.sh

# 3. Deploy + initialize in one script
./deploy.sh
```

What `deploy.sh` does (see [soroban/README.md](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/soroban/README.md) § Quick Start Step 2):
1. Verifies prerequisites (Rust, stellar CLI, wasm target).
2. Sets up identity (or reuses existing).
3. Friendbot-funds (testnet only).
4. Deploys WASM → emits contract ID.
5. Writes contract ID to `contracts/invoice-payment/.contract-id`.
6. Calls `initialize(admin)` — one-time, cannot be called again (error code `AlreadyInitialized = 1`).

**Post-deploy testnet verification (do this now):**
```bash
# Should return initialized=true, admin=<your address>, version metadata, allowlist mode
./invoke-config.sh

# If allowlist requires tokens (default policy — requires_token_allowlist = true):
#   add USDC to the allowlist before testing USDC payments:
./invoke-allow-asset.sh USDC GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN

# Or if you want to accept native XLM (for testing convenience):
./invoke-set-allow-native.sh true

# Record a test payment
./invoke-record-payment.sh \
  release-test-001 \
  <any-funded-G-address-on-testnet> \
  XLM "" 10000000

# Verify it was recorded
./invoke-get-payment.sh release-test-001
./invoke-has-payment.sh release-test-001
./invoke-payment-history.sh 0 10
```

Save these output snippets into the release PR. Once testnet is clean → promote to mainnet.

### Step 2: Cut a release commit / tag

Update any references (the backend `.env.example`, if the new contract ID should propagate) and commit. Tag format:

```bash
git add -p
git commit -m "release(soroban): invoice-payment v1.2.0 — add allowlist toggle + paused state"
git tag soroban-v1.2.0
git push --follow-tags
```

### Step 3: Deploy to Mainnet

⚠️ MAINNET DEPLOY CHECKLIST — read this entire checklist aloud before running any command:

- [ ] `STELLAR_NETWORK=mainnet` is EXPORTED (not `testnet` or unset).
- [ ] Admin account is pre-funded on mainnet. Friendbot does NOT exist on mainnet. If you try to use the testnet flow, you deploy with an unfunded account and all subsequent transactions fail.
- [ ] `INVOISIO_ADMIN_SECRET` for mainnet is exported from a secure source (password manager / env-vault). NEVER paste it into a shared terminal log / CI output.
- [ ] A 2-person review is in progress for the deployment PR (buddy system).
- [ ] Backend env-var flip is already PLANNED (you know when it will happen, how to do it, and how to roll it back).
- [ ] Rollback / upgrade strategy written down in the PR (section 6 of this runbook).

Then:

```bash
cd soroban
export STELLAR_NETWORK=mainnet
export STELLAR_IDENTITY=invoisio-admin
export INVOISIO_ADMIN_SECRET=S...MAINNET_KEY...   # sourced securely

./build.sh
./deploy.sh

# Immediately verify:
./invoke-config.sh
# → confirm initialized=true, admin=<the expected mainnet admin G-address>
# → confirm allowlist_mode matches your policy (native_allowed true/false,
#    requires_token_allowlist true/false)
```

Save the new contract ID from the deploy output + `.contract-id`. Update the backend's production `SOROBAN_CONTRACT_ID` env var in your deploy tool (Vercel / PaaS / env file).

### Step 4: Backend dual-read + write migration

Per the migration flow in [soroban/README.md](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/soroban/README.md) § Upgrade decision matrix / hypothetical v1 → v2 flow:

1. **Freeze writes to OLD contract** (backend feature flag or env).
2. **Export all state** from old contract via `payment_history` paging.
3. **Deploy + initialize NEW contract** (v2) on the intended network.
4. **Backfill / replay** records into new contract — `record_payment` MUST be idempotent per `invoice_id`.
5. **Backend dual-read** from both contracts; compare outputs for ~1 day.
6. **Writes go only to NEW contract.**
7. **Switch indexers, event consumers, dashboards** to new contract ID.
8. After ≥ 30 days of successful operation: retire the old contract (nothing to do on-chain — just stop reading it).

---

## 6. Upgrade Strategy (Same-Address WASM Update vs New Contract Address)

The contract uses a deliberate hybrid. Re-read the upgrade decision matrix from [soroban/README.md](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/soroban/README.md) § Upgrade and versioning strategy before proceeding.

| Change Type | Address Strategy | State Strategy | Example |
|-------------|------------------|----------------|---------|
| Patch / minor bug fix — same storage schema, same ABI | Same address, install the new WASM at the same `C...` ID | Keep storage schema version; metadata tracks versions | "Fix `record_payment` not incrementing count correctly" |
| Additive schema change with lazy migration | Same address POSSIBLE if all new fields have defaults and reads are backward-compatible | Bump `storage_schema_version`; keep legacy read path | "Add optional `settlement_ref` field to `PaymentRecord`" (this was added — existing code handles it) |
| Breaking schema / API / event change | NEW CONTRACT ADDRESS (`C...` changes). Never reuse the same address for a breaking change. | Export/import data off-chain. Dual-read window. | "Change the primary key of payments" or "change `Asset` enum discriminant" |

**Rollback for a bad same-address upgrade:**
- Stellar supports installing WASM at the same address. You can install the PREVIOUS known-good WASM.
- Caveat: if the bad WASM already wrote corrupted state, a WASM rollback does NOT fix the state. You'll need to re-mediate corrupted records on-chain (admin-only migration function) or off-chain+reimport.
- For this reason, always consider breaking-change releases as "new contract address" by default.

**Rollback for a bad new-address deploy (deployed but backend not yet writing):**
- Simply don't flip the backend `SOROBAN_CONTRACT_ID` env var. Leave old contract as primary.
- The orphaned new contract is harmless on-chain. It costs its deploy fee and nothing more.

---

## 7. Post-deploy Verification (Smoke)

After any new deploy (testnet or mainnet):

| # | Check | Script / Method | Expected |
|---|-------|-----------------|----------|
| 1 | Config returns initialized + correct admin | `./invoke-config.sh` | `initialized=true`, `admin=<G...>`, non-zero `version` |
| 2 | Version info matches what you shipped | Read `contract_version()` + `version_info()` via config output | Contract semver matches release tag (packed: e.g. 1_002_003 = 1.2.3) |
| 3 | Allowlist policy matches intent | Read `allowlist_mode` from config | `native_allowed` true/false matches your planned asset policy |
| 4 | Record + get a payment round-trip | `invoke-record-payment.sh` → `invoke-get-payment.sh` | Returned amount, asset, payer, invoice_id all match |
| 5 | Events emitted | `stellar events --id <CONTRACT_ID> --network <net> --start-ledger <N> --type contract` | Each `record_payment` emits exactly one `invoice_payment_recorded` event with correct payload |
| 6 | Unauthorized `record_payment` is rejected | Call `record_payment` signed by a NON-admin identity | Contract error code `9 Unauthorized` |
| 7 | Duplicate `invoice_id` rejected | Call `record_payment` twice with same `invoice_id` | Second call errors with `3 PaymentAlreadyRecorded` |
| 8 | Horizon event streaming (end-to-end backend reconciliation) | Run backend with new contract ID and verify Soroban events flow into the backend `SorobanEventsService` | Events appear in backend logs; no `ContractError` exceptions in the backend. |

---

## 8. Rollback (Full Section — Treat as an Operations Procedure)

### 8.1 Same-address WASM-only rollback

Assumption: the bad release is a same-address WASM upgrade that hasn't yet corrupted any on-chain state that we can't fix.

1. **Identify the last-known-good WASM hash or commit.** This is why we tag releases: `soroban-v1.1.0` had a good WASM.
2. Checkout the last good tag. Rebuild.
3. `stellar contract install` the good WASM at the same contract ID using the admin identity.
4. Run the §7 smoke tests on the same contract address.
5. If state corruption occurred: run admin-only migration function (if one exists in the good version) OR do a new-address data migration (§8.2).

### 8.2 Breaking / corrupted-state rollback — new address migration

Follow the full §5 Step 4 migration in reverse:
1. Re-deploy the previous known-good contract version at a NEW address (C2).
2. Export state from the bad contract (C1) using `payment_history` cursor paging until all records are dumped.
3. Replay records into C2 idempotently.
4. Switch the backend `SOROBAN_CONTRACT_ID` from C1 → C2.
5. Keep C1 contract ID in backend config for a read-only fallback window if desired.
6. After verification window: stop referencing C1.

---

## 9. Known Blockers and Missing Automation

| ID | Title | Impact | How to Unblock |
|----|-------|--------|----------------|
| S-001 | `soroban.yml` builds/tests but never deploys. No testnet integration test step. | Contract releases are "human deploys the release candidate to testnet manually." Easy to forget or rush. | Add a `deploy-testnet-smoke` job to `soroban.yml` that runs on `release/**` branches + tags: provisions a one-off testnet admin identity (GitHub Secret `SOROBAN_TESTNET_ADMIN_SECRET`), runs `build.sh` + `deploy.sh` + `invoke-config.sh` + `invoke-record-payment.sh` against a throwaway testnet deploy. Fail the workflow if any invoke errors. |
| S-002 | Client dist/ manually committed. No CI check that dist/ matches src/. | If someone edits `soroban/client/src/**` and forgets `npm run build`, backend imports stale bindings and production `record_payment` calls fail encoding. | Add a CI step: (1) `cd soroban/client`, (2) `npm ci && npm run build`, (3) `git diff --exit-code dist/` — if there is a diff, fail the build with a message "Please run cd soroban/client && npm run build and commit dist/." |
| S-003 | No snapshot of WASM hashes tied to release tags. | Auditing "what WASM bytecode was actually deployed to mainnet in v1.2.0" is manual today. | In the release workflow job, compute `sha256sum target/wasm32v1-none/release/invoice_payment.wasm` and print it; attach the WASM as a GitHub Release Asset when the workflow runs on tag push. |
| S-004 | Mainnet deploy has no buddy-system guardrails in CI. | One person running `STELLAR_NETWORK=mainnet ./deploy.sh` can deploy without review. Not a code blocker, but a process one. | Add a `mainnet-gate.yml` workflow that only allows mainnet deploys if the PR has a `ready-for-mainnet` label AND an approving review from a contract OWNER. Could be enforced via GitHub Environments with required reviewers. |
| S-005 | `ethnum` lockfile drift. The project memory lesson notes ethnum ≤1.5.2 is broken on new Rust. | If `Cargo.lock` drifts backward, CI breaks with `E0512`. | Add a CI step to `soroban.yml` that runs `cargo tree -p ethnum` and fails if the resolved version is < 1.5.3. |
| S-006 | **Windows local build blocked by Application Control policy** (observed 2026-07-26). On Windows with App Control / WDAC enabled, `cargo check` and `cargo build` fail during `thiserror`'s build-script-build step with os error 4551 ("An Application Control policy has blocked this file") because cargo's generated build scripts are unsigned transient binaries. The scripts run fine on Linux (GitHub Actions runners are Ubuntu) and will work on Windows machines without such policies. | A Windows maintainer cannot validate the Rust pre-flight locally — they must either (a) use WSL 2 (which is already the documented recommendation), (b) disable the specific App Control rule, or (c) rely on GitHub Actions `soroban.yml` for the Rust pre-flight and only do TypeScript client local pre-flight on native Windows. | No action required; this is an environment policy. Reinforce in §3 that WSL 2 is the supported path on Windows for `cargo` commands. |

---

## 10. Code References for Maintainers

| Topic | File |
|-------|------|
| Workspace manifest (deps + profile) | [soroban/Cargo.toml](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/soroban/Cargo.toml) |
| Deep contract API, upgrade policy, events, client usage | [soroban/README.md](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/soroban/README.md) |
| Contract implementation | `soroban/contracts/invoice-payment/src/lib.rs`, `errors.rs`, `events.rs`, `storage.rs`, `test.rs` |
| Network manifests (network + identity + contract + asset per-network config) | [soroban/manifests/testnet.toml](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/soroban/manifests/testnet.toml), [soroban/manifests/mainnet.toml](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/soroban/manifests/mainnet.toml) |
| Build + deploy + invoke scripts (one bash helper per flow) | `soroban/build.sh`, `soroban/deploy.sh`, `soroban/invoke-config.sh`, `soroban/invoke-record-payment.sh`, `soroban/invoke-get-payment.sh`, `soroban/invoke-has-payment.sh`, `soroban/invoke-payment-history.sh`, `soroban/invoke-payments-by-payer.sh`, `soroban/invoke-set-admin.sh`, `soroban/invoke-allow-asset.sh`, `soroban/invoke-revoke-asset.sh`, `soroban/invoke-set-allow-native.sh` |
| TypeScript client source + dist | [soroban/client/package.json](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/soroban/client/package.json); source in `soroban/client/src/`; built dist in `soroban/client/dist/` (committed). |
| Backend consumer of the TypeScript client | `backend/src/soroban/` module; NestJS injectable `SorobanService`. |
| Backend env vars referencing contract | [backend/.env.example](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/backend/.env.example) (search for `SOROBAN_`, `ADMIN_SECRET_`) |
| CI workflow (Rust-only path filters) | [.github/workflows/soroban.yml](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/.github/workflows/soroban.yml) |
