# CLAUDE.md

**MULU** — two-sided on-demand car-wash marketplace. PWA + Capacitor Android.
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
./update.ps1 "msg"            # commit → push (Vercel auto-deploys) → optional APK
./update.ps1 "msg" -Support   # + builds support APK → wash-support-latest.apk
```

> **Windows (ADR-005):** some npm script chains break. If `npm run dev` fails, run `node ./node_modules/vite/bin/vite.js` directly.

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
| Main | `src/` | 3000 | consumer + washer | SDK default | Capacitor `com.sparklego.app` |
| Support | `support-app/src/` | 3001 | agent | `wash-support-auth` | Capacitor `com.sparklego.support` |
| Admin | `admin-app/src/` | 3002 | super_admin | `wash-admin-auth` | web-only (Vercel) |

Roles (`profiles.role`): `consumer`, `washer`, `agent`, `super_admin`.
**Agents use only support-app; super_admins use only admin-app.** `super_admin` does NOT inherit agent
powers — `is_super_admin()` is distinct from `is_agent()`. Never add agent UI to main; never add admin
UI to main/support.

## Detail docs

- **ARCHITECTURE.md** — routing/auth, booking, washer dashboard, approval workflow, verification, support + admin apps, design editor, dark mode, i18n, realtime, mobile, deployment, tests.
- **DATABASE.md** — tables, RPCs, migrations, buckets, order state machine, pricing/payout, RLS, **migration discipline**.
- **NOTIFICATIONS.md** — FCM push: edge functions, triggers, channels, broadcasts, deep links.
- **DECISIONS.md** — ADRs.   **DESIGN.md** — visual/design system.   **STORE_COMPLIANCE.md** — permission strings, Data Safety / Privacy Label, deletion URL, UGC.

## Legal docs / account deletion / UGC (Jun 2026, migrations through 0113; ADR-036–041)

- **Legal docs (ADR-036/037):** `legal_documents` (versioned, one `is_current` per doc_type×locale) + `user_legal_acknowledgments`. RPCs `publish_legal_document` (agent-only), `get_current_legal_document` (he-fallback), `pending_legal_acknowledgments` (role-filtered), `acknowledge_legal_document`. Agents edit/publish in support-app `/legal`; main app gates via `LegalUpdateModal` (mounted in `src/router.jsx`) + viewers `/legal/{terms,privacy,washer-terms}`. Publish fires trigger → Edge Fn `fan-out-legal-update` → `send-notification` event type **`legal_update`**. **New Vault secret: `fan_out_legal_update_url`.**
- **Account deletion (ADR-038):** Edge Fn `delete-account` (service-role; consumer/washer only) — **anonymizes orders** (PII nulled, financials/`order_events` kept), purges per-user storage + child rows, deletes profile + auth user. Migration 0109 set `orders.consumer_id`/`washer_id` + `order_events.actor_id` to **ON DELETE SET NULL** (consumer_id now nullable). In-app (both settings) type-to-confirm; public store URL **`/account/delete`** (logged-in runs it, logged-out shows instructions). Needs Edge secret `SUPABASE_SERVICE_ROLE_KEY`.
- **UGC (ADR-039):** `content_reports` (agents triage in support-app **Reports** tab, live badge) + `content_blocks` (order-chat block = hide + disable compose). Per-message `MessageActions` in `OrderChatSheet` + support chat. **NOT** routed into `support_tickets` (its `order_id` is NOT NULL+UNIQUE).
- **First-wash discount (ADR-040):** 30% off a consumer's first non-cancelled order, applied **inside `validate_order_prices`** (0111) — platform absorbs (washer payout untouched). Client (`useFirstWashDiscount` + `applyFirstWashDiscount`) is display-only. Pinned by `firstWashDiscount.contract.test.js`.
- **Receipts (ADR-041):** order → `completed` issues a `receipts` row (sequential #, config snapshot) + emails the customer via Edge Fn `send-receipt` (Resend). Config in admin **Receipts** tab (9 `app_config` keys incl. עוסק מורשה + sender email). **New Vault secret: `send_receipt_url`; new Edge secret: `RESEND_API_KEY`.** Pinned by `receipts.contract.test.js`.

## Load-bearing gotchas (do not remove)

- **`nearby_jobs` contract:** keep the 13-col return shape **including `lat`/`lng`** (WorkerMap pins). Guarded by `src/__tests__/nearbyJobsShape.contract.test.js`, `useNearbyJobs.test.jsx`, `scripts/verify-db.js`. Details in DATABASE.md.
- **Migrations:** `CREATE OR REPLACE FUNCTION` fails if the `RETURNS TABLE` shape changed → `DROP FUNCTION IF EXISTS` first. Extension symbols live in schema `net`/`extensions`, not `public` (qualify the call + add to `search_path`). New super_admin tables need BOTH a write path AND an explicit super_admin SELECT policy. Avoid an inner `BEGIN;`/`COMMIT;` (the runner already wraps each file). Full rules in DATABASE.md.
- **Pricing:** `app_config.pricing_source` MUST stay `'hardcoded'` until verified vs staging (DATABASE.md).
- **`src/test/setup.js`:** the global `beforeEach` clears session/localStorage — don't remove (stops SignUp draft state leaking across tests).
- **Washer Settings `GridPill`:** depends on a module-level `const SPRING = {...}` — don't delete in refactors; it is NOT imported from PillRow.
- **Design editor `121212` gate** (`admin-app/.../DesignEditor.jsx`) is a soft accidental-entry guard, **NOT security** — real protection is RLS + the bound-validating `admin_set_design_override` RPC.
