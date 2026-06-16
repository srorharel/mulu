# IOS_SETUP.md

How to build, sign, and ship the **MULU** iOS app **without owning a Mac** (builds run on Codemagic's cloud Macs). Companion to `STORE_COMPLIANCE.md`.

- **Bundle id:** `com.sparklego.app` (same as Android; must match the App Store Connect app)
- **Capacitor:** 8.x, **Swift Package Manager** (no CocoaPods / `pod install`)
- **Project:** `ios/App/App.xcodeproj`, scheme `App`
- **CI:** `codemagic.yaml` → workflow `ios-release`

The `ios/` target is already scaffolded and committed. Web assets (`ios/App/App/public`) and `GoogleService-Info.plist` are gitignored — CI regenerates the web assets via `npm run build && npx cap sync ios`.

---

## 1. What's already done (in the repo)
- `ios/` Xcode project created (Capacitor 8 / SPM).
- `ios/App/App/Info.plist` has the required usage strings: location (when-in-use), camera, photo library (+ add), and `UIBackgroundModes: remote-notification` for push.
- `codemagic.yaml` has an `ios-release` workflow (build IPA → TestFlight) and an `android-release` workflow (signed AAB).

## 2. Apple-side setup (you, once)
1. **Enroll** in the Apple Developer Program — as an **organization** (needs a D‑U‑N‑S number), to match the business listing. ($99/yr.)
2. In **App Store Connect**, create the app with bundle id `com.sparklego.app`.
3. On the **App ID** (Certificates, Identifiers & Profiles), enable the **Push Notifications** capability.
4. Create an **APNs Auth Key** (`.p8`) — needed for push (and later for FCM, see §5).
5. Fill the **App Privacy** form using `STORE_COMPLIANCE.md §5` (no tracking; all data "linked to you", used for app functionality/support).
6. Prepare **screenshots** at the required iPhone sizes (and iPad if you keep iPad support — Info.plist currently allows iPad orientations; decide if you support iPad or set it iPhone-only).

## 3. Codemagic setup (you, once — in the Codemagic UI)
1. **Teams → Integrations → App Store Connect:** add an API key (Issuer ID, Key ID, `.p8`). Name it **`MULU ASC API Key`** (referenced in `codemagic.yaml`).
2. Connect the repo, pick the `ios-release` workflow, and run it. With the App Store Connect integration + `ios_signing: { distribution_type: app_store, bundle_identifier: com.sparklego.app }`, Codemagic fetches/creates the signing cert + provisioning profile automatically.
3. Successful builds upload to **TestFlight** (`submit_to_testflight: true`). Install via the TestFlight app to test on a real iPhone (your no-Mac test path).

For Android in the same file (`android-release`): upload your upload keystore under **Code signing identities → Android keystores** with reference name **`mulu_keystore`**.

## 4. App Review prep (two-sided marketplace)
- Provide **demo logins** in App Review notes: a **consumer** account and a **pre-approved washer** account (so the reviewer can see the washer side without manual verification). Seed a reviewable job/flow.
- In App Review notes, **list the native features** (camera capture, GPS matching/arrival, push) to pre-empt a Guideline 4.2 "minimum functionality / web wrapper" rejection.

## 5. ⚠️ iOS push needs FCM↔APNs bridging (REQUIRED before iOS push works)
The app sends push via **Firebase Cloud Messaging (FCM)** on the backend (`send-notification` Edge Function; `device_tokens.token`). But on iOS, `@capacitor/push-notifications` registers with **APNs** and returns an **APNs token**, *not* an FCM token — so the FCM backend cannot deliver to it as-is. Pick one:

- **Option A (recommended) — make iOS use FCM tokens too:** add the Firebase iOS SDK and a messaging plugin (e.g. `@capacitor-firebase/messaging`), add `GoogleService-Info.plist` (from the Firebase iOS app; gitignored — add it in CI as a secure file or commit it to a private store), and store the FCM token (not the APNs token) in `device_tokens` for `platform='ios'`. Backend then works unchanged.
- **Option B — send via APNs for iOS rows:** have `send-notification` detect `platform='ios'` and send through APNs directly (using the §2.4 APNs key) instead of FCM.

Until one of these is done, Android push works but **iOS push will not deliver**. `src/lib/notifications.js` is where token registration/storage happens.

## 6. Local sync convenience (optional, Windows)
You can't build iOS locally, but you can keep the iOS project in sync after web changes:
```
npm run build
npx cap sync ios
```
Then commit `ios/` changes and let Codemagic build.

## 7. Remaining iOS checklist
- [ ] Apple Developer org enrollment + D‑U‑N‑S
- [ ] App Store Connect app (`com.sparklego.app`) + Push Notifications capability + APNs key
- [ ] Codemagic App Store Connect API key integration (`MULU ASC API Key`)
- [ ] First `ios-release` build → TestFlight, install + smoke-test on iPhone
- [ ] FCM↔APNs bridging (§5) so iOS push delivers
- [ ] iOS app icon set + launch screen + screenshots
- [ ] App Privacy form (§5 of STORE_COMPLIANCE.md), demo accounts, App Review notes
- [ ] Decide iPhone-only vs iPad support
