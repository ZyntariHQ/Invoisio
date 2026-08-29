# Invoisio `invoice-payment` contract — upgrade runbook

This is the operational procedure for upgrading the deployed `invoice-payment`
contract WASM in place, without moving to a new contract ID. It covers the
`upgrade()` entrypoint (`contracts/invoice-payment/src/lib.rs`), its
relationship to `upgrade_storage()`, rollback expectations, and what happens
to in-flight `record_payment` calls.

For the broader "when do we upgrade in place vs. deploy a new contract"
decision matrix, see `README.md` → "Upgrade and versioning strategy". This
runbook is the how-to for the in-place path.

## Why this exists

Before `upgrade()` existed, nothing in this codebase ever called
`env.deployer().update_current_contract_wasm(...)` — the contract had no
entrypoint that could change its own code. `upgrade_storage()`,
`migration.rs`, and the `StorageSchemaTooNew` / `StorageSchemaTooOld` error
codes were all unreachable as a result: a deployed instance was frozen at its
original code forever, and shipping any fix meant deploying a brand-new
contract ID and migrating every payment record and every backend reference
off-chain. `upgrade()` closes that gap.

## The two-call model

Upgrading a live contract is **two separate calls in two separate
transactions**, not one:

1. **`upgrade(admin, new_wasm_hash, new_contract_version)`** — swaps the WASM
   code running at this contract address. Soroban only swaps the code for
   **subsequent** invocations; the `upgrade()` call itself finishes running
   under the *old* code.
2. **`upgrade_storage(admin)`** — runs under the **new** code (it's the next
   invocation) and migrates on-chain storage to the new
   `STORAGE_SCHEMA_VERSION`, if the new build introduced one. Idempotent —
   safe to call more than once.

Both are admin-gated (`require_auth` on the contract admin).

## Required ordering: pause for the whole window

**The contract must already be paused (`set_paused(true)`) before calling
`upgrade()`, and must stay paused until `upgrade_storage()` has completed and
you've verified the result.** This is enforced on-chain — `upgrade()` returns
`ContractError::MustBePausedForUpgrade` if the contract is not paused when
called.

This isn't just caution — it closes a real correctness gap. Every write path
(`record_payment`, `propose_admin`, `allow_asset`, ...) calls
`ensure_current_contract_meta()`, which **unconditionally** backfills
`ContractMeta` to match whatever code is currently running, with no migration
logic of its own. If a write landed on the new code *after* `upgrade()` but
*before* `upgrade_storage()` actually ran its migration steps, that write
would silently mark the new schema version as current before the migration
had run — masking exactly the corruption `upgrade_storage()` exists to fix.
Staying paused for the whole window means no write can land in that gap.

### What happens to in-flight `record_payment` calls

Soroban transactions are atomic and applied sequentially per ledger — there's
no mid-call race inside `upgrade()` itself. "In-flight" in practice means: a
`record_payment` transaction that was **submitted** (broadcast to the
network) around the same time as the upgrade transaction, but not yet
applied.

Because the runbook pauses the contract *before* `upgrade()` runs:

- Any `record_payment` transaction that lands (in ledger-close order) **after
  the pause takes effect** — whether that's before or after `upgrade()` and
  `upgrade_storage()` — fails with `ContractError::ContractPaused`. It does
  not partially apply and does not need to be retried against a specific
  contract version; the backend's existing `ContractPaused` handling covers
  it, and the caller should resubmit once `is_paused()` reports `false`
  again.
- Nothing can land in the gap between the code swap and the storage
  migration, because nothing can land at all while paused.

If your backend does not already treat `ContractPaused` as "safe to retry
later," verify that before running an upgrade in production.

## Prerequisites

- `stellar` CLI installed and authenticated with the admin identity for the
  target network (see `README.md` → Prerequisites).
- The new contract WASM built and available locally:
  ```sh
  ./build.sh
  # -> target/wasm32v1-none/release/invoice_payment.wasm
  ```
- You know the new build's version as `MAJOR.MINOR.PATCH` (bump
  `CONTRACT_VERSION_MAJOR` / `_MINOR` / `_PATCH` in
  `contracts/invoice-payment/src/storage.rs` before building, per the normal
  release process).
- If the new build changed `STORAGE_SCHEMA_VERSION`, confirm `migration.rs`
  has a migration step for the old → new schema transition (see
  `storage::upgrade_storage_schema`'s step loop).
- A rollback plan (see below) — decided *before* you start, not improvised
  mid-incident.

## Procedure

Scripts referenced below live in `soroban/`. All accept `STELLAR_NETWORK`
(default `testnet`), `STELLAR_IDENTITY` (default `invoisio-admin`), and
`CONTRACT_ID` (default: read from the network's `.contract-id` file) as
environment variables, same as the existing pause/allowlist scripts.

### 1. Dry run

Always dry-run first, especially on mainnet:

```sh
./invoke-upgrade.sh target/wasm32v1-none/release/invoice_payment.wasm 1.1.0 --dry-run
```

This prints the resolved contract ID, checks the current pause state, and
prints the exact `stellar contract upload` / `stellar contract invoke`
commands it would run — without uploading WASM or calling `upgrade()`.

### 2. Pause

```sh
./invoke-pause.sh
```

Confirm: `./invoke-is-paused.sh` reports `PAUSED`.

### 3. Upgrade the code

```sh
./invoke-upgrade.sh target/wasm32v1-none/release/invoice_payment.wasm 1.1.0
```

This uploads the new WASM (`stellar contract upload`), then invokes
`upgrade(admin, new_wasm_hash, new_contract_version)`. On success this emits
a `ContractUpgraded` event carrying the previous and new packed version, the
new WASM hash, and the admin that triggered it — off-chain indexers can
subscribe to this to detect the transition without polling
`contract_version()`.

`contract_version()` still reports the *old* version if you call it again in
this same step — Soroban only swaps the executing code for the *next*
top-level invocation. The following step is that next invocation.

### 4. Migrate storage

```sh
./invoke-upgrade-storage.sh
```

Runs under the new code. Safe to run even if the new build didn't change
`STORAGE_SCHEMA_VERSION` — `upgrade_storage()` is idempotent and will no-op
(after checking the history index is still consistent) if there's nothing to
migrate.

V6 (issuer `String` → `Address`) walks the payment log in batches of
`MAX_ISSUER_MIGRATION_BATCH` (20), same chunking approach as issue #480.
A large deployment returns `IssuerMigrationIncomplete` (23) when a batch
finishes with slots remaining — **call `upgrade_storage()` again** until
`version_info().storage_schema_version` reads `6`. Stay paused for the
whole loop; do not treat Incomplete as a fatal upgrade failure.

Malformed stored issuer strings are counted in the `IssuersMigrated`
event's `skipped_malformed` field and left on the legacy key rather than
deleted.

### 5. Verify

```sh
./invoke-inspect-config.sh
```

Confirm:
- `version.contract_version` reflects the new build.
- `version.storage_schema_version` equals the new build's
  `STORAGE_SCHEMA_VERSION`.
- `admin` is unchanged.
- `paused` is still `true`.

Spot-check that state survived the upgrade unchanged:

```sh
./invoke-payment-history.sh 0 5
./invoke-inspect-allowlist.sh
```

Payment records, the history index, the allowlist, the pause flag, and the
admin address are all ordinary contract storage — Soroban upgrades never
touch persistent or instance storage, only the code, so none of this should
have moved. If anything here looks wrong, do **not** unpause — go to
Rollback below.

### 6. Unpause

Only after verification passes:

```sh
./invoke-unpause.sh
```

## Rollback

Because `upgrade()` and `upgrade_storage()` are two separate, explicit calls
gated by an on-chain pause, rollback is straightforward as long as you catch
a problem **before unpausing**:

- **Problem found after step 3 (code upgraded) but before/during step 4
  (migration):** the contract is still paused, so no write has been able to
  observe the bad state. Call `upgrade()` again with the *previous* WASM
  hash (re-upload the old build with `stellar contract upload` if it's no
  longer installed, or reuse the hash from your last deploy/upgrade record)
  and the previous `new_contract_version`. This reverts the code. If the new
  build's `upgrade_storage()` already ran and mutated storage in a way the
  old code doesn't understand, you additionally need to restore state from
  the pre-upgrade backup/export — this is why schema-breaking upgrades
  should be tested against a testnet fork or a scratch deployment first.
- **Problem found after unpausing:** you no longer have the "nothing could
  have written under the bad state" guarantee. Treat this as an incident:
  pause immediately (`./invoke-pause.sh`), assess what (if anything) wrote
  under the new code, then follow the same code-revert procedure above,
  reconciling any writes that happened in between against your off-chain
  records (`ContractUpgraded` and `InvoicePaymentRecorded` events give you an
  exact ledger-ordered account of what happened and when).
- **Rollback is itself an `upgrade()` call**, so it has the same
  precondition: the contract must be paused. If you're rolling back because
  something is badly broken and you can't get a clean read to confirm pause
  state, `set_paused(true)` is safe to call redundantly — it's idempotent.

Keep the previously-deployed WASM hash (and ideally the `.wasm` file itself)
on hand after every upgrade specifically so a rollback doesn't require
re-deriving it under pressure.

## Client / indexer integration

- The TypeScript client's `SorobanInvoiceClient.upgrade(newWasmHash,
  newContractVersion)` (`client/src/soroban-invoice-client.ts`) wraps the
  same call the ops script makes, for backend-driven upgrade tooling.
- `decodeSorobanEvent` (`client/src/events.ts`) decodes `contract_upgraded`
  events into `ContractUpgradedEvent { previousVersion, newVersion,
  newWasmHash, upgradedBy, upgradedAt }` — `newWasmHash` is hex-encoded.
- `schema.json` (regenerated via `./contracts/invoice-payment/generate-schema.sh`)
  documents `upgrade`, `MustBePausedForUpgrade`, and `ContractUpgraded` as
  part of the contract's machine-readable ABI, checked for drift in CI (see
  README.md → "ABI drift CI check").

## Testing this mechanism

`contracts/invoice-payment/src/test.rs` covers every rejection path
(non-admin, not-yet-initialised, not paused) with ordinary unit tests. The
full "upgrade the running code, then run `upgrade_storage()` under it"
sequence is covered by `upgrade_wasm_integration::
test_wasm_upgrade_then_storage_migration_preserves_state`, which uploads
this crate's own compiled WASM as the "new" code via
`env.deployer().upload_contract_wasm(...)` and exercises the full runbook
end to end (pause → upgrade → upgrade_storage → verify state survived →
unpause → confirm `record_payment` still works under the new code).

That test needs a real, callable WASM binary, so it's gated behind a Cargo
feature rather than part of the default `cargo test` run:

```sh
./build.sh
cargo test -p invoice-payment --features upgrade-fixture-test
```
