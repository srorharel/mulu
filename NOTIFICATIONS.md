# WASH — Push Notifications Architecture

> Status: Step 7 complete — Edge Function and triggers written. Step 8 (smoke test plan) pending.

---

## Delivery Path

**v1: Capacitor native only.**

Push notifications are delivered exclusively through the Capacitor native build (`com.sparklego.app`). PWA users (browser-only) receive no push notifications in v1.

Rationale: Web Push on iOS PWA requires iOS 16.4+ and a `start_url` scope match, is unreliable in practice, and adds significant complexity. Not worth the complexity for v1 with an existing native build path.

**PWA fallback:** When the app detects it is running as a PWA (not native Capacitor — `Capacitor.isNativePlatform() === false`), the Notifications section in Settings shows:

> "Install the MULU app to receive notifications"

No toggle, no sound picker, no permission prompt on PWA.

---

## Token Flow

```
Device boots app (Capacitor native)
  └─▶ initNotifications() called on App mount
        └─▶ PushNotifications.requestPermissions()
              ├─ denied  →  stop; surface denied state in Settings
              └─ granted →  PushNotifications.register()
                              └─▶ registration event fires with FCM token
                                    └─▶ supabase
                                          .from('device_tokens')
                                          .upsert({ user_id, token, platform, last_seen_at })
                                          on conflict (user_id, token) do update last_seen_at
```

On logout: `unregisterToken()` deletes the current device's row from `device_tokens` before the Supabase session is cleared.

Token refresh: FCM may rotate tokens. The `registration` event can fire again with a new token. `upsert` handles this transparently — old token row is untouched, new one is inserted.

---

## Send Path

**Decision: Postgres triggers calling a Supabase Edge Function via `pg_net`.**

Rationale over client-side Edge Function calls:
- Triggers fire regardless of which client originates the event (consumer app, washer app, support-app agent, or a future admin script).
- No client-side code duplication — the notification send logic lives in exactly one place.
- Atomic with the database write: if the status transition commits, the notification fires. No risk of the client crashing between the RPC call and a follow-up notification call.
- `pg_net` sends the HTTP request asynchronously (non-blocking), so trigger overhead on the `orders` UPDATE is negligible.

Trade-off acknowledged: `pg_net` requires the extension to be enabled in the Supabase project and the Edge Function URL + service role JWT to be configured as a database secret (or hardcoded, which is worse). This is a one-time setup step, documented in Step 7.

**Send path diagram:**

```
DB event (orders UPDATE / order_messages INSERT)
  └─▶ Postgres trigger function
        └─▶ pg_net.http_post(edge_function_url, payload, service_role_jwt)
              └─▶ supabase/functions/send-notification/index.ts
                    ├─▶ check notification_preferences.enabled
                    ├─▶ fetch device_tokens for user
                    ├─▶ build FCM HTTP v1 payload
                    │     ├─ title/body (localized from profiles.locale)
                    │     ├─ sound (from notification_preferences.sound)
                    │     └─ data.route (deep link target)
                    ├─▶ POST to FCM HTTP v1 API
                    └─▶ insert into notification_log
```

---

## Deep Link Strategy

Notification payloads include a `data.route` field. On notification tap (`pushNotificationActionPerformed`), the app reads `data.route` and navigates to it. If `route` is absent, fall back by `data.event_type`.

### Route Map

| Event type | Recipient | `data.route` | Notes |
|---|---|---|---|
| `order_accepted` | consumer | `/order/{order_id}` | Opens order tracking |
| `washer_on_way` | consumer | `/order/{order_id}` | Opens order tracking |
| `washer_arrived` | consumer | `/order/{order_id}` | Opens order tracking |
| `wash_completed` | consumer | `/order/{order_id}` | Opens order tracking; rating modal auto-surfaces when `status = pending_approval` via existing `ConsumerLayout.jsx` realtime effect — **no new route needed** |
| `order_approved` | washer | `/washer/job/{order_id}` | Washer job detail |
| `order_cancelled` | consumer | `/order/{order_id}` | Order was cancelled by washer/agent/system |
| `order_cancelled` | washer | `/washer` | Washer dashboard (job is gone; only when agent/system cancelled) |
| `customer_cancelled` | washer | `/washer` | Washer dashboard (consumer cancelled after acceptance) |
| `new_chat_message` (to consumer) | consumer | `/order/{order_id}` | Chat sheet is accessible from order tracking |
| `new_chat_message` (to washer) | washer | `/washer/job/{order_id}` | Chat sheet is accessible from job drawer |
| `new_job_nearby` | washer | `/washer` | *(deferred — see Known Follow-ups)* |

### Cancellation Branching

When `orders.status` transitions to `'cancelled'`, the trigger reads `cancelled_by` and `washer_id` to determine who is notified. The trigger must handle the `NULL` (legacy pre-migration) case explicitly.

| `cancelled_by` | `washer_id` state | Notify consumer | Notify washer | Event type sent |
|---|---|---|---|---|
| `'consumer'` | NULL | No | No | None — no washer assigned, nothing to send |
| `'consumer'` | NOT NULL | No | Yes | `customer_cancelled` |
| `'washer'` | NOT NULL | Yes | No | `order_cancelled` |
| `'agent'` | NULL | Yes | No | `order_cancelled` |
| `'agent'` | NOT NULL | Yes | Yes | `order_cancelled` (both) |
| `'system'` | NULL | Yes | No | `order_cancelled` |
| `'system'` | NOT NULL | Yes | Yes | `order_cancelled` (both) |
| NULL (legacy row) | any | No | No | Skip — log warning with `error = 'cancelled_by_null_legacy'` |

`order_cancelled` is used for both washer-initiated and agent/system-initiated cancellations. The user-facing notification body copy distinguishes them: the Edge Function receives `cancelled_by` in the `data` payload and renders different title/body strings (`"Your washer cancelled"` vs `"Your order was cancelled by support"`). The `event_type` is the same; the copy differs.

`customer_cancelled` is used exclusively when a consumer cancels an order that a washer had already accepted (i.e. the washer needs to be told the job is gone).

This branching logic lives entirely in the Postgres trigger function (`notify_on_order_change`). The Edge Function receives pre-computed `(user_id, event_type, data)` tuples; it does not re-evaluate cancellation branching.

### cancelled_by Population Strategy

**Decision: option (b) — infer from `auth.uid()` inside `transition_order_status`.**

The security-definer RPC already has access to `auth.uid()`. Migration 0042 modifies `transition_order_status` to set `cancelled_by` when `new_status = 'cancelled'`:

```sql
cancelled_by = CASE
  WHEN new_status = 'cancelled' THEN
    CASE v_actor_role
      WHEN 'consumer' THEN 'consumer'
      WHEN 'washer'   THEN 'washer'
      WHEN 'agent'    THEN 'agent'
      ELSE NULL  -- auth.uid() is null (system call) → trigger treats as legacy-skip
    END
  ELSE cancelled_by
END
```

No client-side changes required. The `'system'` value is intentionally unreachable via this RPC (system calls have no session, so `auth.uid()` is null → `v_actor_role` is null → `cancelled_by` stays null). If a future system process needs to cancel orders, it would set `cancelled_by = 'system'` explicitly via service role SQL. The trigger's null-guard covers both legacy rows and null-actor system calls identically for now.

**Rating deep link note:** `/order/{id}/rate` does not exist as a route and does not need to be created. The consumer rating modal (`RatingModal`) is rendered by `ConsumerLayout.jsx` via a `useEffect` that watches for realtime `pending_approval` status transitions. Tapping the `wash_completed` notification navigates to `/order/{id}` (OrderTracking); if the order is still in `pending_approval`, the modal appears automatically. If the consumer already rated, it does not appear. This is the correct existing behavior.

---

## Sound Delivery

Custom sounds are bundled with the native build.

**Android:**
- Sound files placed in `android/app/src/main/res/raw/`
- Named: `chirp.mp3`, `chime.mp3`, `bell.mp3`, `gentle.mp3`
- FCM payload field: `android.notification.sound` → filename without extension (e.g. `"chime"`)
- Android ignores the extension; the file must be in `res/raw/`
- Note: internal identifier is `chirp` (not `default`) because `default` is a reserved Java keyword — Android cannot generate an `R.raw.default` constant and the build fails at `mergeDebugResources`.

**iOS (deferred — `ios/` folder does not yet exist):**
- Sound files placed in `ios/App/App/`
- APNs payload field: `aps.sound` → filename with extension (e.g. `"chime.mp3"`)
- Files must be added to the Xcode project bundle (not just the filesystem)

**`ringtone_preference` vs `notification_preferences.sound` — these are two distinct settings:**

| Setting | Column | Location | Scope |
|---|---|---|---|
| In-app new-job ping | `profiles.ringtone_preference` | Washer Settings | Sound played inside the running app when a new nearby job appears. Browser `Audio` API or Howler. Washer-only. |
| OS push notification sound | `notification_preferences.sound` | Notifications section (both roles) | Sound the OS plays for a push notification when the app is backgrounded or closed. FCM/APNs field. Both roles. Allowed values: `chirp`, `chime`, `bell`, `gentle` (display labels: Default, Chime, Bell, Gentle). |

These have different lifecycles: the in-app ping plays only when the washer has the app open; the push notification sound plays when the app is closed. Do not merge them.

---

## OS Permission Handling

Three-state model surfaced in the Notifications settings section:

| OS State | `getOsPermissionState()` returns | UI shown |
|---|---|---|
| User has not yet been asked | `'prompt'` | "Enable notifications" button → calls `requestPermissions()` |
| User explicitly denied (or revoked in system settings) | `'denied'` | "Notifications are disabled in your phone settings" + "Open Settings" button (deep link to system notification settings). Master toggle is disabled. |
| User granted | `'granted'` | No message. Master toggle and sound picker are active. |

The master toggle (`notification_preferences.enabled`) is independent of OS permission. A user can have OS permission granted but choose to disable notifications inside the app. Conversely, they cannot enable the app toggle if OS permission is denied — the toggle is rendered disabled in that case.

---

## Settings UI Location

The `<NotificationsSection />` component is rendered in two places:

1. `/profile` (`src/pages/Profile.jsx`) — consumer
2. `/washer/settings` (`src/pages/washer/Settings.jsx`) — washer

One component, two render sites. The component reads the user's role from `AuthContext` only if role-specific copy differs; functionally both roles get the same controls.

---

## Schema Summary (Step 3)

Three new tables:

| Table | Purpose |
|---|---|
| `device_tokens` | One row per (user, device). Stores FCM registration token. |
| `notification_preferences` | One row per user. `enabled` toggle + `sound` picker. Auto-inserted on user creation via trigger. |
| `notification_log` | Append-only send log. Service role only. Used to debug "I didn't get a notification" complaints. |

One new column on `orders`:

| Column | Type | Notes |
|---|---|---|
| `cancelled_by` | `text nullable` | `check (cancelled_by in ('consumer','washer','agent','system'))`. Set by `transition_order_status` at cancel time. No backfill. |

---

## Known Follow-ups (Out of Scope for This Phase)

### Support-App Agents and Push Notifications

Support-app agents do not register push notification tokens. The support-app sibling project (`support-app/`) uses its own `AuthContext` and does not import the notifications library. This is intentional: agents work in a browser on the support dashboard, not a phone. If a future product decision requires agent push notifications, the support-app needs its own initialization path (its own `initNotifications` call wired to its own `AuthContext.signOut`).

### Orphan-Token Edge Case (v2)

`Profile.jsx` signOut is fire-and-forget (`onClick={signOut}` without `await`). On slow networks with rapid app-close, the token cleanup network call (`unregisterToken`) may not complete before the process is killed, leaving an orphan row in `device_tokens`. Low impact — next login upserts a fresh row and FCM rotates the old token anyway — but worth fixing by making the consumer signOut button properly async/await. Defer to a separate UX polish pass.

### New Job Nearby (washer notification on new pending order)

Deferred. This event differs from all others because it requires a geo-query (which washers are within radius of the new order?) combined with an online-only filter (`profiles.is_online = true`). Implementing this inside a Postgres trigger is possible using `pg_net` fan-out (one HTTP call per eligible washer), but it requires:

1. A trigger on `orders` INSERT (not UPDATE).
2. A spatial query against `profiles.current_location` to find nearby online washers.
3. Sending one notification per washer — potentially many concurrent `pg_net` calls.

Design options for the follow-up phase:
- Single Edge Function that does the spatial query internally and fans out.
- `pg_net` bulk call from the trigger (requires pg_net supporting parallel calls cleanly).

Recommended: implement as a separate Edge Function called from the `orders` INSERT trigger, with the spatial query inside the function rather than inside the trigger body.

**Document the `route` for this event:** `data.route = '/washer'` (washer dashboard). The washer taps the notification and the dashboard's `useNearbyJobs` hook will already show the new job.

### Per-Event Notification Toggles

Deferred. v1 has one master on/off toggle only.

### Web Push (PWA)

Deferred. See Delivery Path rationale above.

### Notification History Screen

Deferred. `notification_log` data exists but no UI to surface it.

### iOS Native Build

Deferred until `ios/` folder is initialized via `npx cap add ios`. When that happens:
1. Create Firebase project app for iOS bundle ID `com.sparklego.app`.
2. Download `GoogleService-Info.plist` → place in `ios/App/App/`.
3. Enable Push Notifications capability in Xcode (Signing & Capabilities tab).
4. Configure APNs key in Firebase Console (Apple Developer account required).
5. Add sound files to Xcode project bundle.

### Notification Badge Count

Deferred. Badge count (the number shown on the app icon) requires tracking unread notification count server-side and sending it in the FCM `notification.badge` field (iOS) or managing via `ShortcutBadge` plugin (Android). Not implemented in v1.

---

## Security Notes

- `google-services.json` — **never commit**. Add to `.gitignore` under `android/app/`.
- `GoogleService-Info.plist` — **never commit**. Add to `.gitignore` under `ios/App/App/` when that folder exists.
- FCM service account JSON — **never commit**. Stored exclusively as Supabase Edge Function secret (`FCM_SERVICE_ACCOUNT_JSON`).
- Edge Function verifies that inbound requests carry the Supabase service role JWT before processing. No unauthenticated notification sends.
- Migration 0042 also retroactively added `SET search_path = public, pg_temp` to `transition_order_status`, which migration 0023 had been missing. Latent search-path injection risk closed in passing.

### Firebase / google-services.json Setup (Android)

`google-services.json` is never committed. Follow these steps once to wire FCM:

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and create a new project (or reuse an existing one).
2. Inside the project, click **Add app → Android**.
3. Register the package name exactly as: **`com.sparklego.app`**
   — This matches `appId` in `capacitor.config.json`. The display name is now `MULU` (SparkleGo → Wash → MULU); the package ID was deliberately left unchanged for install-update continuity on existing devices.
4. Download `google-services.json` and place it at:
   ```
   android/app/google-services.json
   ```
5. The `android/app/build.gradle` conditional plugin block is already in place — it activates automatically when the file exists:
   ```groovy
   try {
     def servicesJSON = file('google-services.json')
     if (servicesJSON.text) {
       apply plugin: 'com.google.gms.google-services'
     }
   } catch(Exception e) { ... }
   ```
   No Gradle edits required.
6. In the Firebase Console, go to **Project Settings → Cloud Messaging** and enable the **FCM API (V1)**. Download the service account JSON (used by the Edge Function in Step 7).

**`.gitignore` note:** `android/app/google-services.json` is not currently excluded by pattern in `.gitignore`. After placing the file, add the line manually (see Step 4 output — the current `.gitignore` covers only `node_modules`, `dist`, `.env*`, `.DS_Store`, `*.log`, `*.local`). The line to add:
```
android/app/google-services.json
```

### Service Role JWT for pg_net Triggers

Postgres trigger functions need the service role JWT to authenticate `pg_net.http_post` calls to the Edge Function. The key is stored as a database-level setting so trigger functions can read it without embedding it in migration SQL.

**One-time setup (run once against your Supabase Postgres instance):**

```sql
ALTER DATABASE postgres
  SET app.settings.service_role_key = '<your-supabase-service-role-key>';
```

Run this via the Supabase SQL editor or `psql` with the direct `DATABASE_URL`. The value persists across connections. It is not stored in migration files and is not committed to git.

Trigger functions read it at call time:

```sql
current_setting('app.settings.service_role_key')
```

**Why `ALTER DATABASE SET` rather than Supabase secrets?** Edge Function secrets are available to Deno functions via `Deno.env.get()`. They are not accessible from Postgres trigger functions, which run inside the database process. `ALTER DATABASE SET` is the standard Supabase pattern for passing configuration to security-definer functions. The setting is instance-scoped (not schema-scoped), so it survives migrations but must be re-applied if the database is restored from a backup that predates the `ALTER DATABASE`.

**Setup checklist:**
1. `ALTER DATABASE postgres SET app.settings.service_role_key = '...'` — run once in SQL editor.
2. `supabase secrets set FCM_SERVICE_ACCOUNT_JSON='...'` — run via Supabase CLI for the Edge Function.
3. `supabase secrets set SUPABASE_URL='https://your-project.supabase.co'` — Edge Function needs this to call back to Supabase if needed.
4. Add `android/app/google-services.json` to `.gitignore`.

---

## Files Introduced by This Feature

```
src/lib/notifications.js              Client-side init / token registration / nav handler
src/components/settings/NotificationsSection.jsx   Shared settings UI component
src/i18n/locales/en.json              + notifications.* keys
src/i18n/locales/he.json              + notifications.* keys
supabase/migrations/0042_notifications.sql         device_tokens, notification_preferences, notification_log, cancelled_by column
supabase/migrations/0043_notification_triggers.sql Postgres triggers + pg_net calls
supabase/functions/send-notification/index.ts      Edge Function: FCM send + log
android/app/src/main/res/raw/         Placeholder sound files (default, chime, bell, gentle)
NOTIFICATIONS.md                      This file
```

---

## Current Implementation (post-v1)

> The sections above are the original v1 design. The notes below capture what was built since (fan-out, broadcasts, promo opt-in, the 4 named Android channels, the expanded event set, and the required secrets), merged from CLAUDE.md. Where they differ from v1 above, these are authoritative.

FCM push is delivered via three Supabase Edge Functions (`send-notification`, `fan-out-nearby-job`, `send-broadcast`) plus auxiliary admin helpers (`impersonate-redeem`, `admin-user-mgmt`). Native Capacitor only — web/PWA shows an inline toast for foreground notifications but does not register push tokens.

### `send-notification` (`supabase/functions/send-notification/index.ts`)
- Accepts `{ user_id, event_type, data }` from DB triggers (authenticated via `TRIGGER_SECRET`)
- Checks `notification_preferences` (user opt-in) and `device_tokens` (FCM tokens)
- Resolves locale from `profiles.locale`, picks i18n copy from an inline COPY map
- Sends FCM HTTP v1; caches OAuth2 access token for 50 min across warm instances
- Deletes dead tokens (`UNREGISTERED`/`INVALID_ARGUMENT`) automatically
- Logs every attempt to `notification_log`

### `fan-out-nearby-job` (`supabase/functions/fan-out-nearby-job/index.ts`)
> Note: v1 listed "New Job Nearby" as a deferred follow-up — it is now implemented.
- Called by `trg_notify_on_new_order` (single `net.http_post` per new order INSERT)
- Calls `find_nearby_washers_for_order` RPC (default 15 km, configurable via `NEARBY_JOB_RADIUS_METERS`)
- Batch-inserts into `order_washer_notifications` (dedup), then calls `send-notification` once per eligible washer
- Re-run safe: already-notified washers excluded by the dedup table

### `send-broadcast` (`supabase/functions/send-broadcast/index.ts`)
- Called by `trigger_broadcast` RPC (super_admin only) via `net.http_post`; auth via `TRIGGER_SECRET`
- Idempotency: rejects if the broadcast row's `sent_at` is non-null
- Rate limit: rejects if any other broadcast was sent in the previous 10 minutes
- Calls `resolve_broadcast_segment(id)` (0091 lets service_role through) → list of `user_id`s
- `Promise.allSettled` POSTs `send-notification` per user with `event_type='admin_broadcast'` and title/body/route in `data`
- Updates `sent_count` / `failed_count` / `sent_at` on the broadcast row

### Supported event types
`order_accepted`, `washer_on_way`, `washer_arrived`, `wash_completed`, `wash_pending_review`, `wash_complete_consumer`, `wash_declined`, `order_approved`, `order_cancelled`, `customer_cancelled`, `new_chat_message`, `new_job_nearby`, `support_message`, `support_resolved`, `tier_changed`, `admin_broadcast`

### Promo opt-in (0073)
`notification_preferences.promos_enabled` is a SEPARATE opt-in for `admin_broadcast`. `send-notification` short-circuits with `event_type='admin_broadcast' AND promos_enabled=false`. The transactional `enabled` flag still gates everything else — turning off promos does NOT silence order/support notifications. `NotificationsSection.jsx` renders a second toggle below the master one.

### DB triggers
- `trg_notify_on_order_change` (orders UPDATE, status change) → `pending_approval`: notifies washer (`wash_pending_review`); `completed`: notifies washer (`order_approved`) + consumer (`wash_complete_consumer`); `in_progress` from `pending_approval` (decline): notifies washer (`wash_declined`); `cancelled`: branches by `cancelled_by`
- `trg_notify_on_new_order` (orders INSERT) → `fan-out-nearby-job`
- `trg_notify_on_support_message` (support_messages INSERT, agent/system sender only)
- `trg_notify_on_support_resolution` (support_conversations UPDATE, first terminal transition only)
- `trg_notify_on_tier_change` (profiles UPDATE, non-null tier change only)

### Client side (`src/lib/notifications.js`)
- `initNotifications({ navigate, showToast })` — called once on login by `NotificationsInit` in the router; creates 4 Android notification channels (`wash_chirp`, `wash_chime`, `wash_bell`, `wash_gentle`) before `PushNotifications.register()`; upserts token into `device_tokens`
- `unregisterToken()` — deletes the FCM token from DB on sign-out
- `getOsPermissionState()` — returns `'granted'|'denied'|'prompt'|'web'`

### Notification sounds (channel routing)
Options: `chirp`, `chime`, `bell`, `gentle`. MP3 files in `public/sounds/{name}.mp3` (web preview) and `android/app/src/main/res/raw/{name}.mp3` (native). Stored in `notification_preferences.sound`; picked in the `NotificationsSection` component (shared by consumer `/profile/settings` and washer `/washer/settings`). The Edge Function sets `channel_id: wash_${sound}` so Android routes to the pre-created channel with the correct sound URI. Android O+ requires channel sound to be set at creation time — the 4 channels are created idempotently on every app init.

### Required secrets
- **Vault secrets:** `edge_function_url`, `service_role_key`, `fan_out_nearby_job_url`
- **Edge Function secrets:** `TRIGGER_SECRET`, `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_JSON`, `NEARBY_JOB_RADIUS_METERS`
