# iOS Beta Handoff

Single source of truth for the ordered steps that unblock each iOS beta phase.
Read this once Apple Developer enrolment approves — everything before that is
already landed.

---

## What's already done (on master)

- `capacitor.config.ts` — app id `com.signallab.os`, server.url
  `https://signallabos.com`.
- `src/lib/native-bridge.ts` — `isNative` / `platform` / `shareOrCopy` /
  `haptic`. Safe in web bundles (dynamic plugin imports).
- `src/components/NativeBoot.tsx` — mounted in root layout. Requests push
  permission, registers token, routes on notification tap. Silent no-op on web.
- `src/app/apple-app-site-association/route.ts` + rewrite in `next.config.js`
  → AASA served at both `/apple-app-site-association` and
  `/.well-known/apple-app-site-association`.
- `src/middleware.ts` — AASA paths excluded from auth gate.
- `supabase/migrations/20260422_user_devices.sql` — applied. Table
  `user_devices` + RLS + unique index.
- `src/app/api/devices/register/route.ts` — POST upserts, DELETE surrenders.
- `src/lib/apns-push.ts` — Web-Crypto ES256 JWT signer + HTTP/2 POST to
  api.push.apple.com. Silent no-op until `APNS_*` secrets exist.
- `src/lib/notifications.ts` — fans out APNs push alongside DB + email + SMS.
- Share buttons on `MobileShell` + `MobileGigs` now go through `shareOrCopy`
  (native sheet first, Web Share next, clipboard fallback).

None of this requires the Apple account to land. All of it ships as a no-op
until the right secrets are in place.

---

## When Apple Developer approves

### 1. Set the Team ID

Two places:

- Cloudflare Worker secret: `APPLE_TEAM_ID=<10-char team id>` — AASA uses this
  via `process.env.APPLE_TEAM_ID` (falls back to `TEAMID1234` today).
- Local `.env.local` (for dev AASA) — same key.

Deploy the Worker. Verify:

```bash
curl -si https://signallabos.com/.well-known/apple-app-site-association | head
# appID must become <TEAM>.com.signallab.os
```

### 2. Scaffold iOS on the Mac Mini

From the Mini (`signallabos@anthonys-mac-mini.local`):

```bash
cd ~/signallab
git pull
npm install
npx cap add ios
npx cap sync
npx cap open ios
```

In Xcode:

- Signing & Capabilities → Team: pick the newly-approved team.
- Add capability: **Push Notifications**.
- Add capability: **Associated Domains** → `applinks:signallabos.com`,
  `webcredentials:signallabos.com`.
- Bundle id stays `com.signallab.os`.

### 3. APNs auth key

Apple Developer → Keys → `+` → **Apple Push Notifications service (APNs)**.
Download the `.p8` exactly once.

Add four Worker secrets (`wrangler secret put <name>`):

- `APNS_AUTH_KEY` — base64 of the `.p8` file contents:
  `base64 < AuthKey_XXXXXXXXXX.p8 | pbcopy`
- `APNS_KEY_ID` — the 10-char Key ID (shown next to the key, also in the .p8
  filename)
- `APNS_TEAM_ID` — same value as `APPLE_TEAM_ID`
- `APNS_BUNDLE_ID` — `com.signallab.os`
- `APNS_ENV` — `sandbox` for TestFlight/dev, `production` for App Store.
  Omit to let the stored per-device `environment` column decide.

Smoke test by triggering any notification in the app. Server logs will show
`[apns] skipped` before keys exist, and actual HTTP results after.

### 4. TestFlight build

From the Mini:

```bash
cd ~/signallab/ios/App
xcodebuild -workspace App.xcworkspace -scheme App -configuration Release \
  -archivePath build/App.xcarchive archive
xcodebuild -exportArchive -archivePath build/App.xcarchive \
  -exportPath build -exportOptionsPlist ExportOptions.plist
```

(Or use the fastlane lanes added in Phase 4.)

Upload to App Store Connect → TestFlight → add Anthony as internal tester.

### 5. Verify Universal Links end-to-end

Once the TestFlight build is installed on Anthony's phone:

1. Kill the app.
2. From Messages, tap any `https://signallabos.com/...` link.
3. Should open the native app, not Safari. If Safari opens instead, check the
   AASA response has the correct Team ID and the Associated Domains entitlement
   matches exactly.

### 6. Verify push

1. In the app, confirm permission prompt appears on first launch.
2. Server should see `POST /api/devices/register` with the APNs token.
3. Trigger a `invoice_created` or `gig_added` notification (any money-critical
   type). Lock screen banner should fire within ~1s.
4. Tap it — app should land on the `href` from the payload.

---

## Things not yet wired (safe to defer past v1 TestFlight)

- iOS splash-screen PNGs (11 sizes) + `apple-touch-startup-image` link tags.
- Badge count management (increment on unread, clear on open).
- Silent pushes for background data refresh.
- Android/FCM parity — `sendToUser` currently only targets iOS devices.
- OpenClaw daemon install on the Mini (Phase 4 — needs Node 24+ first).
- fastlane lanes checked into `signallab/fastlane/`.
