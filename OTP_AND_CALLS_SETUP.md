# OTP_AND_CALLS_SETUP.md

Operator checklist for the two new (currently **HIDDEN**) features:

1. **Phone verification** — SMS code after signup, proves the number is real.
2. **Masked calls** — in-app WebRTC voice between consumer ↔ washer; neither
   sees the other's real phone number.

Both are built, merged-ready, and **OFF by default**. Nothing changes for users
until you (a) set up the backend pieces below and (b) flip the feature flag. With
the flags off the app behaves exactly as before — calling still uses the old
`tel:` links and no verification gate ever appears.

---

## TL;DR — what's already in the code

| Piece | Where |
|-------|-------|
| Feature flags (both OFF) | `src/lib/featureFlags.js`, documented in `.env.example` |
| OTP DB (column + table) | migration `0126_phone_verification.sql` |
| OTP backend | Edge Functions `send-otp`, `verify-otp` + `_shared/sms.ts` adapter |
| OTP UI gate | `src/components/account/PhoneVerifyModal.jsx` (mounted in `router.jsx`) |
| Calls: ICE/TURN | Edge Function `turn-credentials` + `src/lib/turn.js` |
| Calls: signalling + UI | `src/context/CallContext.jsx`, `src/components/call/CallSheet.jsx` |
| Calls: ring push | Edge Function `notify-call` + `incoming_call` in `send-notification` |
| Native mic permission | `AndroidManifest.xml` (RECORD_AUDIO), `Info.plist` (NSMicrophoneUsageDescription) |

---

## Part A — Phone verification (Feature 1)

### Your side
1. **Pick an Israeli SMS aggregator** and open an account (019 SMS / InforU /
   Cellact / …). Get: an **API key/token**, your **account/username**, and an
   **approved sender ID** (e.g. `MULU`). Sender-ID approval can take a few days —
   start this first.
2. **Tell me which provider** so I can finalise the adapter in
   `supabase/functions/_shared/sms.ts`. It currently has best-effort `019` and
   `inforu` shapes + a `generic` JSON POST + a `log` default (logs the code, no
   real SMS) — the `019`/`inforu` request bodies must be verified against your
   provider's current API docs before going live.

### Apply + deploy
3. Apply the migration (safe — adds an unused column + a service-role-only table):
   ```bash
   npm run db:migrate
   ```
4. Deploy the functions:
   ```bash
   supabase functions deploy send-otp
   supabase functions deploy verify-otp
   ```
5. Set the Edge secrets:
   ```bash
   supabase secrets set OTP_HASH_SALT="<long random string>"
   supabase secrets set SMS_PROVIDER="019"          # or inforu / generic
   supabase secrets set SMS_SENDER="MULU"
   supabase secrets set SMS_API_USER="<account/username>"
   supabase secrets set SMS_API_KEY="<api token>"
   # SMS_API_URL only for SMS_PROVIDER=generic
   ```
   (`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.)

### Turn it on
6. Set `VITE_ENABLE_PHONE_VERIFY=true` (local `.env` and Vercel env) and rebuild
   / redeploy. Unverified consumers & washers now get the gate; agents/admins are
   never gated.

### Notes
- Limits: 6-digit code, 10-min expiry, 60s resend cooldown, 5 codes/hour, 5
  wrong attempts then the code locks. Codes are stored only as salted SHA-256
  hashes; plaintext is only ever in the SMS.
- Leaving `SMS_PROVIDER` unset (or `log`) lets you enable the flag and test the
  whole flow end-to-end — the code appears in the `send-otp` function logs
  instead of a real SMS.

---

## Part B — Masked in-app calls (Feature 2)

### TURN server — ✅ DONE (Cloudflare Realtime TURN, Jun 2026)
Cloudflare TURN key created, the `TURN_PROVIDER=cloudflare` / `TURN_KEY_ID` /
`TURN_KEY_API_TOKEN` secrets are set on `sparklego`, and `turn-credentials` is
deployed + verified (returns live `turn:`/`turns:` relay credentials). Nothing
more to do here. (To switch to self-hosted coturn instead: `TURN_PROVIDER=static`
+ `TURN_URLS`, `TURN_USERNAME`, `TURN_CREDENTIAL`.)

### Deploy — remaining functions (do at go-live)
Only needed for the backgrounded-ring push; deploy when you flip the flag:
```bash
supabase functions deploy notify-call --project-ref fpwshpvixtgaygkuxajy
supabase functions deploy send-notification --project-ref fpwshpvixtgaygkuxajy  # re-deploy: adds incoming_call type
```

### Realtime
4. No DB migration needed — signalling is ephemeral over Supabase Realtime
   broadcast. Just make sure Realtime is enabled for the project (it is, you use
   it for chat + tracking).

### Native rebuild (for the mic permission)
5. The mic permission strings are already in `AndroidManifest.xml` and
   `Info.plist`, but a **native rebuild** is required for them to take effect:
   ```powershell
   npm run android:sync       # then ./update.ps1 "calls" for debug APKs, or
   ./release-android.ps1      # signed AAB
   ```
   iOS rebuilds via `codemagic.yaml`.

### Turn it on
6. Set `VITE_ENABLE_INAPP_CALLS=true` (`.env` + Vercel) and rebuild. The call
   buttons on the order-tracking screen (consumer) and the job drawer (washer)
   now place a masked in-app call instead of opening the dialer.

### What works now vs. follow-ups
- **Works:** masked 1:1 voice while both apps are open (foreground), mute, hang
  up, accept/decline, auto-STUN/TURN, and a best-effort FCM **ring push** when
  the callee is backgrounded.
- **Native follow-up (not built):** a full-screen CallKit (iOS) / Telecom
  full-screen-intent (Android) incoming-call screen so a ring wakes a fully
  *closed* app like a normal phone call. Today the push opens the app and the
  in-app `CallSheet` takes over if the call is still ringing. Tell me when you
  want this and I'll wire `@capacitor` CallKit/connection-service plugins.
- **Optional hardening once calls are live:** stop sending `profiles.phone` to
  the client in `OrderTracking.jsx` / `JobDrawer.jsx` (the `select('id,
  full_name, phone')` calls) — with in-app calls the number is no longer needed
  client-side, which fully closes the current number-exposure.

---

## Quick verification (before flipping flags)
- `npm run lint` and `npm run test` should pass with everything still hidden.
- Set just `VITE_ENABLE_PHONE_VERIFY=true` with `SMS_PROVIDER` unset → sign up a
  test consumer → the gate appears and the code shows in the `send-otp` logs.
- Set `VITE_ENABLE_INAPP_CALLS=true` with TURN configured → open the same order
  on two devices (consumer + washer) → tap call → answer.
