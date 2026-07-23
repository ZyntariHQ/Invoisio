# Requirements Document

## Introduction

Contributors to Invoisio currently face friction when setting up their local environment because environment variable documentation is inconsistent across the four active app surfaces: the NestJS backend, the Next.js web app, the Expo mobile app, and the Soroban smart-contract client. The backend has a reasonably complete `.env.example`, but the web and mobile apps have no example files at all, and the Soroban client lacks a `.env.example` despite its README referencing one. This feature audits the required env vars for every active app and ensures each surface ships with a clear, complete, and consistently formatted example file so any contributor can get running with a single copy-and-edit step.

## Glossary

- **Backend**: The NestJS API located at `backend/`, the primary runtime that coordinates Stellar payments, invoice management, and authentication.
- **Web**: The Next.js frontend located at `web/`, consumed by browser-based merchants.
- **Mobile**: The Expo / React Native app located at `mobile/`, consumed by merchants on iOS and Android.
- **Soroban_Client**: The TypeScript helper library located at `soroban/client/`, used by example scripts and the Backend to interact with the deployed Soroban smart contract.
- **Env_Example_File**: A committed `.env.example` file that documents every environment variable an app reads, with safe placeholder values and inline comments.
- **Critical_Var**: An environment variable whose absence causes the app to fail to start, throw an unhandled error at runtime, or silently produce wrong behavior (e.g., connecting to the wrong Stellar network).
- **Optional_Var**: An environment variable that has a safe default and whose absence does not prevent the app from starting or operating in development mode.
- **Contributor**: A developer who clones the repository and wants to run one or more app surfaces locally.
- **README**: The per-app `README.md` that a Contributor reads first when setting up a surface.

---

## Requirements

### Requirement 1: Backend env example completeness

**User Story:** As a Contributor, I want the backend `.env.example` to document every variable the server reads, so that I can configure the backend without inspecting source code.

#### Acceptance Criteria

1. THE Backend `backend/.env.example` SHALL include every variable validated by the Joi schema in `backend/src/app.module.ts`, specifically: `PORT`, `CORS_ORIGIN`, `DATABASE_URL`, `JWT_SECRET`, `HORIZON_URL`, `STELLAR_NETWORK_PASSPHRASE`, `MERCHANT_PUBLIC_KEY`, `USDC_ISSUER`, `USDC_ASSET_CODE`, `MEMO_PREFIX`, `HORIZON_POLL_INTERVAL`, `SOROBAN_RPC_URL`, `SOROBAN_CONTRACT_ID`, `ADMIN_SECRET_KEY`, `SOROBAN_EVENT_TOPIC`, `THROTTLE_TTL`, `THROTTLE_LIMIT`, `THROTTLE_AUTH_TTL`, `THROTTLE_AUTH_LIMIT`, `THROTTLE_INVOICE_TTL`, `THROTTLE_INVOICE_LIMIT`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_DB`, `REDIS_KEY_PREFIX`, `SLOW_DB_THRESHOLD_MS`, and `SLOW_NETWORK_THRESHOLD_MS`. Any variable present in the Joi schema but absent from the file SHALL cause this criterion to fail.
2. WHEN a variable has a safe default value defined in the Joi schema or config factory, THE Backend `backend/.env.example` SHALL show that exact default as the placeholder value (e.g., `PORT=3001`, `REDIS_HOST=localhost`).
3. WHEN a variable is required with no default — specifically `DATABASE_URL` and `JWT_SECRET` — THE Backend `backend/.env.example` SHALL include an inline comment on the same line or the line immediately above that describes what value to supply and, where applicable, how to generate it (e.g., `# generate with: openssl rand -base64 32` for `JWT_SECRET`).
4. WHEN a variable is a secret — specifically `JWT_SECRET`, `ADMIN_SECRET_KEY`, and `REDIS_PASSWORD` — THE Backend `backend/.env.example` SHALL include a comment containing the exact text `WARNING: never commit a real value` on the line immediately above or inline with that variable.
5. THE Backend `backend/.env.example` SHALL group variables under clearly labeled comment sections using the `# ── Section Name ──` format, with the following sections present in order: `Database`, `JWT`, `Stellar Network`, `Soroban Contract`, `Rate Limiting`, `Redis`, and `Observability`.
6. Each variable in `backend/.env.example` SHALL be annotated with either `# required` or `# optional` as an inline or preceding comment, matching its `required()`/`optional()` designation in the Joi schema.

---

### Requirement 2: Web app env example file

**User Story:** As a Contributor, I want a `.env.example` file in the web app directory, so that I can configure the Next.js frontend without guessing which `NEXT_PUBLIC_` variables are needed.

#### Acceptance Criteria

1. THE Web app SHALL have a `.env.example` file at `web/.env.example`, and this file SHALL be tracked by git (i.e., not matched by any `.gitignore` pattern in the repository).
2. THE `web/.env.example` SHALL include `NEXT_PUBLIC_API_URL` with a placeholder value of `http://localhost:3001` and an inline comment of `# required`.
3. THE `web/.env.example` SHALL include `NEXT_PUBLIC_USDC_ISSUER` with the value `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN` and an inline comment reading `# Testnet default; replace with mainnet issuer for production`.
4. THE `web/.env.example` SHALL contain an entry for every `process.env.*` variable read by web app source files (under `web/`) without a hardcoded fallback value. IF a `process.env` read is added to the web app source without a corresponding entry in `web/.env.example`, THEN the file SHALL be considered incomplete.
5. THE `web/README.md` SHALL include a setup step that contains the exact copy command `cp web/.env.example web/.env.local` (or its OS equivalent) and instructs contributors to run it before executing `npm run dev`.

---

### Requirement 3: Mobile app env example file

**User Story:** As a Contributor, I want a `.env.example` file in the mobile app directory, so that I can set up the Expo app without reading internal source files to discover which `@env` variables are required.

#### Acceptance Criteria

1. THE Mobile app SHALL have a `.env.example` file at `mobile/.env.example`, and this file SHALL be tracked by git (i.e., not matched by any `.gitignore` rule — note the root `.gitignore` uses `.env.*` which would match `.env.example`, so `.env.example` SHALL be explicitly unignored with a `!.env.example` rule or equivalent).
2. THE `mobile/.env.example` SHALL include all variables declared in `mobile/types/env.d.ts`: `API_URL`, `STELLAR_NETWORK_PASSPHRASE`, `REOWN_PROJECT_ID`, and `APP_NAME`. If new variables are added to `env.d.ts`, they SHALL be added to `mobile/.env.example` in the same change.
3. IF a variable has a safe testnet default, THEN THE `mobile/.env.example` SHALL show that default as the placeholder value: `API_URL=http://localhost:3001`, `STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"`, `APP_NAME=Invoisio`.
4. IF a variable requires a contributor-specific value with no safe default — specifically `REOWN_PROJECT_ID` — THEN THE `mobile/.env.example` SHALL include an inline comment reading `# required — obtain from https://cloud.reown.com`.
5. THE `mobile/SMOKE_TEST_CHECKLIST.md` SHALL include a setup step containing the exact copy command `cp mobile/.env.example mobile/.env` (or its OS equivalent) and the Expo dev server start command, before any smoke test steps that require the app to run.
6. THE `mobile/.env.example` file SHALL NOT be matched by any `.gitignore` pattern at the repo root or within `mobile/`. A `!mobile/.env.example` negation rule (or equivalent) SHALL be added to the root `.gitignore` to ensure the file is committed.

---

### Requirement 4: Soroban client env example file

**User Story:** As a Contributor, I want a `.env.example` file in the Soroban client directory, so that I can run the example scripts without manually reconstructing the required variables from the README prose.

#### Acceptance Criteria

1. THE Soroban_Client SHALL have a `.env.example` file at `soroban/client/.env.example`, tracked by git (not matched by any `.gitignore` pattern).
2. THE `soroban/client/.env.example` SHALL include `SOROBAN_RPC_URL` with the value `https://soroban-testnet.stellar.org` and an inline comment of `# required`.
3. THE `soroban/client/.env.example` SHALL include `STELLAR_NETWORK_PASSPHRASE` with the value `"Test SDF Network ; September 2015"` and an inline comment of `# required`.
4. THE `soroban/client/.env.example` SHALL include `SOROBAN_CONTRACT_ID` with a placeholder (e.g., `CXXX...`) and a comment reading `# required — copy from soroban/contracts/invoice-payment/.contract-id after deployment`. This variable is read by the TypeScript client scripts (e.g., `soroban-config.ts`).
5. THE `soroban/client/.env.example` SHALL include `CONTRACT_ID` with the same placeholder and a comment reading `# required — same value as SOROBAN_CONTRACT_ID; read by query-config.ts via process.env.CONTRACT_ID`. This addresses the fact that `query-config.ts` reads `process.env.CONTRACT_ID` rather than `SOROBAN_CONTRACT_ID`.
6. THE `soroban/client/.env.example` SHALL include `ADMIN_SECRET_KEY` with the placeholder `SXXX...` and a comment containing the exact text `WARNING: never commit a real value` on the line immediately above or inline.
7. THE `soroban/client/.env.example` SHALL include `SOURCE_PUBLIC_KEY` with the placeholder `GXXX...` and an inline comment reading `# optional — used for read-only operations; fallback when ADMIN_SECRET_KEY is absent`.
8. THE `soroban/client/.env.example` SHALL include `PAYER_PUBLIC_KEY` with the placeholder `GXXX...` and an inline comment reading `# optional — payer address used in the example:record script; fallback to SOURCE_PUBLIC_KEY when absent`.
9. THE `soroban/client/.env.example` SHALL include `INVOICE_ID` with the placeholder value `invoisio-demo-001` and an inline comment reading `# optional — overrides the default invoice ID in example scripts`.
10. THE `soroban/README.md` "TypeScript Client Helper" setup subsection SHALL contain a `cp soroban/client/.env.example soroban/client/.env` step, and the file `soroban/client/.env.example` SHALL exist at that exact path so the command succeeds.

---

### Requirement 5: Consistent formatting and cross-app alignment

**User Story:** As a Contributor, I want the env example files across all apps to follow a consistent structure, so that I can scan any file and immediately understand which variables are required, which are optional, and how they relate to shared Stellar configuration.

#### Acceptance Criteria

1. THE Env_Example_File for each of the four surfaces (`backend/.env.example`, `web/.env.example`, `mobile/.env.example`, `soroban/client/.env.example`) SHALL use `# ── Section Name ──` comment headers to group related variables, and each variable SHALL carry either a `# required` or `# optional` inline or preceding annotation.
2. WHEN the same Stellar network variable appears in multiple Env_Example_Files — specifically `STELLAR_NETWORK_PASSPHRASE`, `SOROBAN_RPC_URL` (where applicable), and `USDC_ISSUER` / `NEXT_PUBLIC_USDC_ISSUER` — THE placeholder values SHALL be byte-for-byte identical across all files that include that variable.
3. WHEN a variable is a secret — defined as: a private key (value starting with `S` for Stellar secret keys), a JWT secret, a database password, or a third-party API key — THE Env_Example_File SHALL include a comment containing the exact text `WARNING: never commit a real value` on the line immediately above or inline with that variable.
4. THE root `README.md` SHALL include or link to an "Environment Setup" section that explicitly names all four surfaces and their example files: `backend/.env.example`, `web/.env.example`, `mobile/.env.example`, and `soroban/client/.env.example`, and directs contributors to the relevant per-app README or checklist for detailed setup instructions.
5. IF a variable is referenced in an app's source code via `process.env.*`, a typed `@env` import, or a config factory without a hardcoded fallback value, AND that variable is absent from the app's Env_Example_File, THEN the Env_Example_File SHALL be considered incomplete and SHALL be updated to include it before the change is merged.
6. Each of the four Env_Example_Files SHALL exist at its designated path as a committed, git-tracked file. The root `.gitignore` pattern `.env.*` currently matches `.env.example` files; therefore, a negation rule `!**/.env.example` (or per-path equivalents) SHALL be added to the root `.gitignore` so that all four example files are tracked by git.
