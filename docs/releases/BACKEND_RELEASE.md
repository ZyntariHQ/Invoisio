# Backend Release Runbook (NestJS + Prisma + PostgreSQL + Redis)

Surface: `backend/` — NestJS 11 REST API for Invoisio invoices, payments, webhooks, Stellar/Soroban integration, and admin operations.

---

## 1. Scope and Ownership

| Item | Value |
|------|-------|
| Stack | NestJS 11, TypeScript 5.7, Prisma 7 (PostgreSQL 14), ioredis (Redis 7), Jest 29, Supertest |
| Entry point | `backend/src/main.ts` |
| Health endpoint | `GET /health` (returns `{ ok, version, network, timestamp }`) |
| CI workflow | `.github/workflows/backend.yml` (PR / push-to-main) |
| Release pre-flight CI | `.github/workflows/release-backend.yml` (tags, release branches, manual dispatch) |
| Owner / maintainer group | Backend maintainers |
| Deploy target (today) | **BLOCKER B-001**: No automated deploy. Assumed target: container / PaaS. Maintainer pushes manually from tagged commit. |

---

## 2. Environment Variables (Complete, Fail-Fast)

Canonical source of truth: [backend/.env.example](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/backend/.env.example). Copy to `backend/.env` and **do not commit it**. The application does NOT validate all required vars on boot today — this is a gap; see Blockers § at the end.

### Required — MUST be set for production

| Variable | Example (testnet placeholder) | Purpose | Rotation Triggers |
|----------|--------------------------------|---------|-------------------|
| `DATABASE_URL` | `postgresql://user:pass@host:5432/invoisio?schema=public` | Prisma DB connection | DB credential rotation, host migration |
| `JWT_SECRET` | `>= 32 bytes of CSPRNG` | Signs session tokens; leaked secret = account takeover | Every 90 days, or after suspected compromise |
| `MERCHANT_PUBLIC_KEY` | `G...` (Stellar public address) | Destination for all invoice payments + Horizon watcher filter | Merchant payout key change, testnet → mainnet cutover |
| `HORIZON_URL` | Testnet: `https://horizon-testnet.stellar.org`; Mainnet: `https://horizon.stellar.org` | Stellar Horizon API endpoint | Network cutover |
| `STELLAR_NETWORK_PASSPHRASE` | Testnet: `Test SDF Network ; September 2015`; Mainnet: `Public Global Stellar Network ; September 2015` | Signs Stellar transactions; **wrong value = signature failures** | Network cutover |
| `SOROBAN_RPC_URL` | Testnet: `https://soroban-testnet.stellar.org` | Soroban RPC for contract reads/writes | Network cutover |
| `SOROBAN_CONTRACT_ID` | `C...` (from `soroban/contracts/invoice-payment/.contract-id`) | On-chain payment record contract | New contract deploy (v1 → v2) |
| `ADMIN_SECRET_KEY` | `S...` (Stellar secret; the `admin` of the Soroban contract) | Signs `record_payment` on-chain txns. **Never log, never commit.** | Compromise, or after a `set_admin` |
| `REDIS_HOST` / `PORT` / `PASSWORD` / `DB` | `localhost`, `6379`, (empty), `0` | Rate-limiting storage (throttler module). Without Redis: rate limits fall back to in-memory and break multi-instance. | Redis reprovision |
| `CORS_ORIGIN` | `https://app.invoisio.com` | Frontend allowed origin | New frontend domain |

### Optional

| Variable | Default | Purpose |
|----------|---------|---------|
| `PORT` | `3001` | HTTP listen port |
| `USDC_ISSUER` | `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN` | Circle USDC issuer on Stellar |
| `USDC_ASSET_CODE` | `USDC` | Asset code for default token option |
| `MEMO_PREFIX` | `invoisio-` | Prefix prepended to invoice memo for Horizon matching |
| `HORIZON_POLL_INTERVAL` | `15000` (ms) | How often the payment watcher polls Horizon for new payments |
| `THROTTLE_TTL` / `THROTTLE_LIMIT` | `60` / `100` | General rate limit default |
| `THROTTLE_AUTH_TTL` / `LIMIT` | `900` / `5` | Auth endpoint anti-bruteforce |
| `THROTTLE_INVOICE_TTL` / `LIMIT` | `3600` / `20` | Per-user invoice creation rate limit |

Code references:
- [app.config.ts](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/backend/src/config/app.config.ts#L1-L11)
- [stellar.config.ts](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/backend/src/config/stellar.config.ts#L1-L30)
- [throttler.config.ts](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/backend/src/config/throttler.config.ts#L1-L28)

---

## 3. Pre-flight Checklist (Before Every Release)

Run through this on the exact commit SHA you plan to tag.

1. **Secrets presence**
   - Run the release pre-flight workflow OR manually check that every required secret in §2 is non-empty and not the `placeholder` / `CXXX...` / `SXXX...` dummy values from `.env.example`.
   - The release workflow has a "Validate Required Secrets" bash step in [release-backend.yml](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/.github/workflows/release-backend.yml#L50-L77) that bails out if `DATABASE_URL`, `MERCHANT_PUBLIC_KEY`, `ADMIN_SECRET_KEY`, or `JWT_SECRET` are missing. Copy-paste that logic into your environment.
2. **Soroban client is up-to-date**
   - If the release includes any `soroban/client/src/**` change: `cd soroban/client && npm run build` and commit the new `dist/` before cutting the release. A stale client = backend uses ABI-mismatched bindings.
3. **Database migration plan**
   - Compare `backend/prisma/migrations/` on your branch vs the last production release tag.
   - If there are new migrations:
     - Write forward SQL (`prisma migrate deploy` will do this automatically).
     - Hand-craft rollback SQL. Prisma only stores "up" migrations — **down is your responsibility** (blocker B-002).
     - Ensure no migration runs `DROP TABLE`, `ALTER COLUMN ... DROP NOT NULL` without a second review.
4. **Lint + format**
   ```bash
   cd backend
   npm run lint
   npx prettier --check "src/**/*.ts" "test/**/*.ts"
   ```
5. **Generate Prisma client** — required before tests AND build (it's in `prebuild` too, but run it explicitly in pre-flight):
   ```bash
   npx prisma generate
   ```
6. **Unit tests (Jest)**
   ```bash
   # Requires PostgreSQL reachable at $DATABASE_URL
   npm run test
   ```
7. **E2E tests (Jest + Supertest)**
   ```bash
   npm run test:e2e
   ```
   The E2E config is [backend/test/jest-e2e.json](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/backend/test/jest-e2e.json); it spins up a real NestJS app and hits it with Supertest.
8. **Build**
   ```bash
   npm run build
   ```
   Produces `backend/dist/main.js` + chunks.

---

## 4. Release Workflow Step-by-Step (PR → Tag → Deploy)

### Step 1: Open the release PR / merge train

- Merge your feature into `main` via a normal PR. Ensure the Backend CI (`.github/workflows/backend.yml`) is **green**. CI runs against:
  - PostgreSQL 14-alpine service container
  - Redis 7-alpine service container
  - Node 20.x
  - Steps: install → prisma generate → migrate deploy → lint → format → unit tests → e2e → build → coverage artifact

### Step 2: Cut a release branch (optional, for backportable releases)

```bash
git checkout main
git pull
git checkout -b release/v2026.07.1
# Apply any release-only hotfixes here, then:
git push -u origin release/v2026.07.1
```

Pushing a `release/**` branch automatically triggers the [release-backend.yml](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/.github/workflows/release-backend.yml) pre-flight, which does:

1. Secret validation (§3.1)
2. Lint + format
3. Full unit test suite
4. Full E2E test suite
5. Build
6. `prisma migrate status` + `prisma migrate deploy` against the test DB (a dry-run of migration logic)
7. **Smoke verification**: starts the built app with `npm run start:prod`, polls `/health` for 30 seconds, kills it

If this workflow fails, **do not proceed**. Fix the branch and re-push.

### Step 3: Tag a release

Recommended tag format (semver-style, but per the top-level runbook, a date-based train tag is also fine):

```bash
git tag -a v0.1.0 -m "Release v0.1.0: <summary>"
git push origin v0.1.0
```

Pushing a `v*` tag triggers the same pre-flight workflow again.

### Step 4: Deploy to production (manual today — blocker B-001)

On your deploy target (Docker / VM / PaaS):

```bash
# 1. Checkout the EXACT tagged commit
git fetch --tags
git checkout v0.1.0

# 2. Install production deps
cd backend
npm ci --omit=dev

# 3. Generate Prisma client (safe even in prod; it's codegen)
npx prisma generate

# 4. RUN MIGRATIONS BEFORE STARTING THE APP — this is critical.
#    If you deploy app code that expects a schema column and the DB doesn't have it, every request 500s.
npx prisma migrate deploy

# 5. Start the app
export NODE_ENV=production
node dist/main.js
# or via process manager:
# pm2 start dist/main.js --name invoisio-backend
```

Zero-downtime variant (recommended once you have ≥2 instances behind a load balancer):

- Deploy + run migrations on a canary instance.
- Verify `/health` returns the new version on canary.
- Gradually shift traffic.
- Decommission old instances only when canary has served real traffic for ≥ 1 full Horizon poll cycle (~15s minimum).

---

## 5. Post-deploy Smoke Verification

Do these checks from outside the production network (e.g. your laptop, or a synthetic monitoring job).

| # | Check | Command / URL | Expected Result |
|---|-------|---------------|-----------------|
| 1 | Health | `GET /health` | `{ "ok": true, "version": "0.0.1", "network": "mainnet" or "testnet", "timestamp": ... }` |
| 2 | CORS | Send an OPTIONS request with `Origin: <your frontend>` from a browser/Postman | Response includes `Access-Control-Allow-Origin: <frontend>`, `Access-Control-Allow-Credentials: true` |
| 3 | Invoice create | Authenticated `POST /invoices` with a valid payload | Returns 201 with `memo` = `MEMO_PREFIX + <uuid>` |
| 4 | Invoice list | Authenticated `GET /invoices` | Returns 200 with a JSON array |
| 5 | PDF download (paid invoice only) | `GET /invoices/:id/receipt` | HTTP 200 with `Content-Type: application/pdf`; stable filename per PRD |
| 6 | Rate limiter | 101 rapid anonymous requests from the same IP | 100th succeeds, 101st returns 429 |
| 7 | Stellar network sanity | Check `network` field in `/health` response | Matches the intended environment (not "testnet" when you meant production) |
| 8 | Horizon / Soroban connectivity (staging) | Check logs for errors after first payment event poll; call a Soroban read via backend | No `ContractError`, no Horizon timeouts. |

---

## 6. Rollback

Rollback priority order: **stop application traffic → restore DB schema to prior state → restore code → smoke test.**

### 6.1 Code-only rollback (no schema changes in the bad release)

Fastest and lowest risk. Applies when the release has new Prisma migrations that were never run in prod (or migrations were purely additive and remain valid).

```bash
# On the deploy target:
git fetch --tags
git checkout v0.0.9    # last known-good tag

cd backend
npm ci --omit=dev
npx prisma generate
# DO NOT run prisma migrate deploy this time — we want to keep the schema as-is.
export NODE_ENV=production
node dist/main.js
```

Immediately after: run the post-deploy smoke checks (§5) on the rollback target.

### 6.2 Schema rollback (migrations ran AND are the problem)

This is the **riskiest case**. DO NOT run this playbook without reviewing the actual SQL.

1. **Take the app offline** (stop all instances, or flip the load balancer to "maintenance page") so no new writes hit a partially-migrated DB.
2. **Take a DB snapshot** (PG base backup / `pg_dump --schema-only --data-only`) — legal requirement before destructive schema changes in many orgs; common sense here regardless.
3. **Manually apply the hand-crafted rollback SQL** (the one you wrote in pre-flight §3.3). For example, if the bad migration added a `NOT NULL` column that broke inserts, the rollback is either `ALTER COLUMN ... DROP NOT NULL` or `ALTER TABLE ... DROP COLUMN ...` depending on which direction you want to go.
4. **Verify DB consistency** — at minimum:
   ```sql
   SELECT COUNT(*) FROM invoices;
   SELECT COUNT(*) FROM webhook_attempts;
   -- spot-check recent rows to ensure no data loss or corruption occurred
   ```
5. **Deploy the last known-good code tag** (same as 6.1).
6. **Bring traffic back on one instance first**, watch error logs for 5 min, then all instances.

### 6.3 "Red" deploy went live (data loss or 500% error rate)

Escalate immediately:
- Page on-call maintainers listed in the release PR.
- Do not debug in production. If §6.2 doesn't work on the first attempt, restore the most recent DB backup that precedes the bad deploy and accept bounded data loss (document the loss window publicly in the postmortem).
- Write the postmortem within 48 hours.

---

## 7. Known Blockers, Pre-existing Issues, and Missing Automation

| ID | Title | Impact / Observed State | How to Unblock |
|----|-------|-------------------------|----------------|
| B-001 | **No automated deploy** in release-backend.yml | `release-backend.yml` does lint + test + smoke but never actually deploys. Every deploy is a manual `node dist/main.js` on a maintainer's target. | Add a `deploy` job to `release-backend.yml`: build Docker image → push to registry → deploy to target (K8s / ECS / PaaS). Requires a `Dockerfile` (missing today). |
| B-002 | No automated Prisma down-migrations | `prisma migrate dev` writes "up" only. Rollback SQL is hand-written per migration. Risk of DB schema rollback errors. | Adopt a migration workflow that stores down-scripts OR document that breaking schema releases MUST deploy a "forward-only" intermediate release first (e.g. add column nullable → ship code → then make it NOT NULL in next release). |
| B-003 | **Pre-existing lint error in webhooks.service.ts** (observed 2026-07-26) | `npm run lint` on a clean tree returns: `src/webhooks/webhooks.service.ts:663:6  error  'InputJsonValue' is an 'error' type that acts as 'any' … @typescript-eslint/no-redundant-type-constituents`. CI's backend.yml passes today because `npm run lint` has `--fix` and CI tolerates the remaining error; but on a fresh clone the lint command **exits 1**. | Fix the type annotation on line 663 of webhooks.service.ts (replace the `InputJsonValue` constituent or cast to a narrower valid type) and run `npm run lint` until it exits 0 cleanly. Consider removing `--fix` from the package.json lint script so CI fails on *any* lint issue. |
| B-004 | No boot-time env-var validation | The app starts up and serves traffic even when `DATABASE_URL` / `JWT_SECRET` / `MERCHANT_PUBLIC_KEY` are the `.env.example` placeholder values. Causes silent runtime failures and confusing errors. | Add a `ConfigModule.forRoot({ validate: Joi validation schema })` (Joi is already a dependency — see package.json) and fail-fast (throw on bootstrap) if required vars are missing or still equal to their placeholder strings. |
| B-005 | No `--check` equivalent for formatting in package scripts | `backend.yml` runs `npx prettier --check` separately but the `package.json` `format` script only writes. Contributors can miss format regressions locally. | Add a `"format:check": "prettier --check \"src/**/*.ts\" \"test/**/*.ts\""` script and run it in pre-flight §3.4. |
| B-006 | `DATABASE_URL` in backend.yml CI points to `localhost` but local developer env defaults to the same — easy to accidentally run tests against a real dev DB. | If a dev forgets to override `.env`, unit tests run against `invoisio_db` on localhost. | Document in §2 and §3 that local dev should use a separate DB name (e.g. `invoisio_test`) for test runs, or force the test script to override DATABASE_URL via `cross-env` (already in devDependencies). |

---

## 8. Code References for Maintainers

| Topic | File |
|-------|------|
| PR / push-to-main CI (Postgres + Redis services) | [.github/workflows/backend.yml](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/.github/workflows/backend.yml) |
| Release pre-flight CI (tags, release branches — secret validation + smoke) | [.github/workflows/release-backend.yml](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/.github/workflows/release-backend.yml) |
| Package scripts (build, test, prisma, lint, backfill) | [backend/package.json](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/backend/package.json) |
| Env template (all required + optional vars) | [backend/.env.example](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/backend/.env.example) |
| Prisma schema (all tables, enums) | [backend/prisma/schema.prisma](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/backend/prisma/schema.prisma) |
| App entry / CORS / global validation pipe | [backend/src/main.ts](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/backend/src/main.ts) |
| Config loaders (app / stellar / throttler) | [backend/src/config/app.config.ts](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/backend/src/config/app.config.ts), [stellar.config.ts](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/backend/src/config/stellar.config.ts), [throttler.config.ts](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/backend/src/config/throttler.config.ts) |
| Health endpoint | [backend/src/health/health.controller.ts](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/backend/src/health/health.controller.ts) |
| Invoice service (webhook dependency) | [backend/src/invoices/invoices.service.ts](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/backend/src/invoices/invoices.service.ts) |
| Webhook service + dead-letter queue + attempt history | [backend/src/webhooks/webhooks.service.ts](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/backend/src/webhooks/webhooks.service.ts) |
| PDF generation (invoice + paid receipt) | [backend/src/invoices/invoice-pdf.service.ts](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/backend/src/invoices/invoice-pdf.service.ts) |
| Soroban service (consumes `@invoisio/soroban-client`) | `backend/src/soroban/` module + `backend/src/stellar/soroban.service.ts` |
| Backfill CLI (payment reconciliation backfiller) | [backend/scripts/backfill-cli.ts](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/backend/scripts/backfill-cli.ts); scripts: `backfill`, `backfill:reconcile`, `backfill:from-last`, `backfill:report`, `backfill:stats` |
| Jest E2E config | [backend/test/jest-e2e.json](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/backend/test/jest-e2e.json) |

[truncated by convert_data_to_sft: original content length=16255 chars for checker-safe SFT export]
