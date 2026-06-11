# ARCHITECTURE.md

App structure for MULU. See **CLAUDE.md** for the index + load-bearing gotchas, **DATABASE.md** for the backend, **NOTIFICATIONS.md** for push, **DECISIONS.md** for ADRs.

**MULU** is a two-sided on-demand car wash marketplace (PWA + Capacitor Android). Consumers book jobs; washers accept nearby jobs. UI is React 18 + Vite + Tailwind; backend is entirely Supabase (Postgres + PostGIS, Auth, Realtime, Storage).

## Three Vite Projects

| App | Path | Port | Users |
|-----|------|------|-------|
| Main app | `src/` | 3000 | Consumers + Washers |
| Support app | `support-app/src/` | 3001 | Agents only |
| Admin app | `admin-app/src/` | 3002 | Super-admins only |

**Agents do not use the main app.** All agent features (queue, chat, approvals, tickets) live exclusively in `support-app/`. Never add agent UI to the main project. **Super-admins do not use the main or support app.** All admin features (content overrides, branding, broadcasts, config knobs, live job control, user management, design editor) live exclusively in `admin-app/`. The admin app is **web-only** — no `capacitor.config.json`, no `android/`, deployed to Vercel only. Auth isolation between the three apps is enforced by distinct Supabase `storageKey`s: main uses the SDK default, support uses `wash-support-auth`, admin uses `wash-admin-auth`. Run all three with `npm run dev:all`.

## Roles

Four roles exist in `profiles.role`:
- `consumer` — books car wash jobs
- `washer` — accepts and performs jobs
- `agent` — support staff; only access `support-app`
- `super_admin` — platform owner/operator; only accesses `admin-app`. Provisioned via the Supabase dashboard + `UPDATE profiles SET role='super_admin'` — there is no public signup. **Does NOT inherit `is_agent()` powers**: `is_super_admin()` (migration 0069) is a distinct security-definer membership check. RLS policies that should also cover super-admins must reference both helpers explicitly.

## Routing and Auth (Main App)

`src/router.jsx` defines routes behind `<RoleGuard>`. `NotificationsInit` renders inside `BrowserRouter` to register push listeners once a user logs in.

**Consumer routes** (inside `ConsumerLayout`):
- `/home` — booking form + active order summary
- `/order/:id` — order tracking page
- `/history` — order history
- `/profile/vehicles` — saved vehicles management
- `/profile/settings` — consumer settings (notifications, appearance/dark mode, language, vehicles link)

**Washer onboarding routes** (accessible while `washer_verification_status` is not `approved`):
- `/signup/washer/verify` — upload ID + live selfie face verification + business license; lazy-loaded. **Selfie flow:** tapping "Start verification" opens `SelfieVerificationModal` (live front camera + face detection loop); a face must be stable and centered for ~1.5 s (45 frames) to auto-capture; frame is uploaded to `washer-verification` bucket inside the modal before the parent form even submits. Detector priority: (1) native `window.FaceDetector` (Chrome Android), (2) MediaPipe `@mediapipe/tasks-vision` lazy-loaded from CDN wasm. If neither is available, modal shows "not supported" and blocks capture.
- `/signup/washer/pending` — waiting screen; auto-navigates to `/washer` via Realtime when approved; shows rejection reason + resubmit button if rejected

**Washer route guard:** `RoleGuard` checks `profiles.washer_verification_status` before allowing washer access. `null` or `pending_documents` → `/signup/washer/verify`; `pending_review` or `rejected` → `/signup/washer/pending`; `approved` → normal routes. `washerVerificationRedirect(status, pathname)` is exported for unit-testing.

**Washer routes** (require `washer_verification_status = 'approved'`):
- `/washer` — map dashboard (inside `WasherMapShell`)
- `/washer/job/:id` — job detail / acceptance (inside `WasherShell`)
- `/washer/earnings` — earnings + tier ladder
- `/washer/shop` — coming-soon placeholder
- `/washer/settings` — preferences (locale, theme, nav app, notifications)

**Shared routes**:
- `/support` — support chat; consumer and washer both land here; agent role also allowed
- `/profile` — profile page (any authenticated role)

**Legacy redirects**: `/washer/support` and `/agent/approvals` both redirect to `/support`.

`src/context/AuthContext.jsx` manages session, user, and profile. Profile is fetched on every login; locale from `profiles.locale` is applied to i18next immediately. `unregisterToken()` is called before `signOut()` to clean up the FCM token.

## Consumer Booking Flow

From `/home` (`src/pages/consumer/Home.jsx`):
1. **Vehicle selection** — `VehiclePickerSheet` loads saved vehicles; pre-selects the default. If none saved, shows `LicensePlatePicker` (plate lookup → data.gov.il CKAN API; manual fallback). Post-booking `SaveVehicleDialog` offers to save the vehicle.
2. **Car photos** — `CarPhotoUpload` captures 4 angles (front/back/driver/passenger); uploaded to `car-photos` bucket.
3. **Location pin** — `LocationSheet` + `MapPicker` let consumer drop a pin; address reverse-geocoded via Nominatim.
4. **Site resources** — toggles for `site_has_water` and `site_has_power`.
5. **Access notes** — free-text field for gate codes, parking instructions, etc.
6. Order is submitted; consumer navigates to `/order/:id` (tracking page).

## Israeli License Plate Lookup

`src/lib/vehicleLookup.js` queries the data.gov.il CKAN API (`{plate}` → make/model/color/year/category). Manual fallback fields shown on lookup failure. `LicensePlatePicker` is a single DOM element (never unmounts the input mid-flow). `formatPlate` formats the raw plate string for display.

**Found-state card** (shown after a successful lookup, before confirmation): plate badge at top, bold make+model line, muted `year · color · category · ₪price` line, Yes/No buttons. Outer card uses `dir="ltr"` (block layout, no flex) to prevent RTL cross-axis issues; individual text `<p>` elements use `dir="auto"` for Hebrew color strings. Strings are pre-computed before JSX to avoid expression edge cases. Category label uses `carLabels.*` i18n keys; price from `priceForCategory()` in `src/lib/pricing.js`.

## Order Tracking (`/order/:id`)

Real-time status via `useRealtimeOrder`. Shows a 5-step progress dot row (requested → assigned → en route → washing → complete). Consumer can:
- Cancel (if `pending` or `accepted`)
- Open in-order chat with washer (`OrderChatSheet`) — read-only once `pending_approval`
- Open support chat (`SupportChatSheet`)

**Rating Modal** appears after `completed` status if not yet rated. Shows 4 completion photos (signed URLs from `job-evidence`) + star picker. Calls `submit_rating` or `skip_rating` RPC.

## Order Chat (`order_messages`)

`src/components/chat/OrderChatSheet.jsx` — consumer↔washer direct messaging within an active order. Writable while status is `accepted`/`en_route`/`arrived`/`in_progress`; becomes read-only at `pending_approval` or later. Both parties read all history after completion. Uses `useOrderUnreadCount` hook for unread badge on the tracking page.

## Washer Dashboard (`/washer`)

`src/pages/washer/Dashboard.jsx` — full-screen map view (`WorkerMap`, lazy-loaded). Key UI:
- **OnlinePill** — avatar + online/offline toggle + `···` menu trigger
- **WasherMenu** — slide-in menu (earnings, shop, settings, support, sign out) with unread support badge
- **JobDrawer** — bottom sheet showing nearby pending jobs; tapping a job navigates to `/washer/job/:id`
- **NavLauncher** — deep-links to Google Maps / Waze after job acceptance
- GPS written to `profiles.current_location` (PostGIS) every 10 s while online

`useNearbyJobs` hook subscribes to realtime order changes and does client-side distance filtering.

## Approval Workflow

When a washer completes a job:
1. Washer uploads 4 arrival photos at the `en_route → arrived` step (stored in `job-evidence`)
2. Washer uploads 4 completion photos and submits GPS → `in_progress → pending_approval`
3. Agent sees the order in support-app Approvals tab
4. Agent reviews photos + washer GPS location card, clicks Approve
5. `transition_order_status` RPC sets status → `completed`, writes `approved_at`/`approved_by`

`ApprovalRow` shows a **previously-declined** banner when `orders.decline_count = 1–2` and an **escalated** banner at `decline_count ≥ 3` (the same threshold that auto-creates a support ticket in `decline_order`). The column comes back via the Approvals select in `support-app/src/lib/approvals.js` — guarded by `scripts/verify-db.js` and the `Approvals.fetch.test.js` contract test.

Legacy `evidence_before_path`/`evidence_after_path` video columns still exist in the DB schema but are never written by the current UI.

## Washer Verification (onboarding)

Consolidated overview of the verification pipeline:

- **Main app upload** — `src/pages/washer/Verify.jsx` collects ID + business license; `src/components/washer/SelfieVerificationModal.jsx` captures the live selfie and uploads it to `washer-verification/{userId}/selfie.jpg` (one path, upserted on retake). The submit handler inserts a `washer_verifications` row pointing at `selfie_path = '{userId}/selfie.jpg'`.
- **Storage bucket** — `washer-verification` (private, 10 MB, jpg/png/webp/pdf). Per-user folder; bucket + RLS created by 0060/0061. RLS policies on `storage.objects`: `washer_upload_own`, `washer_read_own`, `washer_update_own`, `washer_delete_own` (path-prefixed by `auth.uid()`), and `agent_read_all_verification` (`bucket_id = 'washer-verification' AND EXISTS … role='agent'`) — the last is what lets the support-app render selfies. Re-asserted idempotently by 0068.
- **Agent fetch** — `support-app/src/lib/washerVerifications.js` calls the `get_washer_verifications(p_status)` security-definer RPC (added 0062, schema-qualified in 0063) which joins `washer_verifications` with `profiles` and `auth.users` to expose `washer_name` / `washer_phone` / `washer_email` flat columns the support-app needs. Per-doc signed URLs are fetched via `getVerificationSignedUrl` against the `washer-verification` bucket.
- **Agent UI** — support-app **Washer Verifications tab** (`/`, "אימות"); see the support-app Dashboard section below for tab layout.
- **Decision RPC** — `review_washer_verification(p_verification_id, p_decision, p_reason?)` flips the row's status and mirrors to `profiles.washer_verification_status`.

## Support Chat (Main App)

`support_conversations` / `support_messages` is the support chat system. Consumer and washer both reach `/support` from the main app. `SupportChatSheet` is used inline on the tracking page and washer job screen. `useSupportConversation` and `useSupportUnread` / `useChatUnread` manage subscriptions and badge counts.

## Support App (`support-app/`)

Agent-only web app at port 3001. No public signup — create agent accounts via Supabase dashboard with `role='agent'`. Login auto-signs-out non-agents.

Routes: `/login`, `/` (Dashboard), `/conversations/:conversationId`, `/settings`

**Dashboard has four tabs:**

- **Conversations tab** — `QueueList` (left) + `ChatPane` (center) + context panel (right)
  - Queue rows show type label pills (Mine / In treatment / Waiting / General)
  - Clicking a row claims the conversation (if unassigned) and navigates to `/conversations/:id`
  - Right rail shows `OrderPanel` when conversation has a linked order, otherwise `UserPanel`
  - `OrderPanel` — order details + agent Cancel / Mark complete buttons; subscribes to realtime order updates
  - `UserPanel` — opener profile + washer live location card
- **Approvals tab** — `pending_approval` orders with photo review + one-click approve; live badge count
- **Tickets tab** — `support_tickets` list/detail view; auto-created on 1★ rating or manually; `open → in_progress → resolved`; live badge of open count
- **Washer Verifications tab** — pending `washer_verifications` rows; shows ID doc + selfie + business license thumbnails (signed URLs from `washer-verification` bucket); Approve / Reject (with required reason) calls `review_washer_verification` RPC; live badge count
- **Settings** (`/settings`) — agent display name + personal canned responses (create/delete)

**URL-based conversation persistence:** selected conversation is reflected in the URL as `/conversations/:conversationId`. On page load/refresh the Dashboard reads this param and auto-selects the conversation once the queue loads.

## Admin App (`admin-app/`)

Super-admin-only web console at port 3002. Web-only — no Capacitor, no Android project. Vercel Root Directory `admin-app`. Auth isolation via Supabase `storageKey: 'wash-admin-auth'`. No public signup — provision via Supabase dashboard then `UPDATE profiles SET role='super_admin' WHERE id=...`. Login auto-signs-out non-super-admins; suspended super_admins are blocked by AuthContext too (though `admin_suspend_user` refuses to suspend a super_admin in the first place).

Routes: `/login`, `/` (Dashboard with tabs), all tab content rendered in-place.

**Dashboard has seven tabs** (plus the Design Editor):

- **Content tab** — `content_overrides` editor: per-key per-locale edits + per-row reset + JSON export + drift report against bundled i18next resources (`npm run drift:content`).
- **Branding tab** — `app_branding` row editor + `brand-assets` bucket upload. Surfaces an explicit warning when an asset is mobile-baked (icon, splash, monochrome notification icon) and requires a Capacitor rebuild rather than a runtime swap.
- **Broadcasts tab** — composer for EN + HE title/body + optional deep link + segment filter (role, locale, washer tier, online); confirm interstitial showing resolved recipient count; history list with sent/failed counts. Submit calls `trigger_broadcast(id)` which fires `send-broadcast` Edge Function.
- **Config tab** — `app_config` knob editor + `pricing_config` / `payout_tier_config` table editors. `pricing_source` flag is the master switch; see the config note in DATABASE.md.
- **Live Jobs tab (P6)** — full order control: realtime job list, force-status (calls `transition_order_status` with `p_admin_override=true`), reassign washer (`admin_reassign_washer`), override price/payout (`admin_override_order_price`), edit/replace photos (audited via `admin_log_photo_replacement`), manually create orders on behalf of a consumer (`admin_create_order_for_consumer`). Every write audited to `admin_order_audit`.
- **Users tab (P7)** — view/edit profile, suspend/unsuspend (`admin_suspend_user` / `admin_unsuspend_user`), merge accounts (`admin_merge_users`), delete (via `admin-user-mgmt` Edge Function — needs service role), impersonate (`admin_create_impersonation_token` → URL passed to main app's `impersonate-redeem` Edge Function). Activity tab reads `admin_user_activity`. Every write audited to `admin_user_audit`.
- **History tab (ADR-028)** — `admin-app/src/pages/History.jsx`: one chronological feed across all admin sections via `get_admin_activity_feed` (live-updating on `admin_change_history` INSERT), with filter pills (All / Content / Branding / Config / Design / Orders / Users / Broadcasts). Override edits show a before→after diff and a one-click **Undo** (`admin_undo_change`, conflict- + pricing-guarded); deleted users show a **Restore (best-effort)** button (warning + type-email confirm → `admin-user-mgmt` `restore_user`); everything else is a muted "Not reversible" log entry. Wrappers in `admin-app/src/lib/adminHistory.js`.

**Impersonation flow:** admin issues a one-time token in Users tab → opens main app with `?impersonate=<token>` → main app calls `impersonate-redeem` Edge Function which validates the hash + expiry + consumed_at, swaps the session, marks `consumed_at` → main app shows a persistent amber banner identifying both the originator (admin) and the impersonated user. All subsequent writes are audited with both identities (originator + actor).

**Suspension takeover:** all three apps' `AuthContext` re-checks `profiles.suspended_at` on every profile fetch. A non-null value triggers immediate `signOut()` and renders a takeover screen with the `suspended_reason`. Super_admin role is exempt at the RPC layer (`admin_suspend_user` raises if `target.role='super_admin'`) — there is no admin → admin lockout path.

## Live Design Editor (P8)

Tap-to-edit visual override system for a registered set of component surfaces in the main + support apps. Reference: ADR-027.

- **Manifest** — `admin-app/src/data/editableManifest.json` enumerates every editable surface by id (currently 20: 7 consumer + 6 washer + 7 support). New ids require a manifest entry AND a code-side `<Editable id="…">` wrapper.
- **Render path** — `<Editable id="…" defaults={...}>` HOC in `src/components/editable/` (main) and `support-app/src/components/editable/` (support) reads `DesignOverridesContext` (provider loads `design_overrides` on boot from `src/lib/designOverrides.js` and subscribes to Realtime changes) and applies overrides as inline styles on the wrapper. No JSX structural change — overrides are visual only.
- **Edit mode** — entered via `?design_edit=1` (sets a sessionStorage flag) when the current session is super_admin. In edit mode, `<Editable>` becomes click-targetable and dispatches a `design-edit-open` CustomEvent that `DesignEditOverlay` listens for; the overlay slides in a per-surface inspector. The planned server-validated edit-token redeem (`design-edit-token-redeem`) was NOT built — real protection is RLS on `design_overrides` + the bound-validating `admin_set_design_override` RPC (caps: padding 0–48 px, text_size 0.7–1.5×, radius 0–32 px, offset ±100 px). The `121212` password gate on the admin Design Editor tab (`admin-app/src/pages/DesignEditor.jsx`) is a soft accidental-entry guard, **NOT security** — don't rely on it.
- **Non-goals** — no JSX structural changes; no absolute repositioning; no editing of SVG components (`WashMark`, `MapBG` stay code); the editor does not edit the admin app itself.

## Push Notifications

FCM push via Supabase Edge Functions + DB triggers. Full architecture (delivery path, token flow, send path, deep links, channels, broadcasts, sounds, secrets) is in **NOTIFICATIONS.md**.

## Realtime

Supabase Realtime channels drive live UX:
- `order:{orderId}` — consumers and washers watch order status changes (`useRealtimeOrder`)
- `order-panel-{orderId}` — support-app `OrderPanel` subscribes to UPDATE events on the linked order
- `approvals-view` — support-app Approvals tab subscribes to order UPDATE events
- `tickets-view` / `ticket-badge` — support-app Tickets tab
- `pending-badge` — support-app pending approval count badge
- Washer GPS written to `profiles.current_location` (PostGIS) every 10 s when online; `last_lat`/`last_lng`/`last_location_at` also written
- support-app subscribes to `profiles` row changes to show live washer location in Approvals and `UserPanel`

## Mobile (Capacitor)

`capacitor.config.json` wraps the `dist/` web build as `com.sparklego.app`. `src/hooks/useGeolocation.js` falls back to Capacitor's native geolocation API when the browser API is unavailable. Build APK via `update.ps1` or Android Studio; output is `wash-latest.apk` in the project root. The APK (and the support APK) both carry the `content_overrides` + `design_overrides` loaders, so admin edits propagate to native users on next app open without requiring a Play Store push.

## Support App Deployment

The support-app deploys **two ways**: Vercel (web) and Capacitor (Android APK). Both are independent from the main app.

**Vercel (web):**
- Separate Vercel project pointing at the same GitHub repo, with **Root Directory = `support-app`**
- `support-app/vercel.json` configures build command, output dir, and SPA rewrites
- Env vars: same `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` as main app
- Auth isolation: Supabase client uses `storageKey: 'wash-support-auth'` to prevent token collisions
- A push to `main` triggers all three Vercel projects (main + support + admin) in parallel; no interference
- See `support-app/README.md` for one-time Vercel dashboard setup steps. The admin app follows the same pattern with Root Directory `admin-app` and `storageKey: 'wash-admin-auth'`; admin has no Android/Capacitor pipeline.

**Capacitor (Android):**
- **appId:** `com.sparklego.support` (main app is `com.sparklego.app`)
- All artifacts live in `support-app/`: config at `support-app/capacitor.config.json`, Android project at `support-app/android/`
- **Build:** `cd support-app && npm run android:sync` then `cd android && gradlew assembleDebug`
- **Output:** `support-app/android/app/build/outputs/apk/debug/app-debug.apk`
- **Deploy shortcut:** `.\update.ps1 "msg" -Support` builds both main and support APKs; copies to `wash-support-latest.apk` in repo root
- Does NOT share `android/` with the main app — never modify root `android/` for support-app changes
- Push notifications: scaffolded in `support-app/src/lib/pushInit.js` but not fully wired — needs `google-services.json` and Firebase project setup

## Dark Mode

`darkMode: 'class'` in Tailwind config — the `.dark` class must be applied explicitly to an ancestor `div`. **Both consumer and washer** can toggle dark mode (ADR-023); washer defaults to dark, consumer defaults to light when `display_preference` is unset.

`useTheme()` returns `{ isDark, theme, setTheme }` and reads/writes `profiles.display_preference`. It does **not** touch the DOM — the shell component is responsible for applying `.dark`. Canonical shell pattern:
```jsx
const { isDark } = useTheme()
return <div className={`${isDark ? 'dark ' : ''}h-full bg-surface text-ink`}>
```

Applied in: `ConsumerLayout` (consumer inner routes), `WasherMapShell`, `WasherShell`, `Support.jsx`, `Profile.jsx`.

## Shared Settings Components

- `src/hooks/useLocale.js` — reads `profile.locale`, writes `profiles.locale` via Supabase + calls `i18n.changeLanguage`. Used by both consumer and washer settings pages.
- `src/components/settings/PillRow.jsx` — animated horizontal pill selector (Framer Motion `LayoutGroup`). Props: `groupId`, `options [{value, label}]`, `value`, `onChange`. Used for Language, Display, Navigation in washer/Settings and Language in consumer/Settings.
- `src/components/settings/NotificationsSection.jsx` — OS permission state + master enabled toggle + sound picker. Shared between consumer `/profile/settings` and washer `/washer/settings`. Uses `upsert` on `notification_preferences`.
- `src/components/settings/AppearanceSection.jsx` — dark/light mode toggle. Consumer-only (washer Settings uses `PillRow` + `GridPill` for Display directly).
- `src/lib/format.js` — `toTitleCase(name)` utility for display names.

**Washer Settings (`/washer/settings`) note:** contains a local `GridPill` component (2×2 grid, used for the ringtone section) that depends on a module-level `const SPRING = { type: 'spring', stiffness: 300, damping: 30 }`. **Do not remove this constant during refactors** — it is not imported from `PillRow`.

## Tests

Main-app suite lives under `src/**/__tests__/` and `src/__tests__/`; support-app suite under `support-app/src/__tests__/`; admin-app suite under `admin-app/src/__tests__/`. All three use Vitest + jsdom + Testing Library.

`src/test/setup.js` is the global Vitest setup file (loaded via `vite.config.js`'s `test.setupFiles`). It imports `@testing-library/jest-dom` and runs a global `beforeEach` that clears `sessionStorage` and `localStorage`. **The reset exists because `SignUp.jsx` (and other surfaces) persist a draft to storage on every render; without the reset, state leaks across tests and reproduces hard-to-trace failures (see the washerSignup pollution incident). Don't remove it** — write per-test seeding instead if a test genuinely needs persisted storage.

The Approvals / Verification / nearby_jobs / state-machine contracts have dedicated regression guards: `scripts/verify-db.js` (column + RLS + return-shape assertions), `support-app/src/__tests__/Approvals.fetch.test.js` (select-string contract), `src/__tests__/useNearbyJobs.test.jsx` (lat/lng pass-through), `src/__tests__/nearbyJobsShape.contract.test.js` (latest-migration return shape), `src/__tests__/transitionOrderStatus.stateMachine.test.js` (transition matrix + gates), `src/__tests__/declineOrder.contract.test.js` (decline path), and `scripts/verify-live-surfaces.js` (end-to-end live DB checks). The SQL-parsing guards use `src/__tests__/helpers/migrations.js` to locate the latest migration defining each function.

## i18n

**Main app:** `i18next` with English and Hebrew. Locale persisted in `localStorage` and stored on `profiles.locale`. Loaded in `src/main.jsx` before React renders. Locale files in `src/i18n/locales/en.json` and `he.json`. **Storage key is `wash_locale_v2`** (Jun 2026) — deliberately a fresh key with NO migration from `wash_locale`/`sparklego_locale`: SparkleGo-era devices had `'en'` persisted by the old default, which kept whole devices (and via `syncLocale` write-back, profiles) in English forever. Old keys are deleted on boot; every device starts in Hebrew unless the user explicitly picks English (which writes the v2 key). Don't reintroduce a migration from the old keys.

**Support app:** i18n resources defined inline in `support-app/src/main.jsx` (no separate locale files). `fallbackLng: 'he'`. Locale key in localStorage: `support_locale`.

**Admin app:** same `i18next` setup; resources live under `admin-app/src/i18n/`. Locale key in localStorage: `admin_locale`.

**Runtime override layer (all three apps):** the shared module `src/lib/contentOverrides.js` exports `loadOverrides({ supabase, app, locale, i18n })` and `subscribeContentOverrides({ supabase, app, i18n })`. Both peer apps import it via relative path (`../../../src/lib/contentOverrides.js`) — `support-app/vite.config.js` and `admin-app/vite.config.js` both set `server.fs.allow: ['..']` so the dev server can resolve it outside the project root. On boot each app calls `loadOverrides` (hydrates from a stale-while-revalidate `localStorage` cache keyed `wash_content_overrides:v1:<app>:<locale>`, then fetches `content_overrides` rows for that `(app, locale)` and deep-merges them over the bundled bundle via `addResourceBundle`) then `subscribeContentOverrides` (Realtime channel on `content_overrides`; refetches the affected `(app, locale)` on any change). Admin edits in the Content tab — no redeploy needed, web users see changes on next reload, APK users on next app open.

## Vite Code Splitting

**Main app** (`vite.config.js`): manually chunks `leaflet`, `framer-motion`, and `@supabase/supabase-js`.

**Support app** (`support-app/vite.config.js`): same chunks plus `leaflet` for the `MiniMap` component used in Approvals and the chat `UserPanel`.

**Admin app** (`admin-app/vite.config.js`): chunks `framer-motion`, `@supabase/supabase-js`, and `leaflet` (used by Live Jobs map preview).
