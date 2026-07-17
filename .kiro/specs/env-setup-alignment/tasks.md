# Implementation Tasks

## Task List

- [ ] 1. Fix root `.gitignore` so `.env.example` files are git-tracked
- [ ] 2. Patch `backend/.env.example` to be complete and annotated
- [ ] 3. Create `web/.env.example`
- [ ] 4. Create `mobile/.env.example`
- [ ] 5. Create `soroban/client/.env.example`
- [ ] 6. Update `web/README.md` with environment setup step
- [ ] 7. Update `mobile/SMOKE_TEST_CHECKLIST.md` with environment setup step
- [ ] 8. Update `soroban/README.md` TypeScript Client Helper setup step
- [ ] 9. Update root `README.md` with Environment Setup section

---

## Task Details

### Task 1: Fix root `.gitignore` so `.env.example` files are git-tracked

**Description:**  
The root `.gitignore` contains `.env.*`, which glob-matches every `.env.example` file in the repo. Without a negation rule, all four `.env.example` files created by this feature will be silently ignored by git and never committed. Add `!**/.env.example` immediately after the `.env.*` line.

**Files to change:**
- `.gitignore`

**Exact change:**  
In the `# Environment files` block, after `.env.*`, add the negation line:

```
# Environment files
.env
.env.*
!**/.env.example
```

**Verification:** After this change, running `git check-ignore -v backend/.env.example` should produce no output (file is not ignored).

**Requirements addressed:** 2.1, 3.1, 3.6, 4.1, 5.6

---

### Task 2: Patch `backend/.env.example` to be complete and annotated

**Description:**  
The current `backend/.env.example` is missing the following variables that are present in the Joi schema: `PORT`, `CORS_ORIGIN`, `SOROBAN_EVENT_TOPIC`, all `THROTTLE_*` vars, all `REDIS_*` vars, and both `SLOW_*_THRESHOLD_MS` vars. It also lacks `# required` / `# optional` annotations and a `WARNING: never commit a real value` comment on `REDIS_PASSWORD`. Rewrite the file to cover all 27 Joi-validated variables, grouped under 8 section headers.

**Files to change:**
- `backend/.env.example`

**Complete replacement content:**

```dotenv
# ── Database ─────────────────────────────────────────────────────────────────
# required — set to your PostgreSQL connection string
# e.g. postgresql://user:password@localhost:5432/invoisio_db
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/invoisio_db # required

# ── JWT ──────────────────────────────────────────────────────────────────────
# WARNING: never commit a real value
# required — generate with: openssl rand -base64 32
JWT_SECRET=change-me-generate-with-openssl-rand-base64-32 # required

# ── App ──────────────────────────────────────────────────────────────────────
PORT=3001                           # optional
CORS_ORIGIN=http://localhost:3000   # optional

# ── Stellar Network ──────────────────────────────────────────────────────────
# Testnet: https://horizon-testnet.stellar.org
# Mainnet: https://horizon.stellar.org
HORIZON_URL=https://horizon-testnet.stellar.org                               # optional
# Testnet: "Test SDF Network ; September 2015"
# Mainnet: "Public Global Stellar Network ; September 2015"
STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"                # optional
MERCHANT_PUBLIC_KEY=                                                            # optional
# Testnet default; replace with mainnet issuer for production
USDC_ISSUER=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN        # optional
USDC_ASSET_CODE=USDC                                                            # optional
MEMO_PREFIX=invoisio-                                                           # optional
HORIZON_POLL_INTERVAL=15000                                                     # optional

# ── Soroban Contract ─────────────────────────────────────────────────────────
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org                             # optional
# Copy from soroban/contracts/invoice-payment/.contract-id after deployment
SOROBAN_CONTRACT_ID=CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX # optional
# WARNING: never commit a real value
ADMIN_SECRET_KEY=SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX    # optional
SOROBAN_EVENT_TOPIC=InvoicePaymentRecorded                                      # optional

# ── Rate Limiting ─────────────────────────────────────────────────────────────
THROTTLE_TTL=60            # optional — general window in seconds
THROTTLE_LIMIT=100         # optional — max requests per window
THROTTLE_AUTH_TTL=900      # optional — auth endpoint window in seconds
THROTTLE_AUTH_LIMIT=5      # optional — max auth requests per window
THROTTLE_INVOICE_TTL=3600  # optional — invoice endpoint window in seconds
THROTTLE_INVOICE_LIMIT=20  # optional — max invoice requests per window

# ── Redis ─────────────────────────────────────────────────────────────────────
REDIS_HOST=localhost         # optional
REDIS_PORT=6379              # optional
# WARNING: never commit a real value
REDIS_PASSWORD=              # optional
REDIS_DB=0                   # optional
REDIS_KEY_PREFIX=invoisio:throttle: # optional

# ── Observability ─────────────────────────────────────────────────────────────
SLOW_DB_THRESHOLD_MS=200      # optional — log warning when DB query exceeds this ms
SLOW_NETWORK_THRESHOLD_MS=500 # optional — log warning when network call exceeds this ms
```

**Requirements addressed:** 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 5.1, 5.2, 5.3

---

### Task 3: Create `web/.env.example`

**Description:**  
The web app has no `.env.example` at all. Static analysis found two `process.env.*` reads in the web source: `NEXT_PUBLIC_API_URL` (in `web/lib/api-client.ts`) and `NEXT_PUBLIC_USDC_ISSUER` (in `web/app/pos/page.tsx`). Both have runtime fallbacks, so they are optional, but must be documented.

**Files to change:**
- `web/.env.example` (new file)

**Complete content:**

```dotenv
# ── API ───────────────────────────────────────────────────────────────────────
# URL of the Invoisio backend API
NEXT_PUBLIC_API_URL=http://localhost:3001 # optional

# ── Stellar ───────────────────────────────────────────────────────────────────
# Testnet default; replace with mainnet issuer for production
NEXT_PUBLIC_USDC_ISSUER=GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN # optional
```

**Requirements addressed:** 2.1, 2.2, 2.3, 2.4, 5.1, 5.2, 5.6

---

### Task 4: Create `mobile/.env.example`

**Description:**  
The mobile app has no `.env.example`. All required variables are declared in `mobile/types/env.d.ts`: `API_URL`, `STELLAR_NETWORK_PASSPHRASE`, `REOWN_PROJECT_ID`, and `APP_NAME`. `REOWN_PROJECT_ID` requires a contributor-specific value obtained from the Reown Cloud dashboard.

**Files to change:**
- `mobile/.env.example` (new file)

**Complete content:**

```dotenv
# ── API ───────────────────────────────────────────────────────────────────────
API_URL=http://localhost:3001 # optional

# ── Stellar ───────────────────────────────────────────────────────────────────
# Testnet: "Test SDF Network ; September 2015"
# Mainnet: "Public Global Stellar Network ; September 2015"
STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015" # optional

# ── Wallet Connect ───────────────────────────────────────────────────────────
# required — obtain from https://cloud.reown.com
REOWN_PROJECT_ID=your-reown-project-id-here # required

# ── App ──────────────────────────────────────────────────────────────────────
APP_NAME=Invoisio # optional
```

**Requirements addressed:** 3.1, 3.2, 3.3, 3.4, 3.6, 5.1, 5.2, 5.6

---

### Task 5: Create `soroban/client/.env.example`

**Description:**  
The `soroban/README.md` TypeScript Client Helper section already instructs contributors to run `cp .env.example .env`, but the file does not exist. Static analysis of the example scripts revealed that `query-config.ts` reads `process.env.CONTRACT_ID` (not `SOROBAN_CONTRACT_ID`), so both variables must be documented.

**Files to change:**
- `soroban/client/.env.example` (new file)

**Complete content:**

```dotenv
# ── Soroban Network ──────────────────────────────────────────────────────────
# Testnet: https://soroban-testnet.stellar.org
# Mainnet: https://soroban.stellar.org
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org # required
# Testnet: "Test SDF Network ; September 2015"
# Mainnet: "Public Global Stellar Network ; September 2015"
STELLAR_NETWORK_PASSPHRASE="Test SDF Network ; September 2015" # required

# ── Contract ─────────────────────────────────────────────────────────────────
# required — copy from soroban/contracts/invoice-payment/.contract-id after deployment
SOROBAN_CONTRACT_ID=CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX # required
# required — same value as SOROBAN_CONTRACT_ID; read by query-config.ts via process.env.CONTRACT_ID
CONTRACT_ID=CXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX         # required

# ── Keys ─────────────────────────────────────────────────────────────────────
# WARNING: never commit a real value
ADMIN_SECRET_KEY=SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX    # optional — required for write operations (example:record)
# optional — used for read-only operations; fallback when ADMIN_SECRET_KEY is absent
SOURCE_PUBLIC_KEY=GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX   # optional
# optional — payer address used in the example:record script; fallback to SOURCE_PUBLIC_KEY when absent
PAYER_PUBLIC_KEY=GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX    # optional

# ── Examples ─────────────────────────────────────────────────────────────────
# optional — overrides the default invoice ID in example scripts
INVOICE_ID=invoisio-demo-001 # optional
```

**Requirements addressed:** 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 5.1, 5.2, 5.3, 5.6

---

### Task 6: Update `web/README.md` with environment setup step

**Description:**  
The current `web/README.md` is the boilerplate Next.js README with no Invoisio-specific content. Replace it with a minimal but useful README that preserves the Getting Started section and adds an environment setup step before the dev server command.

**Files to change:**
- `web/README.md`

**Complete replacement content:**

```markdown
# Invoisio — Web App

The Next.js frontend for Invoisio, a privacy-first invoice platform on Stellar.

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp web/.env.example web/.env.local
```

Edit `web/.env.local` and set the required values (see `web/.env.example` for documentation of each variable).

### 3. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

The backend API must be running at the URL configured in `NEXT_PUBLIC_API_URL` (default: `http://localhost:3001`). See `backend/README.md` for backend setup.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` | URL of the Invoisio backend API |
| `NEXT_PUBLIC_USDC_ISSUER` | Testnet issuer | USDC issuer address — use testnet default for development |

Copy `web/.env.example` to `web/.env.local` for local development. Do **not** commit `.env.local`.

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Invoisio Backend README](../backend/README.md)
- [Root README](../README.md)
```

**Requirements addressed:** 2.5

---

### Task 7: Update `mobile/SMOKE_TEST_CHECKLIST.md` with environment setup step

**Description:**  
The "Before you start" section of `mobile/SMOKE_TEST_CHECKLIST.md` currently jumps straight to `npm install` without any mention of environment configuration. A contributor would fail at step 4 (starting the app) because the required env vars would be missing. Insert the env setup step as step 2 (after `npm install`), shifting existing steps down.

**Files to change:**
- `mobile/SMOKE_TEST_CHECKLIST.md`

**Change:** In the `## Before you start` section, replace:

```markdown
1. Install dependencies:
   ```bash
   cd mobile
   npm install
   ```
2. Ensure the backend/API is running and reachable with the correct mobile configuration.
```

with:

```markdown
1. Install dependencies:
   ```bash
   cd mobile
   npm install
   ```
2. Configure environment variables:
   ```bash
   cp mobile/.env.example mobile/.env
   ```
   Edit `mobile/.env` and set `REOWN_PROJECT_ID` to your project ID from [https://cloud.reown.com](https://cloud.reown.com). All other variables have safe defaults for local development.
3. Ensure the backend/API is running and reachable with the correct mobile configuration.
```

Renumber the remaining steps (old 3 → new 4, old 4 → new 5).

**Requirements addressed:** 3.5

---

### Task 8: Update `soroban/README.md` TypeScript Client Helper setup step

**Description:**  
The `soroban/README.md` TypeScript Client Helper "Setup" subsection already contains `cp .env.example .env` but references a relative path (`.env.example`) rather than the repo-relative path. Update it to `cp soroban/client/.env.example soroban/client/.env` and expand the configuration table to include the two variables discovered by static analysis (`CONTRACT_ID` and `PAYER_PUBLIC_KEY`) that are currently undocumented in the README prose.

**Files to change:**
- `soroban/README.md`

**Change 1:** In the `### Setup` subsection, replace:

```markdown
# 2. Copy and configure environment variables
cp .env.example .env
# Edit .env — fill in SOROBAN_RPC_URL, SOROBAN_CONTRACT_ID, etc.
```

with:

```markdown
# 2. Copy and configure environment variables
cp soroban/client/.env.example soroban/client/.env
# Edit soroban/client/.env — fill in SOROBAN_RPC_URL, SOROBAN_CONTRACT_ID, etc.
```

**Change 2:** In the `### Configuration (.env)` table, replace the existing 5-row table:

```markdown
| Variable | Description |
|----------|-------------|
| `SOROBAN_RPC_URL` | Soroban RPC endpoint (testnet: `https://soroban-testnet.stellar.org`) |
| `STELLAR_NETWORK_PASSPHRASE` | Network passphrase |
| `SOROBAN_CONTRACT_ID` | Deployed contract ID from `.contract-id` |
| `ADMIN_SECRET_KEY` | Admin secret key — write operations only; never commit |
| `SOURCE_PUBLIC_KEY` | Any funded public key — read-only operations |
```

with the expanded 8-row table:

```markdown
| Variable | Required | Description |
|----------|----------|-------------|
| `SOROBAN_RPC_URL` | required | Soroban RPC endpoint (testnet: `https://soroban-testnet.stellar.org`) |
| `STELLAR_NETWORK_PASSPHRASE` | required | Network passphrase |
| `SOROBAN_CONTRACT_ID` | required | Deployed contract ID from `soroban/contracts/invoice-payment/.contract-id` |
| `CONTRACT_ID` | required | Same value as `SOROBAN_CONTRACT_ID`; read by `query-config.ts` via `process.env.CONTRACT_ID` |
| `ADMIN_SECRET_KEY` | write ops | Admin secret key — **never commit a real value** |
| `SOURCE_PUBLIC_KEY` | read ops | Any funded public key — used for read-only operations |
| `PAYER_PUBLIC_KEY` | optional | Payer address used in the `example:record` script |
| `INVOICE_ID` | optional | Overrides the default invoice ID in example scripts (default: `invoisio-demo-001`) |
```

**Requirements addressed:** 4.10

---

### Task 9: Update root `README.md` with Environment Setup section

**Description:**  
The root `README.md` still references legacy directory names (`webapp/`, `smart-contracts/`) instead of the current names (`web/`, `soroban/`). It also has no unified "Environment Setup" section. Add a new `## 🔑 Environment Setup` section after the `## 🚀 Quick Start` section (which itself needs its directory references corrected), listing all four surfaces and their `.env.example` files.

**Files to change:**
- `README.md`

**Change 1:** Update the Monorepo Structure code block, replacing outdated paths:

Replace:
```markdown
```
./
├── webapp/         # Next.js 14 app (frontend UI)
├── backend/        # New Stellar-first NestJS API (invoices, payments, Soroban integration)
├── smart-contracts/ # Soroban smart contracts (Rust · stellar contract init)
│   └── contracts/
│       └── invoice-payment/   # Invoice payment tracking contract
└── legacy/         # All legacy code kept during migration
    ├── backend-legacy/ # Original backend kept as reference during migration
    └── legacy-evm/     # EVM prototype (Solidity + Hardhat)
        ├── contracts/  # Solidity PaymentRouter and related contracts
        └── hardhat/    # Hardhat project (compile/deploy EVM router)
```
```

with:
```markdown
```
./
├── web/            # Next.js frontend (browser merchants)
├── mobile/         # Expo / React Native app (iOS & Android merchants)
├── backend/        # NestJS API (invoices, payments, Stellar & Soroban integration)
└── soroban/        # Soroban smart contracts (Rust) + TypeScript client helper
    ├── contracts/
    │   └── invoice-payment/   # Invoice payment tracking contract
    └── client/                # TypeScript client library for Node.js integrations
```
```

**Change 2:** After the `## 🚀 Quick Start` section heading and prerequisites block, insert a new section:

```markdown
## 🔑 Environment Setup

Each app surface has a `.env.example` file documenting the minimum required variables. Copy it to a local env file before starting the app.

| Surface | Example file | Copy command | Per-app docs |
|---------|-------------|--------------|--------------|
| Backend | `backend/.env.example` | `cp backend/.env.example backend/.env` | [backend/README.md](backend/README.md) |
| Web | `web/.env.example` | `cp web/.env.example web/.env.local` | [web/README.md](web/README.md) |
| Mobile | `mobile/.env.example` | `cp mobile/.env.example mobile/.env` | [mobile/SMOKE_TEST_CHECKLIST.md](mobile/SMOKE_TEST_CHECKLIST.md) |
| Soroban client | `soroban/client/.env.example` | `cp soroban/client/.env.example soroban/client/.env` | [soroban/README.md](soroban/README.md) |

> **Never commit a real secret.** The example files contain only placeholder values. Keep real credentials in your local `.env` / `.env.local` files, which are git-ignored.
```

**Requirements addressed:** 5.4
