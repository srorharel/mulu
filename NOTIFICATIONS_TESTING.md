# WASH — Push Notifications Smoke Test Plan

> This document covers manual testing only. Execution requires a real Android device, a configured Firebase project, deployed Edge Function, and configured database settings. None of that is required to read this document — it is written before those prerequisites exist so QA can plan work in parallel.

---

## Section 1 — Prerequisites

Complete in order. Each step depends on the previous.

---

### 1a — Firebase project + Android app

**Who:** Developer, in Firebase Console.

**What to do:**
1. Go to [console.firebase.google.com](https://console.firebase.google.com) and create a new project (or reuse an existing one).
2. Inside the project: **Add app → Android**.
3. Package name: **`com.muluwash.app`** — must match exactly (this is the `appId` in `capacitor.config.json`; the display name "MULU" is separate).
4. Nickname: "MULU Android" (optional).
5. Skip the SHA-1 step for now (only needed for Google Sign-In, not FCM).
6. Click **Register app**.

**How to verify:** Firebase Console shows the app listed under Project Settings → General → Your apps.

---

### 1b — google-services.json

**Who:** Developer.

**What to do:**
1. In Firebase Console, on the app registration screen (or later via Project Settings → General → Your apps → download icon), download `google-services.json`.
2. Place it at: `android/app/google-services.json`
3. This path is already in `.gitignore` — do not commit it.

**How to verify:**
```bash
# File exists
ls android/app/google-services.json

# Contains correct package name
python3 -c "import json; d=json.load(open('android/app/google-services.json')); print([c['client_info']['android_client_info']['package_name'] for c in d['client']])"
# Should print: ['com.muluwash.app']
```

---

### 1c — Firebase service account JSON (for Edge Function)

**Who:** Developer, in Firebase Console. This is a **different file** from `google-services.json`.

**What to do:**
1. Firebase Console → Project Settings → **Service accounts** tab.
2. Click **Generate new private key** → **Generate key**.
3. A JSON file downloads. Do not place it anywhere in the repo — it contains a private RSA key.
4. Keep it locally for the next step only. Delete it after setting the Supabase secret.

**How to verify:** The downloaded JSON contains fields `"type": "service_account"`, `"private_key"`, and `"client_email"`.

---

### 1d — Supabase secrets

**Who:** Developer, via Supabase CLI (must be authenticated: `supabase login`).

**What to do** — run from the repo root:
```bash
# FCM project ID — visible in Firebase Console → Project Settings → General → Project ID
supabase secrets set FCM_PROJECT_ID=<firebase-project-id>

# Paste the full contents of the service account JSON as a single string
supabase secrets set FCM_SERVICE_ACCOUNT_JSON="$(cat /path/to/downloaded-service-account.json)"

# Supabase service role key — Supabase Dashboard → Project Settings → API → service_role key
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# Supabase project URL — Supabase Dashboard → Project Settings → API → URL
supabase secrets set SUPABASE_URL=https://<project-ref>.supabase.co
```

**How to verify:**
```bash
supabase secrets list
# Should show all four names (values are redacted in output)
```

---

### 1e — Database settings (pg_net auth)

**Who:** Developer, via Supabase SQL editor or `psql` with `DATABASE_URL`.

**What to do** — run exactly these two statements:
```sql
ALTER DATABASE postgres
  SET app.settings.service_role_key = '<your-supabase-service-role-key>';

ALTER DATABASE postgres
  SET app.settings.edge_function_url = 'https://<project-ref>.supabase.co/functions/v1';
```

These are not stored in migration files and are not committed to git. They must be re-applied if the database is restored from a backup that predates these statements.

**How to verify:**
```sql
SELECT current_setting('app.settings.edge_function_url');
SELECT current_setting('app.settings.service_role_key');
-- Both should return non-empty strings.
```

---

### 1f — Edge Function deployed

**Who:** Developer, via Supabase CLI.

**What to do:**
```bash
supabase functions deploy send-notification
```

**How to verify:**
```bash
supabase functions list
# send-notification should appear with status ACTIVE
```

Also verify the function responds to a health probe (replace URL and key):
```bash
curl -s -o /dev/null -w "%{http_code}" \
  -X POST https://<project-ref>.supabase.co/functions/v1/send-notification \
  -H "Authorization: Bearer WRONG_KEY"
# Should return 401
```

---

### 1g — Android build on a real device

**Who:** Developer.

FCM works on emulators with Google Play Services, but physical devices are required for the full notification path (OS notification curtain, sound, tap-to-navigate). Use a real phone for all tests in Section 3.

**What to do:**
```bash
npm run build
npx cap sync android
npx cap open android
```
In Android Studio: **Build → Build APK(s)** → install the APK on the test device via ADB or direct transfer.

Alternatively, use `update.ps1` which runs the full build pipeline:
```powershell
./update.ps1 "test build for notifications"
# Output: wash-latest.apk in repo root
```
Then install: `adb install -r wash-latest.apk`

**How to verify:** App launches on the device. Log in as a test user. No crash on the home screen.

---

## Section 2 — Pre-test database state verification

Run these queries from Supabase SQL editor before each test run. Replace `<test-user-id>` with the actual UUID of the test account being used.

```sql
-- Baseline device token count for test user
SELECT COUNT(*) AS token_count
FROM device_tokens
WHERE user_id = '<test-user-id>';

-- Baseline notification log count (last hour only — tests from earlier sessions don't matter)
SELECT COUNT(*) AS log_count
FROM notification_log
WHERE user_id = '<test-user-id>'
  AND created_at > now() - interval '1 hour';

-- Current notification preferences
SELECT enabled, sound, updated_at
FROM notification_preferences
WHERE user_id = '<test-user-id>';
```

Record these three values as your baseline. All assertions in Section 3 are deltas against this baseline — not absolute counts — so tests can be run independently without resetting state.

---

## Section 3 — Functional tests

Test accounts from seed data (password `Test1234!`):
- `consumer1@test.dev` — Consumer A
- `consumer2@test.dev` — Consumer B
- `washer1@test.dev` — Washer W

---

### Test 1 — First-time registration

**Setup:** Fresh install (or cleared app data). Log in as Consumer A.

**Action:** Open the app and log in.

**Expected:**
- OS permission prompt appears exactly once.
- Accept the prompt.
- Within 30 seconds, a row appears in `device_tokens` for A's user ID with `platform = 'android'` and a non-empty `token`.

**Verify:**
```sql
SELECT token, platform, last_seen_at
FROM device_tokens
WHERE user_id = '<consumer-a-id>'
ORDER BY created_at DESC LIMIT 1;
```

**Failure modes:**
- No prompt appears → `initNotifications` not called, or permission was already granted/denied from a prior install. Check `getOsPermissionState()` returns `'prompt'`.
- Prompt appears but token row is absent → registration event fired but upsert failed; check Supabase Logs for the Edge Function or network errors in the device console.

---

### Test 2 — Permission denied state

**Setup:** Fresh install or cleared app data. Log in as Consumer B.

**Action:** Deny the OS permission prompt when it appears. Navigate to Profile → scroll to Notifications section.

**Expected:**
- Settings section shows: "Notifications are disabled in your phone settings"
- "Open Settings" button is visible.
- Master toggle is disabled (greyed out, non-interactive).
- Tapping "Open Settings" opens the system settings page for the MULU app (Android → App Info for `com.muluwash.app`).

**Failure modes:**
- Settings section shows master toggle instead of denied state → `getOsPermissionState()` is returning `'granted'` incorrectly; may indicate a timing issue on the initial mount call.
- "Open Settings" button does nothing or shows an error → `App.openUrl({ url: 'package:com.muluwash.app' })` failed; check if `@capacitor/app` is properly installed (`npx cap sync` needed after install).

---

### Test 3 — Order accepted notification

**Setup:** Consumer A (device 1) has notifications enabled, sound set to Default. Consumer A has a pending order with no washer assigned. Washer W (device 2) is online and can see the job.

**Action:** On device 2, Washer W accepts Consumer A's order.

**Expected (device 1, A's phone):**
- Curtain notification appears with:
  - Title: `Washer on the way`
  - Body: `Your washer accepted your order and is heading to you.`
  - Sound: default notification sound
- Tap the notification → app opens at `/order/{id}` (order tracking screen).

**Verify:**
```sql
SELECT delivered, error, payload
FROM notification_log
WHERE user_id = '<consumer-a-id>'
ORDER BY created_at DESC LIMIT 1;
-- delivered = true, error = null, payload contains order_id
```

**Failure modes:**
- No notification arrives → check `notification_log`; if no row exists, the trigger didn't fire (check `pg_net` is configured correctly); if a row exists with `delivered = false`, check the error column for FCM failure details.
- Wrong deep link → `data.route` in the FCM payload was not set correctly; check `notification_log.payload.route`.

---

### Test 4 — Washer on the way (en_route)

**Setup:** Consumer A has an accepted order. Washer W is assigned.

**Action:** On device 2, Washer W taps "Start trip" (accepted → en_route transition).

**Expected (device 1):**
- Title: `Washer on the way`
- Body: `Your washer is heading to your car.`
- Note: same title as Test 3 but different body — the title overlap is intentional.

**Failure modes:**
- Notification fires twice (once for accepted, once for en_route) → expected; consumer receives both during the flow. If en_route fires but accepted did not, check the accepted transition fired in the trigger.

---

### Test 5 — Washer arrived

**Setup:** Consumer A has an en_route order. Washer W must be physically within 100 m of the order pin location (geofence enforced in `transition_order_status`).

**Action:** Washer W taps "Mark arrived" (en_route → arrived).

**Expected (device 1):**
- Title: `Washer has arrived`
- Body: `Your washer has arrived at your car.`
- This is **distinct copy** from Test 4 — confirm the title says "has arrived", not "on the way".

**Failure modes:**
- Transition fails with geofence error → Washer is not within 100 m of the pin; move closer or adjust the order pin for testing.
- Consumer gets "Washer on the way" instead of "Washer has arrived" → 0044 migration was not applied; run `npm run db:migrate` and rebuild.

---

### Test 6 — Wash completed → rating deep link

**Setup:** Consumer A has an in_progress order. Washer W has uploaded before+after evidence photos.

**Action:** Washer W taps "Submit for approval" (in_progress → pending_approval).

**Expected (device 1):**
- Curtain notification:
  - Title: `Wash submitted`
  - Body: `Your wash is done — tap to rate.`
- Tap → app opens at `/order/{id}` (order tracking screen).
- The **rating modal appears automatically** — this is triggered by the existing realtime effect in `ConsumerLayout.jsx` watching for `pending_approval` status, not by the notification itself. The notification deep link opens the right screen; the modal surfaces itself.

**Failure modes:**
- Notification arrives but rating modal does not appear → realtime subscription dropped; check the Supabase Realtime connection on Consumer A's device.
- Notification arrives but tap opens home instead of order → `data.route` is absent from FCM payload; check `notification_log.payload`.

---

### Test 7 — Order approved (washer notification)

**Setup:** Order is in `pending_approval`. Agent logged into support-app at port 3001.

**Action:** Agent clicks Approve in the Approvals tab (pending_approval → completed).

**Expected (device 2, Washer W's phone):**
- Title: `Job approved`
- Body: `Your wash was approved. Great work!`
- Tap → `/washer/job/{id}` opens (washer job detail screen).

**Failure modes:**
- No notification to washer → check `notification_log` for the washer's user_id; if row exists with `delivered = false`, check FCM error; if no row exists, the trigger's `WHEN 'completed'` branch didn't fire (confirm `washer_id IS NOT NULL` on the order).

---

### Test 8 — Chat notification, consumer to washer

**Setup:** Order is in an active status (accepted, en_route, arrived, or in_progress). Consumer A has the order tracking screen open and the chat sheet open.

**Action:** Consumer A sends a chat message ("Test message for notification").

**Expected (device 2, Washer W's phone — app backgrounded or closed):**
- Title: `New message`
- Body: `Test message for notification` (up to 80 chars, which is the truncation limit in the trigger).
- Tap → `/washer/job/{id}` opens; chat sheet accessible from the job drawer.

**Failure modes:**
- Notification fires when Washer W's app is foregrounded → expected; the foreground handler shows an in-app toast instead of a system curtain. This is correct behavior, not a bug.
- Body is `You have a new message.` instead of the message preview → `preview` field missing from the trigger payload; check `notify_on_order_message` function is on the 0043 version.

---

### Test 9 — Chat notification, washer to consumer

**Setup:** Same active order.

**Action:** Washer W sends a chat message.

**Expected (device 1, Consumer A's phone):**
- Title: `New message`
- Body: first 80 chars of Washer W's message.
- Tap → `/order/{id}` opens; chat sheet accessible from the order tracking screen.

**Failure modes:** Mirror of Test 8.

---

### Test 10 — Consumer cancels after washer accepted

**Setup:** Consumer A has an order in `accepted` state (washer_id is NOT NULL, washer is assigned).

**Action:** Consumer A taps "Cancel order" from the order tracking screen.

**Expected:**
- **Washer W (device 2)** receives:
  - Title: `Job cancelled`
  - Body: `The customer cancelled the order.`
  - Tap → `/washer` (washer dashboard).
- **Consumer A (device 1)** receives **NO notification** — the cancelling party does not notify themselves.

**Verify:**
```sql
-- Washer gets one new log row; consumer gets none
SELECT user_id, event_type, delivered
FROM notification_log
WHERE created_at > now() - interval '5 minutes'
ORDER BY created_at DESC;
```

**Failure modes:**
- Both parties get notifications → `cancelled_by` was set incorrectly; check `orders.cancelled_by` after the cancel.
- Neither party gets a notification → check `cancelled_by` is populated (0042 migration); if null, the trigger's null-guard fires a WARNING and skips.

---

### Test 11 — Consumer cancels before any washer accepted (pending state)

**Setup:** Consumer A has a pending order with `washer_id = NULL`.

**Action:** Consumer A cancels the order.

**Expected:**
- **No notification sent to anyone.** `cancelled_by = 'consumer'` and `washer_id IS NULL` → the decision table says no notification.

**Verify:**
```sql
-- notification_log delta should be zero for this event
SELECT COUNT(*) FROM notification_log
WHERE created_at > now() - interval '2 minutes';
```

**Failure modes:**
- A notification fires → the trigger is not checking `washer_id IS NOT NULL` before calling `notify_send` for the consumer-cancel branch; check 0045 migration applied.

---

### Test 12 — Washer cancels (en_route → cancelled)

**Setup:** Consumer A has an en_route order. Washer W is assigned.

**Action:** Washer W cancels the job from the job drawer.

**Expected (device 1, Consumer A):**
- Title: `Order cancelled`
- Body: `Your washer cancelled the order.`
  — note: this is the washer-cancelled variant of the ternary body resolver.
- Tap → `/order/{id}` opens.
- **Washer W (device 2):** NO notification (cancelling party is not notified).

**Failure modes:**
- Consumer body says "Your order was cancelled by support." instead → `cancelled_by` value is `'agent'` or `'system'` when it should be `'washer'`; check `transition_order_status` populated `cancelled_by` correctly for the washer role.

---

### Test 13 — Agent cancels with washer assigned

**Setup:** Order in any non-terminal status with `washer_id NOT NULL`. Agent logged into support-app.

**Action:** Agent clicks "Cancel" in the Order Panel.

**Expected:**
- **Consumer A** receives "Order cancelled" / "Your order was cancelled by support."
- **Washer W** also receives "Order cancelled". The body the washer sees is resolved by the same ternary as the consumer: `cancelled_by === 'washer'` is false (it's `'agent'`), so body = "Your order was cancelled by support." — both parties receive identical copy in this case.

**Flag for QA:** The washer-facing copy "Your order was cancelled by support" may feel off from the washer's perspective (they're not the customer, so "your order" is ambiguous). This is a known v1 copy issue. File a UX ticket if QA flags it; fix is a targeted copy change in the Edge Function's `order_cancelled` body resolver for the washer recipient.

**Failure modes:**
- Only consumer notified, not washer → check `washer_id IS NOT NULL` on the order at cancel time and the agent-branch in the trigger.
- `notification_log` shows two rows, one for each recipient → correct; this is expected.

---

### Test 14 — Master toggle off

**Setup:** Consumer A has notifications enabled. Toggle off via Profile → Notifications.

**Action:** From a second device, trigger any order event that would normally notify A (e.g. washer transitions to en_route).

**Expected:**
- No curtain notification appears on A's phone.
- `notification_log` shows a new row with:
  - `delivered = false`
  - `error = 'user_disabled'`

**Verify:**
```sql
SELECT delivered, error FROM notification_log
WHERE user_id = '<consumer-a-id>'
ORDER BY created_at DESC LIMIT 1;
```

**Failure modes:**
- Notification arrives despite toggle off → the Edge Function is not reading `notification_preferences.enabled` correctly; check the Supabase service role can SELECT from `notification_preferences`.
- No `notification_log` row → the trigger fired but the Edge Function returned early without logging; check the early-return path in the function.

---

### Test 15 — Sound picker

**Setup:** Consumer A has notifications enabled.

**Action:**
1. Set sound to "Chime" → trigger an event → note the sound played.
2. Set sound to "Bell" → trigger an event → note the sound played.
3. Set sound to "Gentle" → trigger an event → note the sound played.

**Expected:** Each sound is audibly distinct. The v1 placeholders are:
- Default: 440 Hz sine, 1 s, soft fade-out
- Chime: 660+880 Hz blend, 1.5 s
- Bell: 1000 Hz with exponential decay, 1 s
- Gentle: 330 Hz slow fade-in/out, 2 s

**Failure modes:**
- All sounds sound the same (or silent) → the `android.notification.sound` FCM field references the filename without extension (e.g. `"chime"`), and the file must exist in `android/app/src/main/res/raw/`. Confirm the four `.mp3` files are present in the built APK's resources.
- Sound picker preview (the "Play" button in Settings) does not work → `public/sounds/` files are missing from the web build; run `npm run build` and verify `dist/sounds/` exists.

---

### Test 16 — Hebrew locale

**Setup:** Consumer A's profile locale set to `'he'`.

**Action:** Trigger several events: order accepted, washer arrived, order cancelled (by washer), order cancelled (by agent).

**Expected:**
- All notification titles and bodies appear in Hebrew.
- Order cancelled by washer: body = "השוטף ביטל את ההזמנה."
- Order cancelled by agent/support: body = "ההזמנה בוטלה על ידי התמיכה."
- Both Hebrew strings render correctly on the device notification curtain (BiDi rendering is the OS's responsibility once the string is delivered correctly).

**Failure modes:**
- Notifications arrive in English despite Hebrew locale → Edge Function resolved `locale = 'en'`; check `profiles.locale` is set to `'he'` for the user and that the `profiles` SELECT in the Edge Function succeeds.
- Hebrew text is garbled → the FCM payload was double-encoded or the Edge Function response had encoding issues; check `notification_log.payload` for the raw strings.

---

### Test 17 — App fully closed

**Setup:** Consumer A's app is force-killed (swipe away from recents).

**Action:** From a second device, trigger an event that targets Consumer A.

**Expected:**
- Notification arrives in the system notification curtain.
- Tapping the notification launches the MULU app.
- App navigates directly to the deep link target (not home).

This test specifically validates the FCM background/killed-app delivery path, which is handled by the OS independently of the running JavaScript.

**Failure modes:**
- Notification arrives but app opens at home instead of deep link → `pushNotificationActionPerformed` listener is not receiving the tap data; check Capacitor bridge initialization order (notifications must be registered before the app is suspended).
- Notification does not arrive at all → FCM background delivery is blocked by device battery optimization; disable battery optimization for WASH in Android settings during testing.

---

### Test 18 — Dead token cleanup

**Setup:** Consumer A is logged in with a valid device token. Manually insert a known-bad token:

```sql
INSERT INTO device_tokens (user_id, token, platform)
VALUES ('<consumer-a-id>', 'INVALID_FAKE_TOKEN_FOR_TESTING', 'android');
```

**Action:** Trigger any event targeting Consumer A.

**Expected:**
- The real token receives a notification (delivered = true in log).
- The fake token send fails; log row shows `error = 'UNREGISTERED'` or `'INVALID_ARGUMENT'`.
- After the Edge Function completes, the fake token row is gone:

```sql
SELECT token FROM device_tokens WHERE user_id = '<consumer-a-id>';
-- Should return only the real token, not INVALID_FAKE_TOKEN_FOR_TESTING
```

**Failure modes:**
- Fake token row persists → dead token cleanup not running; check the `deadTokens` deletion block in the Edge Function.
- Real token also deleted → the `IN ('token1', 'token2')` DELETE matched too broadly; should not happen since fake token is distinct.

---

### Test 19 — Logout token cleanup

**Setup:** Consumer A is logged in, has a device token row.

**Action:** Tap "Sign out" in the Profile screen.

**Expected:**
- Token row is deleted from `device_tokens` before the session is cleared.

```sql
SELECT COUNT(*) FROM device_tokens WHERE user_id = '<consumer-a-id>';
-- Should return 0 immediately after logout
```

**Failure modes:**
- Token row persists → `unregisterToken` did not run; check whether the AuthContext `signOut` function calls `unregisterToken()` before `supabase.auth.signOut()`.
- Error during logout → `unregisterToken` threw an exception that was not caught; it should be non-blocking. Check the device console logs.

---

### Test 20 — Cold-launch logout

**Setup:** Consumer A is logged in. Close the app fully (force-kill). Do NOT reopen yet — the FCM registration event has not fired in this session, so `currentToken` in memory is null.

**Action:** Reopen the app. Immediately log out without waiting for the registration event to fire (tap sign out within the first few seconds of opening).

**Expected:**
- Token is still deleted from `device_tokens` — the localStorage backup (`wash_push_token` key) provides the token even though the in-memory `currentToken` is null.

```sql
SELECT COUNT(*) FROM device_tokens WHERE user_id = '<consumer-a-id>';
-- Should return 0
```

**Failure modes:**
- Token row persists → the localStorage fallback in `unregisterToken` is not working; check `localStorage.getItem('wash_push_token')` returns the token before logout.

---

## Section 4 — Negative tests

Tests for things that should NOT happen.

---

### N1 — Non-status order UPDATE does not fire a notification

**Setup:** Consumer A has a pending order.

**Action:** Update the order's `car_plate` field directly via SQL (simulating a data edit that doesn't change `status`):
```sql
UPDATE orders SET car_plate = 'TEST-999' WHERE id = '<order-id>';
```

**Expected:** No new rows in `notification_log`. The trigger guard (`IS NOT DISTINCT FROM OLD.status`) prevents non-status UPDATEs from routing through the notification logic.

---

### N2 — New pending order does not notify washers

**Action:** Consumer A books a new order (INSERT into orders with `status = 'pending'`).

**Expected:** No washer receives a notification. `new_job_nearby` is explicitly deferred to a follow-up phase. Verify `notification_log` delta is zero.

---

### N3 — Edge Function rejects unauthenticated requests

**Action:**
```bash
curl -s -w "\nHTTP %{http_code}" \
  -X POST https://<project-ref>.supabase.co/functions/v1/send-notification \
  -H "Content-Type: application/json" \
  -d '{"user_id":"fake","event_type":"order_accepted","data":{}}'
# No Authorization header
```

**Expected:** HTTP 401. No FCM call is made. No `notification_log` row inserted.

Also test with wrong key:
```bash
curl -s -w "\nHTTP %{http_code}" \
  -X POST https://<project-ref>.supabase.co/functions/v1/send-notification \
  -H "Authorization: Bearer wrong-key" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"fake","event_type":"order_accepted","data":{}}'
```
**Expected:** HTTP 401.

---

### N4 — Unknown event_type is handled gracefully

**Action:**
```bash
curl -s -w "\nHTTP %{http_code}" \
  -X POST https://<project-ref>.supabase.co/functions/v1/send-notification \
  -H "Authorization: Bearer <service-role-key>" \
  -H "Content-Type: application/json" \
  -d '{"user_id":"<any-valid-user-id>","event_type":"not_a_real_event","data":{}}'
```

**Expected:**
- HTTP 200 with body `{"skipped":"unknown_event_type"}`.
- One row in `notification_log` with `delivered = false, error = 'unknown_event_type'`.
- No FCM send attempted.

---

## Section 5 — Diagnostic queries

Paste into Supabase SQL editor as needed during testing.

```sql
-- Last 10 notification attempts for a specific user
SELECT id, event_type, delivered, error, created_at,
       payload->>'route' AS route,
       payload->>'sound' AS sound,
       payload->>'locale' AS locale
FROM notification_log
WHERE user_id = '<user-id>'
ORDER BY created_at DESC
LIMIT 10;

-- All device tokens, grouped by platform
SELECT platform, COUNT(*) AS token_count, MAX(last_seen_at) AS most_recent
FROM device_tokens
GROUP BY platform
ORDER BY platform;

-- Notifications skipped due to user disabling
SELECT user_id, event_type, created_at
FROM notification_log
WHERE error = 'user_disabled'
ORDER BY created_at DESC
LIMIT 20;

-- Notifications skipped because no device token registered
SELECT user_id, event_type, created_at
FROM notification_log
WHERE error = 'no_tokens'
ORDER BY created_at DESC
LIMIT 20;

-- Users with more than one registered device token
-- (expected for users with multiple devices; investigate if count seems wrong)
SELECT user_id, COUNT(*) AS token_count, array_agg(platform) AS platforms
FROM device_tokens
GROUP BY user_id
HAVING COUNT(*) > 1
ORDER BY token_count DESC;

-- Dead-token cleanups: find UNREGISTERED / INVALID_ARGUMENT errors in last hour
-- After cleanup these tokens should be absent from device_tokens
SELECT user_id, event_type, error, created_at,
       payload->>'route' AS route
FROM notification_log
WHERE error IN ('UNREGISTERED', 'INVALID_ARGUMENT')
  AND created_at > now() - interval '1 hour'
ORDER BY created_at DESC;

-- Full audit for a specific order: what notifications fired
SELECT nl.event_type, nl.delivered, nl.error,
       p.role AS recipient_role,
       nl.created_at
FROM notification_log nl
JOIN profiles p ON p.id = nl.user_id
WHERE nl.payload->>'order_id' = '<order-id>'
ORDER BY nl.created_at;
```

---

## Section 6 — Known v1 limitations (for QA)

Do not file bugs for these items — they are intentional deferrals documented in `NOTIFICATIONS.md`.

| Limitation | Status | Notes |
|---|---|---|
| **iOS support** | Deferred | No `ios/` folder exists. All push notification testing is Android-only in v1. |
| **New job nearby (washer)** | Deferred | New pending orders do not notify washers. Washer sees jobs only via the in-app polling loop. |
| **Per-event notification toggles** | Deferred | Only a master on/off toggle. Users cannot silence specific event types. |
| **Badge counts** | Deferred | The app icon badge number is not maintained. |
| **Chat notifications while in chat** | Known gap | Foreground `pushNotificationReceived` shows a toast but does not suppress it if the user is already reading that chat. This is a v2 polish item. |
| **"Wash started" notification** | Intentionally silent | `arrived → in_progress` fires no notification. The washer starting the wash is not a consumer-actionable event. |
| **Open Settings on OEM Android** | Best-effort | `App.openUrl({ url: 'package:com.muluwash.app' })` may route to the generic Settings root instead of the app-specific notification settings page on heavily skinned Android builds (Xiaomi MIUI, OPPO ColorOS, etc.). The standard Android path works on stock and near-stock ROMs. |
| **Support-app agents** | Out of scope | Agents do not receive push notifications. The support-app has its own `AuthContext` and does not initialize the notification library. |
| **Web / PWA users** | Out of scope | Settings shows "Install the MULU app to receive notifications." No Web Push in v1. |
