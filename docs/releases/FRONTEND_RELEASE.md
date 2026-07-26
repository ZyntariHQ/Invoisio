# Frontend Release Runbook (Next.js 16 + React 19 + Tailwind 4)

Surface: `web/` — Next.js 16 App Router frontend for Invoisio. Merchant dashboard, invoice creation, invoice detail + PDF downloads, wallet auth, Stellar payment UX.

---

## 1. Scope and Ownership

| Item | Value |
|------|-------|
| Stack | Next.js 16 (App Router), React 19, Tailwind 4, TypeScript 5, @tanstack/react-query 5, axios, lucide-react 1, qrcode.react 4 |
| Entry point | `web/app/layout.tsx`, `web/app/page.tsx` |
| Key routes | `/`, `/dashboard`, `/invoices`, `/invoices/[id]`, `/create`, `/payment`, `/preview` |
| CI workflow | `.github/workflows/frontend.yml` (PR + push-to-main) |
| Deploy target (today) | Assumed Vercel via Git integration — no explicit deploy step in CI (blocker F-002) |
| Owner / maintainer group | Frontend maintainers |

Code references:
- [web/package.json](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/web/package.json)
- [web/next.config.ts](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/web/next.config.ts#L1-L7)

---

## 2. Environment Variables and Config

### Public (sent to browser) — Use `NEXT_PUBLIC_*` prefix

| Variable | Example / Default | Purpose |
|----------|-------------------|---------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` (dev) / `https://api.invoisio.com` (prod) | Base URL for backend API calls |
| `NEXT_PUBLIC_STELLAR_NETWORK` | `testnet` or `mainnet` | Wallet connection hint; used when generating SEP-0007 links |
| `NEXT_PUBLIC_APP_NAME` | `Invoisio` | Branding |

### Server-side only (no `NEXT_PUBLIC_` prefix)

Next.js Server Components / Route Handlers can read these — they never reach the browser:

| Variable | Purpose |
|----------|---------|
| — | (Currently none — all backend calls are done from the browser. If Server Components are added later, add server-side API tokens here.) |

### Next.js config

Current config ([web/next.config.ts](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/web/next.config.ts#L1-L7)) is the default empty object. Before production release, consider adding:

- `output: 'standalone'` if deploying to a container instead of Vercel.
- `images.remotePatterns` for any third-party logo hosts.
- `async headers()` for CSP / security headers.

---

## 3. Pre-flight Checklist (Before Every Release)

Run on the exact commit SHA being released.

1. **Backend availability**: Confirm the backend pointed at by `NEXT_PUBLIC_API_URL` is already running and healthy. If releasing backend + frontend together, deploy backend FIRST (see top-level runbook release order), then do frontend smoke.
2. **Install**
   ```bash
   cd web
   npm ci   # or npm install for local
   ```
3. **Lint**
   ```bash
   npm run lint
   ```
4. **Typecheck** — there's no explicit `typecheck` script today (gap; see Blocker F-001). Run manually:
   ```bash
   npx tsc --noEmit
   ```
5. **Unit / e2e tests** — **BLOCKER F-001**: project does not currently define any frontend test scripts or test framework in `web/package.json`. A release MUST rely on manual QA or locally-added playwright/jest. For the interim:
   - Run the dev server locally and exercise the smoke checklist in §5 below.
6. **Production build locally**
   ```bash
   npm run build
   ```
   Produces `.next/` build artifacts. On Vercel this step is performed automatically at deploy time, but running it locally catches:
   - Broken `import`s that don't error until bundling
   - Static generation failures (applies if we add `generateStaticParams` later)
   - Excessive bundle size spikes

---

## 4. Release Workflow Step-by-Step

### Step 1: Merge + CI green

- Open PR, ensure [frontend.yml](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/.github/workflows/frontend.yml) is green:
  - Node 20
  - `npm ci`
  - `npm run lint`
  - `npm run build`

### Step 2: Deploy to Preview (Vercel default behavior)

- Vercel (if integrated) auto-deploys every PR to a preview URL.
- **If not using Vercel Git integration** (blocker F-002):
  ```bash
  npm i -g vercel   # one-time
  vercel            # one-time: login + link project
  # Per-PR preview:
  vercel            # deploys preview; returns a URL
  ```

### Step 3: Deploy to Production

- Via Vercel dashboard: promote the preview build to prod.
- Via CLI (preferred for audit trail / provenance — blocker F-002 can be resolved by adding this to CI):
  ```bash
  # From the exact commit SHA
  cd web
  vercel --prod --yes
  # Record the deployment URL + timestamp in the release PR
  ```
  The `--yes` skips interactive prompts; suitable for scripting in a future `frontend.yml` deploy job.

### Step 4: Invalidate / warm caches

- Next.js ISR / full route cache. Not currently enabled (no `revalidate` anywhere). Nothing to do.
- If Vercel Edge Network / CDN sits in front: no explicit purge needed for new deployments — Vercel atomicallly swaps the new build in.

---

## 5. Post-deploy Smoke Verification

Run these against the production frontend URL. They can be done manually, or (ideally) added as a Playwright suite and wired into CI (blocker F-001).

| # | Flow | Steps | Expected |
|---|------|-------|----------|
| 1 | Home page loads | Visit `/` | No 500; hero section, CTA buttons rendered. |
| 2 | Navigation to invoices | Click dashboard / invoices links or go to `/invoices` | Page renders; if authenticated invoice list loads or prompts to connect wallet. |
| 3 | Invoice detail page | Open `/invoices/<id>` for an existing paid invoice | Amount, client, due date, status display correctly. |
| 4 | PDF download (paid invoice) | On the detail page of a PAID invoice, click "Download Receipt" or hit `GET /invoices/:id/receipt` from the UI | Returns a PDF (`Content-Type: application/pdf`). **Hard constraint from project memory: this endpoint MUST 403 for unpaid invoices.** |
| 5 | PDF download (unpaid invoice) | Try the receipt endpoint for a `pending` or `overdue` invoice | 403 Forbidden (no PDF) — see top-level [project_memory.md](file:///c:/Users/lyric/.trae/memory/projects/-c-Users-lyric-Downloads-GrantFOX-Invoisio/project_memory.md) Hard Constraints. |
| 6 | Wallet connect | Click "Connect Wallet" or "Sign In" | Freighter / SEP-0007 flow starts without console errors. |
| 7 | Payment link generation | On an unpaid invoice, click "Pay Invoice" | Generates a valid `web+stellar:pay?...` link with the correct memo + amount. |
| 8 | CORS sanity | Browser DevTools → Network; make an API call | No `CORS error` in Console; backend responses include the frontend origin in `Access-Control-Allow-Origin`. |
| 9 | Mobile responsive | DevTools device mode → iPhone 15 / Pixel 8 widths | Layout doesn't overflow horizontally; tables and action buttons stay usable or collapse to icon-only buttons (per user profile preference). |

---

## 6. Rollback

Vercel keeps every deployment immutable. To roll back:

### Fast path (preferred — < 2 minutes)

1. Go to Vercel Dashboard → Your Project → Deployments.
2. Find the last known-good deployment (the one you promoted before this release).
3. Click **⋮ → Promote to Production**.

Vercel swaps production traffic over instantly with zero downtime.

### CLI equivalent

```bash
# List recent deployments
vercel ls --prod

# Rollback to a specific deployment URL
vercel promote <deployment-url-from-previous-release> --prod
```

### If not on Vercel (e.g. self-hosted Next.js standalone)

- Keep the previous build's `.next/standalone` tarball + `node_modules`.
- Restore the previous artifact to the server and restart the Node process.
- A blue/green setup with a load balancer is strongly recommended for zero-downtime.

---

## 7. Known Blockers and Missing Automation

| ID | Title | Impact | How to Unblock |
|----|-------|--------|----------------|
| F-001 | No frontend test scripts or framework defined in `web/package.json` | Every release relies entirely on manual QA; regressions ship undetected | Add Jest (unit) + Playwright (e2e). Add `test`, `test:e2e` scripts to package.json; add Playwright install step to `frontend.yml`. |
| F-002 | No explicit deploy step in CI; assumed Vercel Git integration | No auditable "who deployed when" record tied to a commit SHA; provenance unclear | Add a final `deploy` job to `frontend.yml` that runs on `main` push + tagged releases, uses `vercel --prod --yes --token=$VERCEL_TOKEN`, and stores the deployment URL as a CI artifact. Add `VERCEL_TOKEN` to repository secrets. |
| F-003 | No build output config (`output: 'standalone'`) | If ever moving from Vercel to containers, build artifact is not minimal; harder to rollback deterministically | Add `output: 'standalone'` to `next.config.ts`; test container build locally. |
| F-004 | No security headers / CSP defined | Clickjacking, XSS surface area unnecessarily large | Add `async headers()` in `next.config.ts` returning strict CSP, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy. |
| F-005 | No explicit `.env.example` for `web/` | New contributors must guess `NEXT_PUBLIC_API_URL` etc. by reading code | Add `web/.env.example` mirroring §2 of this runbook; document each var in-line. |

---

## 8. Code References for Maintainers

| Topic | File |
|-------|------|
| CI workflow (lint + build) | [.github/workflows/frontend.yml](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/.github/workflows/frontend.yml) |
| package.json scripts | [web/package.json](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/web/package.json) |
| Next.js config | [web/next.config.ts](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/web/next.config.ts) |
| Backend API integration (likely) | Grep `web/app` and `web/components` for `axios` or `fetch` calls — follow those URLs back to the backend runbook. |
| Invoice pages | `web/app/invoices/page.tsx`, `web/app/invoices/[id]/page.tsx` (check frontend directory for current exact filenames). |
