# Design Document: env-setup-alignment

## Overview

This feature eliminates the environment-variable setup friction that contributors encounter when cloning Invoisio. Four active app surfaces currently have inconsistent or missing `.env.example` files, which forces contributors to inspect source code to discover what variables are required.

The work is entirely file-level: no new runtime code is introduced. The deliverables are:

1. A patched `backend/.env.example` — complete, annotated, and grouped.
2. A new `web/.env.example` — all `NEXT_PUBLIC_*` variables.
3. A new `mobile/.env.example` — all `@env` variables from `env.d.ts`.
4. A new `soroban/client/.env.example` — all contract client variables.
5. Root `.gitignore` update — `!**/.env.example` negation so all four files are git-tracked.
6. Root `README.md` update — "Environment Setup" section.
7. `web/README.md`, `mobile/SMOKE_TEST_CHECKLIST.md`, and `soroban/README.md` updates — copy commands.

### Non-goals

- No changes to application source code.
- No changes to Joi schema or config factories.
- No changes to CI pipelines or deployment configuration.
- No secret rotation or real credential exposure.

---

## Architecture

This feature is purely documentation/configuration: it produces static files tracked in git. There is no runtime component, service, or API surface.

```
repo root
├── .gitignore                   ← patch: add !**/.env.example negation
├── README.md                    ← patch: add Environment Setup section
├── backend/
│   └── .env.example             ← patch: complete all Joi vars, group sections, annotate
├── web/
│   ├── .env.example             ← new file
│   └── README.md                ← patch: add cp setup step
├── mobile/
│   ├── .env.example             ← new file
│   └── SMOKE_TEST_CHECKLIST.md  ← patch: add cp setup step before smoke tests
└── soroban/
    ├── README.md                ← patch: add cp step in TypeScript Client Helper section
    └── client/
        └── .env.example         ← new file
```

The root `.gitignore` currently contains `.env.*`, which glob-matches `.env.example`. The `!**/.env.example` negation rule placed after that pattern explicitly unignores all `.env.example` files throughout the monorepo. Git processes `.gitignore` rules in order, so the negation overrides the earlier match.

---

## Components and Interfaces

### 1. `backend/.env.example` (patch)

**Source of truth**: The Joi `validationSchema` in `backend/src/app.module.ts`.

All 27 validated variables must be present. Variables are grouped by domain using `# ── Section Name ──` headers. Each variable carries either `# required` or `# optional`, matching its Joi designation. Secret variables (`JWT_SECRET`, `ADMIN_SECRET_KEY`, `REDIS_PASSWORD`) carry a `WARNING: never commit a real value` comment. Required-with-no-default variables (`DATABASE_URL`, `JWT_SECRET`) include generation guidance comments.

Section order and variables:

| Section | Variables |
|---------|-----------|
| `Database` | `DATABASE_URL` |
| `JWT` | `JWT_SECRET` |
| `App` | `PORT`, `CORS_ORIGIN` |
| `Stellar Network` | `HORIZON_URL`, `STELLAR_NETWORK_PASSPHRASE`, `MERCHANT_PUBLIC_KEY`, `USDC_ISSUER`, `USDC_ASSET_CODE`, `MEMO_PREFIX`, `HORIZON_POLL_INTERVAL` |
| `Soroban Contract` | `SOROBAN_RPC_URL`, `SOROBAN_CONTRACT_ID`, `ADMIN_SECRET_KEY`, `SOROBAN_EVENT_TOPIC` |
| `Rate Limiting` | `THROTTLE_TTL`, `THROTTLE_LIMIT`, `THROTTLE_AUTH_TTL`, `THROTTLE_AUTH_LIMIT`, `THROTTLE_INVOICE_TTL`, `THROTTLE_INVOICE_LIMIT` |
| `Redis` | `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`, `REDIS_KEY_PREFIX` |
| `Observability` | `SLOW_DB_THRESHOLD_MS`, `SLOW_NETWORK_THRESHOLD_MS` |

### 2. `web/.env.example` (new)

**Source of truth**: All `process.env.NEXT_PUBLIC_*` reads in `web/` source.

Current reads (from static analysis):
- `NEXT_PUBLIC_API_URL` — read in `web/lib/api-client.ts` (has fallback `http://localhost:3001`, so it is optional at runtime but must be documented).
- `NEXT_PUBLIC_USDC_ISSUER` — read in `web/app/pos/page.tsx` (has fallback, documented as optional with testnet default).

Format: two sections (`API` and `Stellar`), each variable annotated.

### 3. `mobile/.env.example` (new)

**Source of truth**: All `export const` declarations in `mobile/types/env.d.ts`.

Variables: `API_URL`, `STELLAR_NETWORK_PASSPHRASE`, `REOWN_PROJECT_ID`, `APP_NAME`.

`REOWN_PROJECT_ID` has no safe default and requires a contributor-specific value; it gets a `# required — obtain from https://cloud.reown.com` comment.

Note: `mobile/.gitignore` uses `.env*.local` (not `.env.*`), so it does not match `.env.example`. The root `.gitignore` uses `.env.*`, which does match. The `!**/.env.example` negation in the root `.gitignore` resolves this.

### 4. `soroban/client/.env.example` (new)

**Source of truth**: `process.env.*` reads in `soroban/client/examples/` and `soroban/client/src/`.

Variables from static analysis:
- `SOROBAN_RPC_URL` — `requireEnv()` in `record-payment.ts`, `query-payment.ts`; with fallback in `query-config.ts`.
- `STELLAR_NETWORK_PASSPHRASE` — `requireEnv()` in `record-payment.ts`, `query-payment.ts`; with fallback in `query-config.ts`.
- `SOROBAN_CONTRACT_ID` — `requireEnv()` in `record-payment.ts`, `query-payment.ts`.
- `CONTRACT_ID` — direct `process.env.CONTRACT_ID` in `query-config.ts` (different from `SOROBAN_CONTRACT_ID`).
- `ADMIN_SECRET_KEY` — `requireEnv()` in `record-payment.ts`.
- `SOURCE_PUBLIC_KEY` — optional fallback read in `query-config.ts`, `query-payment.ts`.
- `PAYER_PUBLIC_KEY` — `requireEnv()` in `record-payment.ts`; fallback in `query-payment.ts`.
- `INVOICE_ID` — optional override in `record-payment.ts`, `query-payment.ts`.

`ADMIN_SECRET_KEY` (value starts with `S`, Stellar secret key) carries the `WARNING: never commit a real value` comment.

### 5. Root `.gitignore` (patch)

Add `!**/.env.example` as a negation rule after the `.env.*` line. Git evaluates rules sequentially; a later negation overrides an earlier match. This single rule unignores all `.env.example` files in all subdirectories.

### 6. Documentation updates

| File | Change |
|------|--------|
| `README.md` | Add "Environment Setup" section naming all four surfaces with their `.env.example` paths and per-app setup links |
| `web/README.md` | Add environment setup step with `cp web/.env.example web/.env.local` before `npm run dev` |
| `mobile/SMOKE_TEST_CHECKLIST.md` | Add environment setup step with `cp mobile/.env.example mobile/.env` in the "Before you start" section |
| `soroban/README.md` | Add `cp soroban/client/.env.example soroban/client/.env` step in the "TypeScript Client Helper → Setup" subsection |

---

## Data Models

There is no runtime data model. The canonical "model" is the Joi validation schema in `backend/src/app.module.ts`, which defines the authoritative variable names, types, defaults, and required/optional designations for the backend. The other surfaces derive their variable lists from their respective source of truth (typed module declarations for mobile, static `process.env` reads for web and Soroban client).

### Variable inventory (all surfaces)

```
backend/.env.example   (27 vars from Joi schema)
  DATABASE_URL          required, no default
  JWT_SECRET            required, no default, secret
  PORT                  optional, default 3001
  CORS_ORIGIN           optional, default http://localhost:3000
  HORIZON_URL           optional, default https://horizon-testnet.stellar.org
  STELLAR_NETWORK_PASSPHRASE  optional, default "Test SDF Network ; September 2015"
  MERCHANT_PUBLIC_KEY   optional, allow ""
  USDC_ISSUER           optional, default GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN
  USDC_ASSET_CODE       optional, default USDC
  MEMO_PREFIX           optional, default invoisio-
  HORIZON_POLL_INTERVAL optional, default 15000
  SOROBAN_RPC_URL       optional, default https://soroban-testnet.stellar.org
  SOROBAN_CONTRACT_ID   optional, allow ""
  ADMIN_SECRET_KEY      optional, allow "", secret
  SOROBAN_EVENT_TOPIC   optional, default InvoicePaymentRecorded
  THROTTLE_TTL          optional, default 60
  THROTTLE_LIMIT        optional, default 100
  THROTTLE_AUTH_TTL     optional, default 900
  THROTTLE_AUTH_LIMIT   optional, default 5
  THROTTLE_INVOICE_TTL  optional, default 3600
  THROTTLE_INVOICE_LIMIT optional, default 20
  REDIS_HOST            optional, default localhost
  REDIS_PORT            optional, default 6379
  REDIS_PASSWORD        optional, allow "", secret
  REDIS_DB              optional, default 0
  REDIS_KEY_PREFIX      optional, default invoisio:throttle:
  SLOW_DB_THRESHOLD_MS  optional, default 200
  SLOW_NETWORK_THRESHOLD_MS optional, default 500

web/.env.example       (2 vars from process.env reads)
  NEXT_PUBLIC_API_URL           optional, default http://localhost:3001
  NEXT_PUBLIC_USDC_ISSUER       optional, testnet default GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN

mobile/.env.example    (4 vars from env.d.ts)
  API_URL                       optional, default http://localhost:3001
  STELLAR_NETWORK_PASSPHRASE    optional, default "Test SDF Network ; September 2015"
  REOWN_PROJECT_ID              required, no safe default
  APP_NAME                      optional, default Invoisio

soroban/client/.env.example  (8 vars from examples + src)
  SOROBAN_RPC_URL               required
  STELLAR_NETWORK_PASSPHRASE    required
  SOROBAN_CONTRACT_ID           required
  CONTRACT_ID                   required (read by query-config.ts via process.env.CONTRACT_ID)
  ADMIN_SECRET_KEY              optional for reads, required for writes, secret
  SOURCE_PUBLIC_KEY             optional
  PAYER_PUBLIC_KEY              optional
  INVOICE_ID                    optional, default invoisio-demo-001
```

### Shared variable consistency

The following variables appear across multiple surfaces and must carry byte-for-byte identical values:

| Variable | Shared across | Required value |
|----------|--------------|----------------|
| `STELLAR_NETWORK_PASSPHRASE` | backend, mobile, soroban/client | `"Test SDF Network ; September 2015"` |
| `SOROBAN_RPC_URL` | backend, soroban/client | `https://soroban-testnet.stellar.org` |
| `USDC_ISSUER` / `NEXT_PUBLIC_USDC_ISSUER` | backend, web | `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN` |
| `API_URL` / `NEXT_PUBLIC_API_URL` | mobile, web | `http://localhost:3001` |

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

This feature is file-generation and documentation: it does not implement algorithms, parsers, or data transformations. Most acceptance criteria are concrete example-based checks (does file X contain line Y?). However, several criteria express universal invariants that hold across a dynamic set of inputs — specifically the set of variable lines in the files, the set of variables declared in source, and the set of files across the four surfaces. These are good candidates for property-based testing.

**Property Reflection:**

After reviewing all prework classifications, five properties were identified. On reflection:
- Properties 1 and 4 both test "every variable line has a required/optional annotation"; Property 1 tests backend only, Property 4 generalises to all four files. Property 1 is subsumed by Property 4 — consolidated.
- Property 3 (completeness for web) and Property 5 (completeness for all surfaces) overlap. Property 5 subsumes Property 3 — consolidated.
- Properties 2 (mobile env.d.ts sync) and the source-read-completeness are distinct enough to keep separate since they target different source-of-truth files.

After reflection, four non-redundant properties remain:

---

### Property 1: All variable lines in every .env.example carry a required/optional annotation

*For any* variable line (a line matching the pattern `KEY=VALUE`) in any of the four `.env.example` files (`backend/.env.example`, `web/.env.example`, `mobile/.env.example`, `soroban/client/.env.example`), that line or the line immediately above it SHALL contain either the substring `# required` or the substring `# optional`.

**Validates: Requirements 1.6, 5.1**

---

### Property 2: Every variable declared in mobile/types/env.d.ts appears in mobile/.env.example

*For any* `export const VAR` declaration in `mobile/types/env.d.ts`, the variable name `VAR` SHALL appear as a key in `mobile/.env.example`. If a new variable is added to `env.d.ts`, the property fails until `mobile/.env.example` is updated to include it.

**Validates: Requirements 3.2**

---

### Property 3: Shared Stellar variables are byte-for-byte identical across all files that include them

*For any* variable name that appears in two or more of the four `.env.example` files (including semantic equivalents such as `USDC_ISSUER` in the backend and `NEXT_PUBLIC_USDC_ISSUER` in the web, both referencing the same USDC issuer address), the assigned values SHALL be byte-for-byte identical.

**Validates: Requirements 5.2**

---

### Property 4: Every process.env.* or @env read without a hardcoded fallback is documented in its surface's .env.example

*For any* `process.env.VAR` read (or `@env` import of `VAR`) in any of the four app surfaces' source files where no hardcoded fallback is provided at the call site, the variable name `VAR` SHALL appear as a key in that surface's `.env.example`.

**Validates: Requirements 2.4, 5.5**

---

## Error Handling

Because this feature produces only static files (no runtime code), traditional error handling does not apply. The relevant failure modes are:

| Failure mode | Mitigation |
|---|---|
| A `.env.example` is git-ignored despite the negation rule | The root `.gitignore` negation `!**/.env.example` must appear after the `.env.*` line. Verified by running `git check-ignore -v path/to/.env.example` during review. |
| A Joi variable is added to `app.module.ts` but not to `backend/.env.example` | Property 4 and the example-based completeness test (1.1) catch this. |
| A variable is added to `mobile/types/env.d.ts` but not to `mobile/.env.example` | Property 2 catches this. |
| Shared Stellar values drift between surfaces | Property 3 catches this. |
| A real secret value is accidentally placed in an `.env.example` | Secret variables use placeholder values only (`SXXX...`, `change-me-generate-with-openssl`, etc.). The `WARNING: never commit a real value` comment is both a user signal and an auditable marker. |
| Copy command in documentation refers to wrong file path | Each copy command references exact repo-relative paths validated during implementation. |

---

## Testing Strategy

This feature uses a dual approach:

### Unit / example-based tests

Example tests are appropriate here because most acceptance criteria are concrete, deterministic checks against a fixed set of files and a known variable inventory. They run fast and require no randomisation.

**Test file location**: `backend/src/` or a dedicated `tests/env-examples/` directory (plain Node.js or Jest).

Key example tests:

1. **Backend completeness** — Parse `backend/.env.example` and assert all 27 Joi-schema variable names are present as keys.
2. **Backend defaults** — For each variable with a Joi default, assert the `.env.example` value matches the default.
3. **Backend secrets** — Assert `JWT_SECRET`, `ADMIN_SECRET_KEY`, and `REDIS_PASSWORD` each have a `WARNING: never commit a real value` comment.
4. **Backend section headers** — Assert all 7 `# ── Section Name ──` headers are present in the correct order.
5. **Web file existence and variables** — Assert `web/.env.example` exists, contains `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_USDC_ISSUER` with expected values and annotations.
6. **Mobile file existence and variables** — Assert `mobile/.env.example` exists and contains the 4 declared variables with expected values.
7. **Soroban client file** — Assert `soroban/client/.env.example` exists and contains all 8 variables with specified values and comments.
8. **Documentation copy commands** — Assert each README/checklist contains the exact copy command string.
9. **Root README Environment Setup** — Assert root `README.md` contains "Environment Setup" section referencing all four surfaces.

### Property-based tests

Property-based testing is applicable because four of the acceptance criteria express universal invariants over the variable-line set, the `env.d.ts` declaration set, and the set of `process.env` reads. These sets can change as contributors add new variables, so property tests catch future regressions automatically.

**Library**: [fast-check](https://github.com/dubzzz/fast-check) (TypeScript, works with Jest/Vitest).

**Minimum iterations**: 100 per property test.

**Tag format**: `// Feature: env-setup-alignment, Property {N}: {property_text}`

#### Property test 1 — Annotation completeness

```
// Feature: env-setup-alignment, Property 1: All variable lines carry required/optional annotation
```

For each of the four `.env.example` files, parse all lines. Use `fc.constantFrom(...lines)` to generate a random variable line from the file. Assert that the line or the preceding line contains `# required` or `# optional`.

#### Property test 2 — env.d.ts / mobile sync

```
// Feature: env-setup-alignment, Property 2: Every env.d.ts variable appears in mobile/.env.example
```

Parse `mobile/types/env.d.ts` to extract all exported variable names. Use `fc.constantFrom(...varNames)` to generate a random declared variable. Assert it appears as a key in `mobile/.env.example`.

#### Property test 3 — Shared variable consistency

```
// Feature: env-setup-alignment, Property 3: Shared Stellar variables are identical across files
```

For each of the four shared-variable pairs (see Data Models section), parse the value from each relevant file. Assert the values are byte-for-byte identical.

#### Property test 4 — Source-read completeness

```
// Feature: env-setup-alignment, Property 4: Every undocumented process.env read appears in .env.example
```

For each surface, maintain a static list of `process.env.VAR` reads without hardcoded fallbacks (derived from static analysis). Use `fc.constantFrom(...reads)` to generate a random undocumented read. Assert the variable name appears in the corresponding `.env.example`.

### Notes on PBT applicability

These property tests are appropriate because:
- The input space is the set of variable-line strings and declared variable names — finite but open-ended as the codebase grows.
- Input variation reveals real regressions: adding a variable to source without updating the example file fails Property 4.
- All operations are in-memory file parsing — no external services, fast, cost-effective at 100+ iterations.

Integration tests (e.g., running `git check-ignore`) are used only as smoke tests to verify git tracking, not as property-based tests, because they test external tool behavior and don't benefit from multiple iterations.
