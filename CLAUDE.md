# CLAUDE.md

**MULU** — two-sided on-demand car-wash marketplace. PWA + Capacitor 8 (Android + iOS).
React 18 + Vite + Tailwind frontend; Supabase (Postgres + PostGIS, Auth, Realtime, Storage) backend.

## Commands

```bash
npm run dev:all        # main (3000) + support (3001) + admin (3002) via concurrently
npm run dev            # main only       (cd support-app && npm run dev → 3001)
npm run dev:admin      # admin only (3002)
npm run build          # prod build (main)        npm run preview
npm run lint           # ESLint, zero-warnings policy
npm run test           # Vitest (main). support-app + admin-app have their own suites.
npm run setup          # check env → migrate → verify
npm run db:migrate     # apply SQL migrations   db:migrate:bootstrap = record-only (see DATABASE.md)
npm run db:verify      # tables, RLS, functions, seed     npm run check:env     npm run setup:buckets
npm run drift          # content/branding/config/design drift vs live DB (+ :content/:branding/:config/:design)
npm run smoke          # E2E smoke for P6/P7/P8 admin flows
node scripts/audit-bootstrap.js        # declared-but-missing DB objects
node scripts/verify-live-surfaces.js   # live Approvals / storage RLS / nearby_jobs checks
npm run android:sync   npm run android:open
./update.ps1 "msg"            # commit → push (Vercel auto-deploys) → debug APKs (sideload)
./update.ps1 "msg" -Support   # + builds support APK → wash-support-latest.apk
./release-android.ps1         # SIGNED release AAB for Play (bundleRelease → wash-release.aab)
```

> **Windows (ADR-005):** some npm script chains break. If `npm run dev` fails, run `node ./node_modules/vite/bin/vite.js` directly.
> **JDK 21 required** for Android builds (Capacitor 8 plugins pin a JDK-21 Gradle toolchain). `update.ps1` / `release-android.ps1` auto-detect Android Studio's bundled JBR; `android/settings.gradle` has a foojay resolver for toolchain auto-provisioning. iOS is built in the cloud via `codemagic.yaml` (no Mac locally).

## Required env

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
DATABASE_URL=          # direct Postgres URL for migration scripts
```

## Architecture at a glance

Three separate Vite apps, auth-isolated by Supabase `storageKey`:

| App | Path | Port | Users | storageKey | Native |
|-----|------|------|-------|-----------|--------|
| Main | `src/` | 3000 | consumer + washer | SDK default | Capacitor 8 `com.sparklego.app` (Android + iOS) |
| Support | `support-app/src/` | 3001 | agent | `wash-support-auth` | Capacitor 8 `com.sparklego.support` (Android, internal) |
| Admin | `admin-app/src/` | 3002 | super_admin | `wash-admin-auth` | web-only (Vercel) |

Roles (`profiles.role`): `consumer`, `washer`, `agent`, `super_admin`.
**Agents use only support-app; super_admins use only admin-app.** `super_admin` does NOT inherit agent
powers — `is_super_admin()` is distinct from `is_agent()`. Never add agent UI to main; never add admin
UI to main/support.

## Detail docs

- **ARCHITECTURE.md** — routing/auth, booking, washer dashboard, approval workflow, verification, support + admin apps, design editor, dark mode, i18n, realtime, mobile, deployment, tests.
- **DATABASE.md** — tables, RPCs, migrations, buckets, order state machine, pricing/payout, RLS, **migration discipline**.
- **NOTIFICATIONS.md** — FCM push: edge functions, triggers, channels, broadcasts, deep links.
- **OTP_AND_CALLS_SETUP.md** — operator checklist for in-app masked calls + SMS phone verification (feature flags, Cloudflare TURN, SMS provider, deploy steps).
- **DECISIONS.md** — ADRs.   **DESIGN.md** — visual/design system.   **STORE_COMPLIANCE.md** — permission strings, Data Safety / Privacy Label, deletion URL, UGC.   **STORE_LISTING.md** — store copy (he/en) + Data Safety / App Privacy answers + review demo-account notes.   **IOS_SETUP.md** — iOS build via Codemagic (no Mac), Apple setup, iOS-push FCM↔APNs TODO.

## Legal docs / account deletion / UGC (Jun 2026, migrations through 0113; ADR-036–041)

- **Legal docs (ADR-036/037):** `legal_documents` (versioned, one `is_current` per doc_type×locale) + `user_legal_acknowledgments`. RPCs `publish_legal_document` (agent-only), `get_current_legal_document` (he-fallback), `pending_legal_acknowledgments` (role-filtered), `acknowledge_legal_document`. Agents edit/publish in support-app `/legal`; main app gates via `LegalUpdateModal` (mounted in `src/router.jsx`) + viewers `/legal/{terms,privacy,washer-terms}`. Publish fires trigger → Edge Fn `fan-out-legal-update` → `send-notification` event type **`legal_update`**. **New Vault secret: `fan_out_legal_update_url`.** **Signup consent is recorded server-side: `handle_new_user` (migration 0121) seeds `user_legal_acknowledgments` when the signup form passes `accepted_legal` (consumer → terms+privacy; washer → privacy only — the washer contract stays post-approval), so `LegalUpdateModal` does NOT re-prompt right after registration; it reappears only on a version bump. Guarded by `legalConsentOnSignup.contract.test.js`.**
- **Account deletion (ADR-038):** Edge Fn `delete-account` (service-role; consumer/washer only) — **anonymizes orders** (PII nulled, financials/`order_events` kept), purges per-user storage + child rows, deletes profile + auth user. Migration 0109 set `orders.consumer_id`/`washer_id` + `order_events.actor_id` to **ON DELETE SET NULL** (consumer_id now nullable). In-app (both settings) type-to-confirm; public store URL **`/account/delete`** (logged-in runs it, logged-out shows instructions). Needs Edge secret `SUPABASE_SERVICE_ROLE_KEY`.
- **UGC (ADR-039):** `content_reports` (agents triage in support-app **Reports** tab, live badge) + `content_blocks` (order-chat block = hide + disable compose). Per-message `MessageActions` in `OrderChatSheet` + support chat. **NOT** routed into `support_tickets` (its `order_id` is NOT NULL+UNIQUE).
- **First-wash discount (ADR-040):** 30% off a consumer's first non-cancelled order, applied **inside `validate_order_prices`** (0111) — platform absorbs (washer payout untouched). Client (`useFirstWashDiscount` + `applyFirstWashDiscount`) is display-only. Pinned by `firstWashDiscount.contract.test.js`.
- **Receipts (ADR-041):** order → `completed` issues a `receipts` row (sequential #, config snapshot) + emails the customer via Edge Fn `send-receipt` (Resend) **with a חשבונית מס/קבלה PDF attached** (pdf-lib + Alef font + manual RTL visual ordering — PDFs have no bidi). Config in admin **Receipts** tab (9 `app_config` keys incl. עוסק מורשה + sender email; the list has a From/To **issue-date filter**). **New Vault secret: `send_receipt_url`; new Edge secret: `RESEND_API_KEY`.** Pinned by `receipts.contract.test.js`. Sender domain `muluwash.com` is verified in Resend with DNS on **Cloudflare** (SPF/DKIM/DMARC intact); `receipt_sender_email` = `receipts@muluwash.com`.
- **Receipt retention — NONE (keep forever):** receipt **rows AND their archived PDFs are retained permanently** — the PDFs are the original חשבונית מס/קבלה documents the business files with the tax authority monthly, so they must never be auto-deleted. 0122 briefly added a 6-month PDF purge; it was **reverted in 0123** (cron unscheduled, purge functions + `pdf_purged_at` dropped, `purge-receipt-pdfs` undeployed, Vault `purge_receipt_pdfs_url` removed). Do NOT reintroduce a receipt purge. (The admin Receipts list keeps its From/To issue-date filter — useful for pulling each month's receipts for filing.)

## Auth transactional emails (Resend custom SMTP, Jun 2026)

Supabase Auth emails (signup confirmation, password reset, etc.) are sent through **Resend custom SMTP from `noreply@muluwash.com`** — NOT Supabase's shared sender. Same verified Resend domain as receipts (`muluwash.com`, DNS on Cloudflare). Project ref `fpwshpvixtgaygkuxajy`.

- **This config is NOT in the DB and NOT a `DATABASE_URL`/SQL setting** — it lives in GoTrue (Auth), reachable only via the **Supabase Management API** (`PATCH https://api.supabase.com/v1/projects/{ref}/config/auth`, needs an `sbp_` personal access token) or the dashboard. On Windows, `curl` needs `--ssl-no-revoke` (schannel revocation error otherwise); Node `fetch` is unaffected.
- **SMTP:** `smtp.resend.com:465`, user `resend`, password = a **send-only** Resend API key. Sender `MULU <noreply@muluwash.com>`. `rate_limit_email_sent` = **30/hr** (was the testing default of 2). `mailer_autoconfirm` stays **false** (email confirmation required).
- **URL config:** `site_url` = `https://muluwash.com`; `uri_allow_list` includes `https://muluwash.com/**` + `https://www.muluwash.com/**` (kept `localhost:3000` / `10.0.0.4:3000` / `*.vercel.app` preview origins). The signup `emailRedirectTo` (`AuthContext.signUp`) derives from `window.location.origin`, so that origin MUST stay allow-listed.
- **Templates — all 6 are Hebrew/RTL + brand-styled** (confirmation, recovery, magic_link, email_change, reauthentication, invite). **Single source of truth: `supabase/email-templates/push-templates.mjs`.** Edit copy there, then `PUSH=1 SUPA_TOKEN=sbp_xxx node supabase/email-templates/push-templates.mjs` regenerates the `.html` preview/backup files AND PATCHes every `mailer_subjects_*` / `mailer_templates_*_content`. **Do NOT hand-edit the generated `.html` files.** Shared shell: header band brand `#26b55f`, CTA button `#15803d` (white text = 5:1, WCAG AA — `#26b55f` fails on white), button-only (no raw-link fallback); reauthentication renders `{{ .Token }}` as a code block. `dir="rtl"` is set on every element (Gmail strips the outer wrapper's dir — same lesson as the receipt email).
- **Confirm link points at `{{ref}}.supabase.co/auth/v1/verify?...&redirect_to=https://muluwash.com/`** — this is correct/secure: the token can only be verified by the auth server, which then 302-redirects to the app. To brand the host (`auth.muluwash.com`) would need the paid Supabase **Custom Domain** add-on (no code) or a token-hash `/auth/confirm` route in the app (free, code) — **both deferred**.
- Distinct from **receipt** emails (`send-receipt` Edge Fn → `receipts@muluwash.com`); those are unrelated to Auth SMTP. To test the live flow: `supabase.auth.signUp` with a `+alias@gmail.com` sends the real confirm email; `handle_new_user` only needs `role`/`full_name` in metadata (legal acks seed only when `accepted_legal=true`).

## App-store submission & native build (Jun 2026)

Capacitor 8 + submission prep are **merged to `main`** (PR #1, Jun 2026; device-tested on Android, deploys via `update.ps1` → Vercel). Refs: **STORE_COMPLIANCE.md**, **STORE_LISTING.md**, **IOS_SETUP.md**.

- **Capacitor 8** (main + support, migrated 6→7→8 via `npx cap migrate`): `compileSdk`/`targetSdk` **36**, `minSdk` **24**, AGP **8.13.0**, Gradle **8.14.3**. Clears Google Play's targetSdk 35 (now) + 36 (Aug 31 2026) rules.
- **Release signing:** `android/key.properties` (gitignored — copy `key.properties.example` + run the keytool cmd there). `./release-android.ps1` → **signed AAB** (`wash-release.aab`) = the Play upload, NOT the debug APKs `update.ps1` sideloads. `versionCode`/`versionName` overridable via `-Pvcode`/`-Pvname` (Codemagic uses `$BUILD_NUMBER`).
- **iOS:** `ios/` target (Cap 8, **SPM — no CocoaPods**); no Mac locally → cloud-built via **`codemagic.yaml`** (`ios-release` → TestFlight; `android-release` → signed AAB). Info.plist usage strings (he) + push background mode present; app icon generated from `public/logo.png` via `@capacitor/assets`. **iOS push NOT wired yet** — `send-notification` already sends iOS via the FCM `apns` block, but the client stores an APNs token; needs swap to `@capacitor-firebase/messaging` + a Firebase iOS app (`GoogleService-Info.plist`). DEFERRED until that + a device exist (IOS_SETUP.md §5). Android push works, untouched.
- **Review demo accounts:** `node scripts/seed-review-accounts.mjs` (service-role key) → a consumer + a pre-approved washer.
- **Production domain:** `muluwash.com` (the public `/account/delete` + `/legal/*` privacy URLs resolve there; deploy the consumer app at it). **Payments:** real-world service → no IAP (Apple 3.1.3(e) / Google physical-services); external processor TBD.
- **Consumer booking page (`Home.jsx`) simplifications (Jun 2026):** removed the water/power (ברז מים / שקע חשמל) site toggles — orders no longer set `site_has_water`/`site_has_power` (DB columns remain, `NOT NULL DEFAULT false`; the washer `JobDrawer` still reads them). Also dropped the "incl VAT / כולל מע״מ" header + inline breakdown (prices are VAT-inclusive/final).

## In-app masked calls + phone verification (Jun 2026)

Both gated by env flags in `src/lib/featureFlags.js` (build-time inlined, default OFF). For Vercel set the var in the project env + redeploy; for native it's read from local `.env` at build. Full operator checklist: **OTP_AND_CALLS_SETUP.md**.

- **Masked in-app calls — LIVE (`VITE_ENABLE_INAPP_CALLS=true`).** WebRTC voice between consumer↔washer with **no real phone numbers exposed**. `CallProvider` (`src/context/CallContext.jsx`) + `CallSheet` + `useCall()`, mounted in `App.jsx`. Signalling rides **Supabase Realtime broadcast**: a personal inbox channel `user-calls:<userId>` (carries the `ring`) + a per-call `call:<callId>` channel (offer/answer/ice/accept/decline/hangup). ICE/TURN from the **`turn-credentials`** Edge Fn (**Cloudflare Realtime TURN**; Edge secrets `TURN_PROVIDER=cloudflare`, `TURN_KEY_ID`, `TURN_KEY_API_TOKEN`; falls back to STUN). When the flag is on, the call buttons in `OrderTracking.jsx` (consumer→washer) + `JobDrawer.jsx` (washer→consumer) start a masked call instead of the old `tel:` link. In-call UI: mute, **speaker toggle** (best-effort `setSinkId`), and a synthesized **ringtone** (`src/lib/ringtone.js`, Web Audio — foreground only). Mic permission: `RECORD_AUDIO` (Android) + `NSMicrophoneUsageDescription` (iOS).
- **Incoming-call notification (app minimized/closed).** The caller invokes the **`notify-call`** Edge Fn → **`send-notification`** with event type **`incoming_call`**, sent as a **normal high-priority `notification` message on the dedicated max-importance `incoming_calls` channel** (created in `notifications.js` `createChannels`, sound `bell.mp3`). Rings as a heads-up like every other notification, even when closed. Tapping it → `notifications.js` `pushNotificationActionPerformed` dispatches a `window` event **`mulu:incoming-call`** → `CallContext` reconstructs the call + shows the `CallSheet` (the original Realtime `ring` was missed while the app was down). The foreground path is the in-app Realtime ring, unchanged. **iOS** gets a normal alert; a true full-screen lock-screen ring (CallKit/PushKit + Android ConnectionService) is **deferred** (same blocker as iOS push).
- **Phone verification (SMS OTP) — BUILT but flag OFF (`VITE_ENABLE_PHONE_VERIFY`), pending an SMS provider.** Phone is already collected + uniqueness-checked at signup (0124); this adds proof of ownership. Migration **0126** adds `profiles.phone_verified_at` + a **service-role-only** `phone_verifications` table (codes stored as salted SHA-256 only). Edge Fns **`send-otp`** / **`verify-otp`** (6-digit code, 10-min expiry, 60s resend, 5/hr, 5 attempts then lock) + a provider-agnostic **`_shared/sms.ts`** adapter (default `log` = no real SMS; `019`/`inforu`/`generic` stubs — verify against the chosen Israeli aggregator's API). Gate modal `PhoneVerifyModal` mounted in `router.jsx` (mirrors `LegalUpdateModal`; consumer/washer only). New Edge secrets when enabled: `OTP_HASH_SALT` + `SMS_*`. Pinned by `phoneVerify.contract.test.jsx`.

## Load-bearing gotchas (do not remove)

- **`nearby_jobs` contract:** keep the 13-col return shape **including `lat`/`lng`** (WorkerMap pins). Guarded by `src/__tests__/nearbyJobsShape.contract.test.js`, `useNearbyJobs.test.jsx`, `scripts/verify-db.js`. Details in DATABASE.md.
- **Migrations:** `CREATE OR REPLACE FUNCTION` fails if the `RETURNS TABLE` shape changed → `DROP FUNCTION IF EXISTS` first. Extension symbols live in schema `net`/`extensions`, not `public` (qualify the call + add to `search_path`). New super_admin tables need BOTH a write path AND an explicit super_admin SELECT policy. Avoid an inner `BEGIN;`/`COMMIT;` (the runner already wraps each file). Full rules in DATABASE.md.
- **Pricing:** `app_config.pricing_source` MUST stay `'hardcoded'` until verified vs staging (DATABASE.md).
- **`src/test/setup.js`:** the global `beforeEach` clears session/localStorage — don't remove (stops SignUp draft state leaking across tests).
- **Washer Settings `GridPill`:** depends on a module-level `const SPRING = {...}` — don't delete in refactors; it is NOT imported from PillRow.
- **Design editor `121212` gate** (`admin-app/.../DesignEditor.jsx`) is a soft accidental-entry guard, **NOT security** — real protection is RLS + the bound-validating `admin_set_design_override` RPC.
- **Location permission (Cap 8):** `useGeolocation` MUST `Geolocation.requestPermissions()` first (Cap 8 stopped auto-prompting from `getCurrentPosition`) AND retry while it returns `'prompt'` — Android shows one permission dialog at a time, and the startup push request (`router.jsx` `initNotifications`) otherwise swallows the location dialog (returns unchanged `'prompt'`, no UI). Don't revert to a bare `getCurrentPosition`.
- **ESLint `ignorePatterns`** (`.eslintrc.cjs`) must keep `android`, `ios`, `mulu-site-cloudflare`, `mulu-posts` — they hold built/minified bundles; dropping any floods `npm run lint` with hundreds of false errors.
- **support-app i18n** skips the live content-override fetch + Realtime subscribe under Vitest (`!import.meta.env.VITEST` in `support-app/src/i18n/index.js`) — don't remove, or tests open a real WebSocket and throw uncaught undici/jsdom `Event` errors (flips the CI exit code).
- **Glass surfaces on Android:** `--color-glass-surface`/`--color-surface-glass` (`src/index.css`) are kept **near-opaque (~0.92)** — Android WebView renders `backdrop-blur` unreliably, so lowering opacity makes glass sheets/cards/modals see-through + low-contrast on device. Modals (`ConfirmDialog`, `SaveVehicleDialog`) use **solid** `bg-surface-elevated` (no `backdrop-blur` — the blur layer also clipped their buttons on Android). Dark mode applies to **washer routes only**; consumer routes are always light.
- **Internal callers of `send-notification` must authenticate with `TRIGGER_SECRET`, NOT `SUPABASE_SERVICE_ROLE_KEY`.** The two are not necessarily the same value; a mismatch is a silent 401 → the push is dropped with no error. `notify-call`, `fan-out-nearby-job`, `fan-out-legal-update` all use `Deno.env.get('TRIGGER_SECRET')` for the bearer. (This bug silently killed the incoming-call push.)
- **The `incoming_call` push must stay a normal `notification` message on the `incoming_calls` channel — do NOT switch it to a data-only message for a full-screen ring.** Data-only FCM messages are **not delivered to a backgrounded/killed app** (and a custom `FirebaseMessagingService` can lose the FCM service-resolution race), so the ring never shows when minimized/closed — the exact symptom that reverted the first attempt. A true full-screen lock-screen ring needs native CallKit (iOS) + ConnectionService/foreground-service (Android), not a data-only push.
- **A washer "cancel" RELEASES the job back to `pending` — it must NOT terminally cancel the order (ADR / migration 0127).** `transition_order_status` has **no** washer → `cancelled` branch; the washer path is `accepted`/`en_route` → `pending`, which un-assigns the washer (`washer_id`/`accepted_at` → NULL) + clears arrival photos so the order re-enters the pool. `JobDrawer.releaseJob` calls the RPC with `new_status:'pending'` (NOT `'cancelled'`). Re-pending fires `trg_notify_on_order_repend` (AFTER UPDATE → pending) which resets `order_washer_notifications` + re-invokes `fan-out-nearby-job`. Do NOT "restore" a washer terminal-cancel — it kills the customer's order, which is exactly what this changed. Consumer/agent cancels are unchanged.
