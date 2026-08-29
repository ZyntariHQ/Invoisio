# Walkthrough: Read-Only Operational Inspection Scripts for Invoisio Soroban Contract

**Status:** Current
**Last Reviewed:** 2026-08-24

## Why this matters

Maintainers currently had no quick way to inspect contract status — checking the pause state, admin identity, or allowlist configuration required writing raw `stellar contract invoke` RPC calls from scratch each time. This PR adds three dedicated **read-only helper scripts** so any operator can run a single command to get a clear, actionable status snapshot.

---

## Scope

- Add read-only scripts to inspect **contract config**, **pause state**, and **allowlist settings**.
- Follow the conventions already established by the existing Soroban scripts (`invoke-config.sh`, `invoke-pause.sh`, `invoke-list-assets.sh`, etc.).
- Support both `testnet` and `mainnet` environments via `STELLAR_NETWORK`.
- Accept `CONTRACT_ID` overrides via environment variable consistent with all existing scripts.
- Include inline usage guidance and operational next-step pointers.

---

## Summary of Changes

### New Scripts

| Script | Contract View Called | Purpose |
|---|---|---|
| `invoke-inspect-config.sh` | `config()` | Human-readable dashboard: init status, admin, pending admin, pause state, version metadata |
| `invoke-inspect-allowlist.sh` | `config()` → `allowlist_mode` | Allowlist policy: native XLM flag, token allowlist mode, next-step links |
| `invoke-is-paused.sh` | `is_paused()` | Single-question check: is the contract paused right now? |

---

### 1. `invoke-inspect-config.sh` — Full Configuration Dashboard

Calls the permissionless `config()` view and formats the result into a clear operational checklist:

- **Initialization status** — `🟢 Initialized` / `🔴 Uninitialized`
- **Current admin address**
- **Pending admin** — flags if a two-step handoff is in flight
- **Contract state** — `✅ ACTIVE` / `⚠️ PAUSED`
- **Contract code version** and **storage schema version**

**Usage:**
```bash
./invoke-inspect-config.sh

# Override network
STELLAR_NETWORK=mainnet ./invoke-inspect-config.sh

# Override contract ID
CONTRACT_ID=CXXXXXXXXX... ./invoke-inspect-config.sh
```

**Example output:**
```
=========================================
Inspecting Contract Configuration
=========================================
Contract ID: CA5KFRYL64YTI5Y4OWCLVJRM6UJB3D37WXGV7VVFPGYERBREF6BWOWD2
Network:     testnet

On-Chain Operational Status:
-----------------------------------------
Status:          🟢 Initialized
Current Admin:   GAIC6UD7QYAYHJ3Q5LLXWRBWGNLNKAZBFIN4CEH77CQASDOCTDRIHENL
Pending Admin:   None
Contract State:  ✅ ACTIVE

Contract Metadata:
-----------------------------------------
Contract Code Version: 1000000
Storage Schema Version: 1
```

---

### 2. `invoke-inspect-allowlist.sh` — Allowlist Policy Inspector

Calls `config()` and extracts the `allowlist_mode` block. Displays both the **native XLM** flag and the **token allowlist mode** with actionable pointers:

- Whether native XLM payments are currently accepted
- Whether Stellar tokens must be explicitly allowlisted
- Direct references to `invoke-allow-asset.sh` and `invoke-revoke-asset.sh` for follow-up

**Usage:**
```bash
./invoke-inspect-allowlist.sh

STELLAR_NETWORK=mainnet ./invoke-inspect-allowlist.sh
```

**Example output:**
```
=========================================
Inspecting Allowlist Settings
=========================================
Contract ID: CA5KFRYL64YTI5Y4OWCLVJRM6UJB3D37WXGV7VVFPGYERBREF6BWOWD2
Network:     testnet

Allowlist Configuration Status:
-----------------------------------------
❌ Native XLM: Denied
   (To enable, run ./invoke-set-allow-native.sh true)
🔒 Token Allowlist: Enabled (requires_token_allowlist=true)
   (Stellar tokens must be explicitly allowlisted before record_payment accepts them)

Operations Guidance:
  - To list all configured assets, run: ./invoke-list-assets.sh
  - To allow a token, run:            ./invoke-allow-asset.sh <code> <issuer>
  - To revoke a token, run:           ./invoke-revoke-asset.sh <code> <issuer>
```

---

### 3. `invoke-is-paused.sh` — Pause State Check

Calls the dedicated `is_paused()` contract view directly. Returns a clear binary status and tells the operator exactly what to run next:

**Usage:**
```bash
./invoke-is-paused.sh

STELLAR_NETWORK=mainnet ./invoke-is-paused.sh
```

**Example output (active):**
```
=========================================
Checking Contract Pause State
=========================================
Contract ID: CA5KFRYL64YTI5Y4OWCLVJRM6UJB3D37WXGV7VVFPGYERBREF6BWOWD2
Network:     testnet

Raw Result: false

✅ Contract is currently ACTIVE (not paused).
Write operations are enabled.
To pause, run: ./invoke-pause.sh
```

**Example output (paused):**
```
Raw Result: true

⚠️  Contract is currently PAUSED.
All write operations (record_payment) will be rejected.
To unpause, run: ./invoke-unpause.sh
```

---

### Updated: `soroban/README.md`

- Added the three new scripts to the **Project Structure** directory tree, clearly grouped under a `── Read-only operational inspection ──` label.
- Added a new **"Read-Only Operational Inspection Scripts"** section in the Script Reference with full usage, env vars, and example output for each script.

---

## Safety Guarantees

> [!IMPORTANT]
> All three scripts are **strictly read-only**. They call only permissionless contract views (`config()`, `is_paused()`). No `--send yes` flag is used. They cannot modify any on-chain state.

---

## Integration with Existing Conventions

These scripts follow **all existing patterns** from the soroban script suite:

- `#!/usr/bin/env bash` shebang with `set -euo pipefail`
- `cd "$(dirname "$0")"` for reliable relative path resolution
- `STELLAR_NETWORK`, `STELLAR_IDENTITY`, `CONTRACT_ID` env var resolution
- Network-aware `.contract-id` / `.contract-id-mainnet` file lookup
- Consistent `❌ / ✅ / ℹ️` status prefix conventions
- `>&2` for diagnostic output, clean stdout for machine-readable results

---

## CI Integrity

> [!NOTE]
> No CI configuration files were modified. The existing `soroban.yml` workflow (`cargo test` + `cargo build --target wasm32-unknown-unknown --release`) is untouched. These are shell scripts in `soroban/`, which the CI workflow does not lint or execute — so no CI risk is introduced.

---

## Acceptance Criteria Checklist

- [x] Maintainers can inspect **contract config** via `./invoke-inspect-config.sh`
- [x] Maintainers can inspect **pause state** via `./invoke-is-paused.sh`
- [x] Maintainers can inspect **allowlist values** via `./invoke-inspect-allowlist.sh`
- [x] Scripts are **safe read-only helpers** — no state mutation possible
- [x] **Usage is clear** — inline comments, env var docs, example outputs, and next-step pointers
- [x] Scripts follow **existing Soroban script conventions**
- [x] Both `testnet` and `mainnet` **networks are supported**
- [x] **README updated** with project structure entry and full script reference docs
