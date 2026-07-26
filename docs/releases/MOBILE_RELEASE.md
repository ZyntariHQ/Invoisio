# Mobile Release Runbook (Expo 55 + React Native 0.83)

Surface: `mobile/` — Expo SDK 55 / React Native 0.83 cross-platform mobile app. Merchant-focused invoice management: create, list, detail, share, scan-to-pay QR. Uses expo-router for file-based navigation.

---

## 1. Scope and Ownership

| Item | Value |
|------|-------|
| Stack | Expo SDK 55, React Native 0.83, React 19, expo-router 55, NativeWind 4, Zustand 5, @tanstack/react-query 5, @stellar/stellar-sdk 14, @reown/appkit-react-native 2 |
| Platforms | iOS, Android, Web (via `react-native-web`) |
| Entry | `mobile/index.ts` → `expo-router/entry` |
| Routes | `app/login`, `app/index` (dashboard), `app/invoices/[id]`, `app/create-invoice`, `app/scan`, `app/settings` |
| Bundle IDs | iOS: `com.invoisio.mobile`; Android: `com.invoisio.mobile` |
| App scheme | `invoisio://` (for deep linking back from wallets) |
| CI workflow | **BLOCKER M-001**: No GitHub Actions workflow exists today |
| Build tool | Expo EAS Build (expected), or `npx expo run:android/ios` locally |
| Owner / maintainer group | Mobile maintainers |

Code references:
- [mobile/package.json](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/mobile/package.json)
- [mobile/app.json](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/mobile/app.json#L1-L48)
- Manual smoke checklist: [mobile/SMOKE_TEST_CHECKLIST.md](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/mobile/SMOKE_TEST_CHECKLIST.md)

---

## 2. Environment Variables and Secrets

Mobile secrets are **never committed**. Use one of the following two approaches:

### Option A — `*.env*` files (local only)

The mobile project uses `react-native-dotenv` (in devDependencies — see [mobile/package.json](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/mobile/package.json#L51)). Create:

```
mobile/.env.development
mobile/.env.staging
mobile/.env.production
```

Expected shape (add keys as the app uses them; update this runbook when you add more):

| Key | Example dev value | Purpose | Prod value |
|-----|-------------------|---------|------------|
| `API_URL` | `http://10.0.2.2:3001` (Android emulator) or `http://localhost:3001` (iOS sim) | Backend API base URL | `https://api.invoisio.com` |
| `STELLAR_NETWORK` | `testnet` | Which Horizon/RPC to use + SEP-0007 link generation | `mainnet` for production builds |
| `EXPO_PUBLIC_PROJECT_ID` (Reown) | From Reown dashboard | WalletConnect / Reown AppKit project ID | Production project ID |

**Never commit real prod values.** Add `.env*` to the mobile `.gitignore` if it's not already there.

### Option B — Expo EAS Secrets (preferred for CI/CD + store builds)

```bash
# one-time setup per secret per environment
cd mobile
eas secret:create --scope project --name API_URL --value https://api.invoisio.com --type string
eas secret:create --scope project --name STELLAR_NETWORK --value mainnet --type string
# etc.
```

---

## 3. Prerequisites (On a Maintainer's Machine)

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 20 LTS | `nvm install 20` |
| npm / pnpm | latest bundled with Node 20 | — |
| Expo CLI | SDK 55 compatible (bundled via `npx expo`) | `npm i -g eas-cli` (for EAS Build) |
| Android Studio + SDK | latest | https://developer.android.com/studio — required for `expo run:android` and production AAB signing |
| Xcode | 15+ (latest) | macOS App Store — required for `expo run:ios` and production IPA signing |
| Apple Developer account | Paid | Required for TestFlight + App Store |
| Google Play Developer account | Paid | Required for Play Console publishing |
| EAS account + project linked | — | `eas login` + `eas init` if not already linked |

Signing keys:
- **Android upload keystore** (`invoisio-mobile.keystore`) — store in a password manager or EAS Credentials Manager.
- **iOS Distribution Certificate + Provisioning Profile** — either managed by you locally, or delegated to Expo EAS (recommended).

---

## 4. Pre-flight Checklist (Before Every Release)

1. **Backend is healthy** — the mobile app is a pure client. Before building a mobile release:
   - `GET $API_URL/health` must return `{ ok: true }`.
   - Backend CORS allows the mobile user-agent / origin (if running web builds).
2. **Install dependencies cleanly**
   ```bash
   cd mobile
   rm -rf node_modules package-lock.json   # PowerShell: Remove-Item -Recurse -Force node_modules, package-lock.json
   npm ci
   ```
3. **Typecheck**
   ```bash
   npm run typecheck
   ```
4. **Lint**
   ```bash
   npm run lint
   ```
5. **Format check** — `format` script writes; to check only, run:
   ```bash
   npx prettier --check .
   ```
6. **Run the manual smoke test checklist** defined in [mobile/SMOKE_TEST_CHECKLIST.md](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/mobile/SMOKE_TEST_CHECKLIST.md). This is the regression gate today (blocker M-001 / no CI). Mandatory items:
   - [ ] Login / auth flow
   - [ ] Invoice list (with valid empty-state or data)
   - [ ] Invoice detail (all fields, pay action if applicable)
   - [ ] Create invoice (validation + creation success)
   - [ ] Share invoice (native share sheet, content correct)
   - [ ] Android-specific: system back, share sheet, keyboard behavior
   - [ ] iOS-specific: navigation gestures, keyboard, share sheet
7. **Deep link test**
   - `invoisio://invoices/<id>` → should open invoice detail
   - Associated domains: `https://invoisio.com/invoices/<id>` → should open in-app (Apple AASA / Android assetlinks.json must be deployed on the web domain; this is an ops prerequisite before production release).

---

## 5. Release Workflow Step-by-Step

There are two release cadences: **OTA (Over-The-Air, instant, no store review)** and **Store (binary, requires App Store + Google Play review)**. Most small bug fixes can ship OTA. Major releases or native dependency bumps require a store release.

### 5.1 OTA Patch Release (Expo Updates)

Use this for: bug fixes in JS-only code, copy changes, UI tweaks, minor logic fixes. This is the fastest path.

```bash
cd mobile

# 1. Verify you're on the release commit
git status
git log -1

# 2. Decide the channel: preview / production
# (EAS channel names should map to your env: production, preview, development)

# 3. Publish an OTA update to the target channel
eas update --branch main --message "fix: invoice PDF button on iOS; refs v1.0.1"
# OR if using release branches:
# eas update --branch release/v1.0 --message "..."

# 4. Record the update group ID from the output. It looks like:
#    "Published update group: 45d7f28c-..."
#    Write this in the release PR so rollback can target it.
```

**Verify OTA applied:**
- Open the app on a device that has the matching native binary.
- Bring app to foreground; wait a few seconds for update check.
- Close the app fully (swipe away).
- Open again — the app should run the new bundle.
- If the update is marked "critical" (configured in `app.json`), app forces restart.

### 5.2 Store Release (New Binary)

Required when: any native module changes, Expo SDK bump, new permissions, new native code, app.json changes that require rebuilding.

#### Step A — Bump versions

Edit [mobile/app.json](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/mobile/app.json):

```json
{
  "expo": {
    "version": "1.0.1",                // user-facing semver
    "ios": {
      "buildNumber": "2",              // monotonically increasing integer
      "bundleIdentifier": "com.invoisio.mobile"
    },
    "android": {
      "versionCode": 2,                // monotonically increasing integer
      "package": "com.invoisio.mobile"
    }
  }
}
```

Rules:
- `version` = user-facing (shown in App Store / Play Store).
- `ios.buildNumber` = **per-upload** integer, must be strictly higher than the last upload for the same `version`.
- `android.versionCode` = **per-upload** integer, same rule.
- Typical convention: bump `version` for a store release, reset buildNumber/versionCode to 1 for that new `version`; if you re-upload because Apple rejected it, keep `version` and increment buildNumber/versionCode.

Commit the version bump as its own commit with a tag:

```bash
git add mobile/app.json
git commit -m "release(mobile): v1.0.1 (build 2)"
git tag mobile-v1.0.1
git push --follow-tags
```

#### Step B — EAS Build

If you have not set up EAS config yet, do the one-time init:

```bash
cd mobile
eas build:configure
# This generates eas.json with profiles. Typical profiles:
#   preview: ad-hoc / internal testing
#   production: App Store / Play Store signing
```

Then build for each platform:

```bash
# Android: AAB for Play Store (production profile)
eas build --platform android --profile production

# iOS: IPA for App Store (production profile)
eas build --platform ios --profile production

# Or both in one command:
eas build --platform all --profile production
```

What happens in EAS Build:
1. Expo spins up a cloud builder.
2. Installs deps, prebuilds native projects.
3. Signs the binary using credentials (from EAS Credentials Manager or locally configured).
4. Returns a download link + auto-submits to stores if configured (`eas submit`).

#### Step C — Submit to App Store Connect + Google Play

Automatic (preferred; add to `eas.json` submit profiles):

```bash
eas submit --platform ios     # Uploads IPA to App Store Connect; requires ASC API key in secrets
eas submit --platform android # Uploads AAB to Play Console; requires service account JSON in secrets
```

Manual:
- Download the IPA / AAB from the EAS build output.
- Use **Transporter** app (macOS) or Xcode → Organizer → Distribute for iOS.
- Use **Play Console → Create new release → Upload AAB** for Android.

#### Step D — Rollout strategy

Both App Store and Play let you do phased rollouts:
- **App Store Connect → Phased Release for Automatic Updates**: 1% → 2% → 5% → 10% → 20% → 50% → 100% over 7 days, pausing on crash spikes.
- **Google Play Console → Release → Production track → Managed Google Play**: Same phased release concept.
- **Recommendation**: pause at 10% for 24 hours and watch crash rate, web vitals (if using Sentry/Expo Insights), and backend error rate before advancing phases.

---

## 6. Rollback

Mobile rollback is the **riskiest rollback of all 4 surfaces** because:
- Users who installed the bad version will **not automatically downgrade**.
- App stores do not allow "downgrading" a published release — you can only publish a NEWER version number that reverts changes.
- OTA updates (Expo) ARE instant rollbacks for JS-only bugs on devices that already have a compatible native binary.

### Rollback scenario 1: JS-only bug, bad OTA already published

```bash
cd mobile
# Find the last known-good update group ID from your release notes
# Publish an update that is the same code as before
git checkout mobile-v1.0.0  # or whatever the last good tag was
eas update --branch main --message "rollback: revert broken v1.0.1 OTA; restore v1.0.0 behavior"
# Any device currently running the native v1.0.x binary will pick this up on next app foreground.
```

### Rollback scenario 2: Native binary bug (store release)

This is **costly and slow**. Do not ship a native binary until you are confident:

1. Revert the offending commits locally and land on `main`.
2. Bump `ios.buildNumber` / `android.versionCode` + `version` (e.g. `1.0.2`).
3. Build + submit 1.0.2.
4. In App Store Connect / Play Console:
   - **Halt the phased rollout** of 1.0.1 immediately (if still rolling out).
   - **Expedite review** for 1.0.2 if user-facing breakage is severe (App Store has "Request Expedited Review"; Google Play has similar escalations).
5. Notify affected users via in-app messaging or push notification when 1.0.2 is live.

---

## 7. Known Blockers and Missing Automation

| ID | Title | Impact | How to Unblock |
|----|-------|--------|----------------|
| M-001 | **No CI workflow for mobile** (`mobile.yml`) | Lint, typecheck, and smoke are 100% manual. Regression risk is high. | Create `.github/workflows/mobile.yml` that runs on `mobile/**`: checkout → node 20 → npm ci → lint → typecheck → format check → optional `eas build --platform android --profile preview` (runs ~15 min; add only on release tags). |
| M-002 | **No store signing / submission automation documented** | A maintainer with signing keys physically present is the only way to ship today. | Configure EAS Credentials Manager + `eas submit` profiles; store ASC API key + Google Play service account JSON as EAS secrets. |
| M-003 | **No `.env.example` in mobile/** | New contributors guess env vars from code. | Add `mobile/.env.example` mirroring §2 of this runbook. |
| M-004 | **No crash/error monitoring configured** | Production crashes are discovered via user reports or not at all. | Add `@sentry/react-native` or `expo-errors`; wire it up in `app/layout.tsx`. Track `expo-crash` metrics. |
| M-005 | **No automated UI tests (Maestro / Detox / Appium)** | The smoke checklist is manual, slow, and easy to skip. | Add a Maestro test suite covering the 5 smoke flows in `SMOKE_TEST_CHECKLIST.md`. Add `maestro test .maestro/` to the future `mobile.yml` CI. |
| M-006 | **Deep-linking domain files not verified** (`apple-app-site-association`, `assetlinks.json`) | Users tapping an invoice link on web go to the browser, not the app. | Host `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` on `invoisio.com`. Validate with `https://app-site-association.cdn-apple.com/` and Android Studio App Links Assistant. |

---

## 8. Code References for Maintainers

| Topic | File |
|-------|------|
| Package scripts (start, lint, format, typecheck) | [mobile/package.json](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/mobile/package.json) |
| Expo config (version, bundle ID, scheme, icons, deep links, plugins) | [mobile/app.json](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/mobile/app.json) |
| Manual smoke checklist (5 flows; do this before every release) | [mobile/SMOKE_TEST_CHECKLIST.md](file:///c:/Users/lyric/Downloads/GrantFOX/Invoisio/mobile/SMOKE_TEST_CHECKLIST.md) |
| Auth guard component | `mobile/components/auth-guard.tsx` |
| Routes (file-based navigation) | `mobile/app/login.tsx`, `mobile/app/index.tsx`, `mobile/app/invoices/[id].tsx`, `mobile/app/create-invoice.tsx`, `mobile/app/scan.tsx`, `mobile/app/settings.tsx`, `mobile/app/_layout.tsx` |
| Local state stores | `mobile/hooks/use-auth-store.ts`, `mobile/hooks/use-invoice-filters.ts` |
| API client / types | `mobile/lib/invoices.ts`, `mobile/lib/auth-service.ts`, `mobile/lib/merchant-service.ts`, `mobile/lib/cache.ts` |
