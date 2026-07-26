# Invoisio Release Runbooks

Single source of truth for building, testing, deploying, and rolling back every active surface in Invoisio. The goal is to move campaign contributions toward deployable outcomes instead of ad-hoc tribal knowledge.

---

## Active Surfaces (4)

| Surface | Directory | Stack | Primary Runbook |
|---------|-----------|-------|-----------------|
| Backend API | `backend/` | NestJS 11 + Prisma 7 + PostgreSQL 14 + Redis 7 | [BACKEND_RELEASE.md](./BACKEND_RELEASE.md) |
| Web Frontend | `web/` | Next.js 16 + React 19 + Tailwind 4 | [FRONTEND_RELEASE.md](./FRONTEND_RELEASE.md) |
| Mobile App | `mobile/` | Expo 55 + React Native 0.83 + expo-router | [MOBILE_RELEASE.md](./MOBILE_RELEASE.md) |
| Soroban Smart Contracts | `soroban/` | Rust (stable) + soroban-sdk 25 + Stellar CLI | [SOROBAN_RELEASE.md](./SOROBAN_RELEASE.md) |

Legacy surfaces (`legacy/`, `app/`, `server/`) are **not part of the active release flow**. They exist as reference material only.

---

## Standard Release Order

When releasing changes that touch multiple surfaces, follow this dependency order:

```
1. Soroban Contracts (soroban/)
   └─ rebuild TypeScript client (soroban/client) → required by backend
2. Backend API (backend/)
   └─ must be stable before frontend/mobile ship because they call it
3. Web Frontend (web/)        ← independent after backend
4. Mobile App (mobile/)       ← independent after backend
```

If a release touches **only one surface**, you can skip the others, but always re-run the surface's own pre-flight checklist.

---

## Release Artifacts Registry

Maintainers should deposit the following after every release to `docs/releases/artifacts/` (not tracked in git; use a release tag and GitHub release assets instead):

| Artifact | Surface | Where it lives in CI |
|----------|---------|----------------------|
| NestJS `dist/` bundle + `node_modules/` lockfile | Backend | `backend.yml` build step |
| Prisma migration SQL (last applied batch) | Backend | captured via `prisma migrate diff` |
| Next.js `.next/standalone` output | Frontend | `frontend.yml` build step |
| Android APK / AAB | Mobile | EAS Build (manual today — see [MOBILE_RELEASE.md](./MOBILE_RELEASE.md)) |
| iOS IPA | Mobile | EAS Build (manual today) |
| Contract WASM (`invoice_payment.wasm`) + deployed contract ID | Soroban | built by `soroban.yml`; deployed manually |
| TypeScript client bindings (`@invoisio/soroban-client` dist/) | Soroban | committed to `soroban/client/dist/` |

---

## Secrets, Network Config, and CI: Where They Matter Most

This table is the **one-stop reference** for knowing which secret/config surface impacts which release step.

### GitHub Actions Repository Secrets

| Secret Name | Used By | Purpose | Must Rotate When |
|-------------|---------|---------|------------------|
| `DATABASE_URL` / `PROD_DATABASE_URL` | Backend (release workflow) | Connect to production PostgreSQL during migration dry-run and smoke test | DB password rotates, DB host changes, or new environment is provisioned |
| `MERCHANT_PUBLIC_KEY` / `PROD_MERCHANT_PUBLIC_KEY` | Backend CI + release | Stellar receiving address; appears in invoices and Horizon matching | Merchant payout key changes, or testnet → mainnet cutover |
| `ADMIN_SECRET_KEY` / `PROD_ADMIN_SECRET_KEY` | Backend release smoke test + Soroban deploys | Signs Soroban `record_payment` transactions | Compromised, or admin transferred via `set_admin` |
| `JWT_SECRET` / `PROD_JWT_SECRET` | Backend release smoke test | Signs session tokens; forces logout if rotated | Every 90 days, or after a suspected token leak |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | Backend `.env` (not a GitHub secret) | Rate-limiter storage + throttling state | Redis instance is reprovisioned |

### Per-Surface Environment Variables (`.env` / `.env.local`)

See each per-surface runbook for the full table. Highlights:

- **Backend** → `backend/.env.example` is the canonical list. Copy it and populate all fields for dev.
- **Frontend** → No runtime secrets (Next.js public env only). Point `NEXT_PUBLIC_API_URL` at the correct backend host.
- **Mobile** → Secrets must be injected via Expo EAS secrets or `*.env*` files **never committed**. Uses `react-native-dotenv`.
- **Soroban** → `STELLAR_NETWORK=testnet|mainnet` and `INVOISIO_ADMIN_SECRET=S...` switch behavior in `deploy.sh`. Contract IDs live in `.contract-id` files per network.

### CI Workflow Triggers

| Workflow File | Trigger Paths | What It Guards |
|---------------|---------------|----------------|
| `.github/workflows/backend.yml` | `backend/**`, `.github/workflows/backend.yml` | PR + push-to-main lint, unit, e2e, build with Postgres + Redis services |
| `.github/workflows/release-backend.yml` | `release/**` branches, `v*` tags, published GitHub Releases, manual dispatch | Full pre-flight: secret validation, full test suite, migration dry-run, smoke launch on `/health` |
| `.github/workflows/frontend.yml` | `web/**`, `.github/workflows/frontend.yml` | PR + push-to-main lint, build |
| `.github/workflows/soroban.yml` | `soroban/**` (Rust files only), `.github/workflows/soroban.yml` | `cargo test` + WASM build (path filters prevent running on `soroban/client` TS changes) |

---

## Rollback Decision Matrix (Before Deploying)

Before running any deploy step, the **maintainer on duty** must know how to hit "undo." Here are the four surfaces and their rollback strategies:

| Surface | Rollback Mechanism | Downtime Risk | Estimated Time |
|---------|--------------------|---------------|----------------|
| Backend | Re-deploy previous Docker image / git revert to last release tag + `prisma migrate resolve` if schema went forward | Low (stateless; DB is the risk) | 5–15 min if image is tagged; 30–60 if reverting a bad migration |
| Frontend | `vercel rollback` (or re-deploy previous commit). Next.js output is immutable per build. | Zero (Vercel keeps previous build) | < 2 min |
| Mobile | Keep previous binary in TestFlight / Google Play track; promote older version. **Cannot instantly rollback for already-installed users.** | Medium (users on broken version until they upgrade) | 10–30 min store-side; hours for user adoption |
| Soroban Contract | Same-address WASM upgrade if the change is backward-compatible. Otherwise: **new contract address** + backend env-var flip (see [SOROBAN_RELEASE.md](./SOROBAN_RELEASE.md) § Upgrade Strategy). | Low for reads (dual-read window); Medium if a bad `record_payment` was accepted | 15–45 min depending on whether state migration is needed |

---

## Release Checklist Template (Every Release)

Copy this into the PR description (or release PR body) and check it off:

```
## Release: <VERSION / TAG>

### Affected surfaces
- [ ] Backend
- [ ] Frontend
- [ ] Mobile
- [ ] Soroban Contracts

### Pre-flight (per affected surface — see individual runbooks)
- [ ] Secrets validated present and non-placeholder
- [ ] Build succeeds locally (or on the CI branch tip)
- [ ] Unit + E2E tests green on the commit being released
- [ ] Database migration plan written (if backend) — forward + rollback SQL reviewed
- [ ] Contract upgrade path documented (if soroban) — same-address vs new address

### Deployment window
Scheduled: <date/time / UTC>
Maintainer on duty: <name>
Rollback maintainer (backup): <name>

### Post-deploy verification
- [ ] Backend `/health` returns `{ ok: true }` on the expected network (testnet / mainnet)
- [ ] Frontend loads and can hit `/invoices` via the API
- [ ] Mobile smoke test checklist passes (see `mobile/SMOKE_TEST_CHECKLIST.md`)
- [ ] Soroban `invoke-config.sh` reports expected admin + version + allowlist mode

### Rollback executed?
- [ ] No — all good
- [ ] Yes — details in #<ops-issue>
```

---

## Known Blockers and Missing Automation (Maintainers: Keep This Current)

The items below are **not blocking a manual release** but are gaps where contributors can turn ad-hoc steps into CI-automated ones.

| ID | Area | What's Missing | Impact | Effort |
|----|------|----------------|--------|--------|
| B-001 | Backend deploy | No `Dockerfile` / container image build in CI; `release-backend.yml` only validates, it does not deploy | Every deploy is a manual scp / PaaS push | Medium — add Dockerfile + deploy job to release-backend.yml |
| B-002 | Backend rollback | No automated Prisma down-migrations; only `migrate resolve` is scripted | A bad schema deploy requires hand-crafting rollback SQL | Medium — adopt `prisma migrate diff` + store down scripts |
| B-003 | Backend lint | Pre-existing lint error in `webhooks.service.ts:663` (`InputJsonValue` redundant type constituent) — exits 1 on a fresh `npm run lint` — CI currently tolerates it because the lint script also passes `--fix` which auto-fixes most other issues, leaving this one | A maintainer running lint locally on a fresh clone will see a non-zero exit and think the tree is broken | Low — fix the type annotation and consider removing `--fix` from the lint script so CI fails on ANY lint issue (see BACKEND_RELEASE.md §7 B-003 for exact details) |
| F-001 | Frontend CI | No unit / e2e test step in `frontend.yml`; only lint + build | Regressions reach Vercel before being caught | Low — add jest / playwright to frontend.yml |
| F-002 | Frontend deploy | No explicit deploy step in CI; assumed to be Vercel Git integration | Release ownership is implicit; no tagged deployment record | Low — add explicit `vercel deploy --prod` with provenance |
| M-001 | Mobile build/CI | **No GitHub Actions workflow at all** for mobile | Builds are 100% manual via `eas build` on a maintainer laptop | High — add `mobile.yml` with at least lint + typecheck + EAS Build preview |
| M-002 | Mobile release | No app signing / TestFlight / Play Store automation | Requires a maintainer with the signing keys physically present | High — EAS Secrets + Apple/Google service accounts |
| S-001 | Soroban deploy | `soroban.yml` builds and tests but never deploys or runs the invoke scripts against a testnet fixture | Contract deploys require a human with an admin key; no integration test that hits a real testnet contract | Medium — add a deploy-and-smoke-test job using a testnet-only admin identity stored in GitHub Secrets |
| S-002 | Soroban client | `@invoisio/soroban-client` is rebuilt manually (`npm run build`) and dist/ committed | If someone edits `soroban/client/src` and forgets to build, backend imports stale bindings | Low — add a CI step that runs build and checks no dist diff |
| CROSS-001 | Cross-surface | No release train / tagging convention linking backend, frontend, mobile, and contract versions together | Tracing "what was live on 2026-07-15" requires inspecting 4 separate git histories | Low — adopt a single monotonic tag (e.g. `release/2026.07.15`) and annotate it with per-surface SHAs |

---

## Further Reading by Surface

- Backend: [BACKEND_RELEASE.md](./BACKEND_RELEASE.md) — Pre-flight, build, DB migrations, deploy, smoke tests, rollback.
- Frontend: [FRONTEND_RELEASE.md](./FRONTEND_RELEASE.md) — Env, lint, build, Vercel deploy, preview vs prod.
- Mobile: [MOBILE_RELEASE.md](./MOBILE_RELEASE.md) — Dependencies, Expo EAS, signing, OTA updates, smoke checklist.
- Soroban: [SOROBAN_RELEASE.md](./SOROBAN_RELEASE.md) — Rust toolchain, WASM build, testnet/mainnet deploy, initialize, upgrade policy, event verification.
- Code references:
  - CI workflows: [backend.yml](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/.github/workflows/backend.yml), [release-backend.yml](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/.github/workflows/release-backend.yml), [frontend.yml](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/.github/workflows/frontend.yml), [soroban.yml](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/.github/workflows/soroban.yml)
  - Backend env template: [backend/.env.example](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/backend/.env.example)
  - Backend Prisma schema: [backend/prisma/schema.prisma](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/backend/prisma/schema.prisma)
