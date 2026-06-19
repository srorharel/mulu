# LAUNCH_CHECKLIST.md — MULU main app → Google Play + App Store

Single ordered runbook for shipping the **consumer/washer app** (`com.sparklego.app`).
Support + admin apps stay on Vercel and are out of scope. Ordered by dependency — do the
sections top to bottom. `[x]` = done in the repo; `[ ]` = your action.

Companions: `STORE_COMPLIANCE.md` (policy reasoning), `STORE_LISTING.md` (copy),
`STORE_DATA_SAFETY.md` (console fill-in), `IOS_SETUP.md` (Apple/CI), `NOTIFICATIONS_TESTING.md`.

---

## 0. Repo readiness (DONE)

- [x] Capacitor 8, targetSdk 36 / minSdk 24 (clears Play's Aug-31-2026 rule)
- [x] Android upload keystore generated → `android/app/mulu-upload.jks` + `android/key.properties` (gitignored)
- [x] Release signing wired in `android/app/build.gradle`; `release-android.ps1` builds the AAB
- [x] iOS project (SPM), Info.plist usage strings, app icon, launch screen; `codemagic.yaml` iOS+Android workflows
- [x] iOS set to iPhone-only (no iPad screenshots needed); CI bumps build number per upload
- [x] Account-deletion flow + public `/account/delete`; UGC report/block; geofence (Holon); pricing safe
- [x] `npm run lint` clean; support email standardized to `support@muluwash.com`; friendly booking-error
- [x] `STORE_DATA_SAFETY.md` console fill-in guide written

---

## 1. Back up the signing key (DO NOW — irreversible if lost)

- [ ] Copy `android/app/mulu-upload.jks` + the password from `android/key.properties` to a
      password manager / offline backup. **Losing either = you can never update the app.**
- [ ] (Codemagic) Upload the same `.jks` as Android signing identity `mulu_keystore`.

---

## 2. Build the upload artifacts

- [x] **Android signed AAB:** built + signature-verified → `wash-release.aab` (7.4 MB,
      `jarsigner -verify` = "jar verified", signed CN=MULU). Rebuild with
      `./release-android.ps1 -VersionCode N` (bump N every upload).
- [ ] **iOS build:** trigger Codemagic `ios-release` (needs §4 Apple setup first) → TestFlight.

---

## 3. Google Play Console

- [ ] Create the app (Auto & Vehicles category), default language Hebrew.
- [ ] **App signing:** enroll in Play App Signing on first AAB upload.
- [ ] **Data safety** form — use `STORE_DATA_SAFETY.md §A` (Payment-info row pending §6).
- [ ] **Content rating** (IARC) questionnaire — declare UGC + report/block (expect Teen).
- [ ] **Target audience**, **Ads = No**, **News = No**.
- [ ] **Data deletion** URL: `https://muluwash.com/account/delete`.
- [ ] **Privacy Policy** URL: `https://muluwash.com/legal/privacy`.
- [ ] Store listing copy from `STORE_LISTING.md`; upload graphics (§5).
- [ ] App access / testing instructions: review demo accounts (§7).
- [ ] Upload `wash-release.aab` to **Internal testing** → verify → promote to Production.

---

## 4. Apple — App Store Connect (hard blockers, account-side)

- [ ] Apple Developer Program enrollment (D-U-N-S, $99/yr).
- [ ] Create app in ASC with bundle id `com.sparklego.app`.
- [ ] Codemagic → add App Store Connect API key integration named exactly **`MULU ASC API Key`**.
- [ ] (For push later) Enable Push Notifications capability + APNs key on the App ID.
- [ ] **App Privacy** form — use `STORE_DATA_SAFETY.md §B`.
- [ ] Upload iPhone 6.7" + 6.5" screenshots (no iPad needed — iPhone-only).
- [ ] App Review notes: list native features (location/camera/calls) to avoid a 4.2 web-wrapper rejection; include demo accounts (§7).
- [ ] Submit a TestFlight build, then submit for review.

---

## 5. Store graphics (none exist yet — produce these)

- [ ] Play: 512×512 app icon, 1024×500 feature graphic, ≥2 phone screenshots.
- [ ] Apple: 1024×1024 marketing icon, iPhone 6.7" + 6.5" screenshots.

---

## 6. Payment processor (blocks the Payment-info privacy rows)

- [ ] Choose the external card processor; confirm whether card data touches MULU servers.
- [ ] Update the Payment-info row in `STORE_DATA_SAFETY.md §A/§B` and the consoles accordingly.

---

## 7. Backend / data prep (live project `fpwshpvixtgaygkuxajy`)

- [ ] **Re-seed review accounts** (deleted in the pre-launch wipe):
      `SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/seed-review-accounts.mjs`
      → `review.consumer@muluwash.com` + pre-approved `review.washer@muluwash.com` (`MuluReview!2026`).
- [ ] Confirm legal docs are **published** (`is_current`) in prod so in-app `/legal/*` isn't empty
      (the marketing-site copies at muluwash.com are separate static mirrors).
- [ ] Verify push backend secrets are set (`TRIGGER_SECRET`, `FCM_SERVICE_ACCOUNT_JSON`,
      `app.settings.*`) — a `TRIGGER_SECRET` mismatch silently drops all pushes. Run `NOTIFICATIONS_TESTING.md §1`.
- [ ] If masked calls stay ON: confirm `notify-call` + `send-notification` (with `incoming_call`) are deployed.

---

## 8. Final pre-submit verification

- [ ] Open and confirm real content (not 404/homepage): `muluwash.com/legal/privacy`, `/legal/terms`,
      `/account/delete`, `/accessibility`.
- [ ] Device-test runtime permission prompts (location/camera/notifications) on Android 13+ and 15 (edge-to-edge).
- [ ] Smoke-test the demo accounts end-to-end (book → accept → complete) on a real device.
- [ ] Confirm shipped binary permissions match the Data-safety/App-Privacy declarations.

---

## Known-deferred (OK to ship without — documented)

- iOS push (FCM↔APNs bridging) — no `GoogleService-Info.plist` yet; don't advertise push in the iOS listing.
- CallKit/full-screen lock-screen ring.
- SMS phone-verification (flag OFF, no SMS provider).
- **Accessibility-coordinator placeholders** in `mulu-site-src/src/lib/content.js` — Israeli legal
  requirement, intentionally left for you to fill (name/phone/email/address/date), then rebuild+redeploy the site.
