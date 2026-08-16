Closes #300

## Summary

- enable verified iOS universal links and Android App Links for `invoisio.com`
- route payment, invoice, and receipt URLs to distinct mobile destinations
- handle both cold-start URLs and warm-start link events, including deferred
  authenticated invoice navigation
- add browser fallbacks plus deploy-time Apple/Android association endpoints
- document signing configuration and physical-device verification steps

## Verification

- targeted Prettier and ESLint checks for changed mobile files
- `npm run lint && npm run build` (web)
- follow the cold- and warm-start device matrix in
  `docs/UNIVERSAL_LINKS.md` with a signed build

The repository-wide mobile typecheck remains blocked by pre-existing errors in
the draft/create-invoice implementation; the changed link-handling files do not
add TypeScript diagnostics.

## Deployment notes

Set `IOS_APP_TEAM_ID` and `ANDROID_APP_SHA256_FINGERPRINT` on the production web
deployment before shipping the native build. Rebuild and reinstall the native
apps so the associated-domain entitlement and verified intent filters are
present and the operating systems refresh their cached association state.
