# Universal links and Android App Links

**Status:** Current
**Last Reviewed:** 2026-08-24

Invoisio supports these HTTPS entry points (the custom `invoisio://` scheme is
retained for backwards compatibility):

| URL | Mobile destination | Browser fallback |
| --- | --- | --- |
| `https://invoisio.com/payment/:id` | Public payment screen | `/pay/:id` |
| `https://invoisio.com/pay/:id` | Public payment screen | `/pay/:id` |
| `https://invoisio.com/invoice/:id` | Authenticated invoice details | `/invoices/:id` |
| `https://invoisio.com/receipt/:id` | Public receipt | `/invoices/:id` |

Only HTTPS links on `invoisio.com` and the `invoisio` custom scheme are accepted
by the app parser. IDs and query values are URL-decoded before navigation.

## Production deployment

The website serves both verification documents from `/.well-known`. Configure
these variables in the production web deployment before releasing the app:

- `IOS_APP_TEAM_ID`: the 10-character Apple Developer Team ID used to sign
  `com.invoisio.mobile`.
- `ANDROID_APP_SHA256_FINGERPRINT`: the SHA-256 fingerprint of the Android
  production signing certificate. Multiple fingerprints (for example Play App
  Signing and an internal build) may be supplied as a comma-separated list.

The files must be available over HTTPS, without authentication or redirects:

```text
https://invoisio.com/.well-known/apple-app-site-association
https://invoisio.com/.well-known/assetlinks.json
```

Both endpoints deliberately return `503` when their signing values are absent,
instead of publishing a verification document that can never match a release.
After changing either document, reinstall the app because both operating
systems cache domain association results.

The Expo config declares the iOS associated domains entitlement and verified
Android intent filters. A new native binary is required after changing those
settings; Expo Go cannot verify an app-owned domain.

## Cold- and warm-start checks

Use a signed development/production build on physical devices. Replace `123`
with a reachable invoice ID.

1. Force-quit the app, open each supported HTTPS URL from Mail or Notes, and
   confirm payment, invoice, and receipt land on their corresponding screens.
2. Leave the app foregrounded, open each link again, and confirm navigation
   happens without restarting the process.
3. Sign out and open a payment and receipt link; both remain public. Open an
   invoice link, sign in, and confirm the queued invoice opens afterward.
4. Uninstall the app and repeat; the same URLs must reach their documented web
   fallbacks.

Useful Android diagnostics:

```sh
adb shell pm verify-app-links --re-verify com.invoisio.mobile
adb shell pm get-app-links com.invoisio.mobile
adb shell am start -a android.intent.action.VIEW -d https://invoisio.com/payment/123
```

For iOS, install the signed build after the AASA endpoint is live, then use a
real tappable link (pasting a URL directly into Safari's address bar does not
exercise universal-link handoff).
