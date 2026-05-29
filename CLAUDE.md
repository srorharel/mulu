# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Main (3000) + support-app (3001) + admin-app (3002) together
npm run dev:all        # Recommended: runs all three apps via concurrently

# Individual apps
npm run dev            # Main app only (port 3000)
cd support-app && npm run dev   # Agent support app only (port 3001)
npm run dev:admin      # Admin app only (port 3002)

npm run build          # Production build (main app)
npm run lint           # ESLint (zero warnings policy)
npm run preview        # Preview production build locally
npm run test           # Vitest run (main app suite — support-app and admin-app have their own)

npm run setup          # Full DB init: check env → migrate → verify
npm run db:migrate     # Apply SQL migrations to Postgres
npm run db:migrate:bootstrap  # Record every migration as applied WITHOUT running SQL (see Migration discipline)
npm run db:verify      # Verify tables, RLS, functions, seed data
npm run check:env      # Validate required .env variables
npm run setup:buckets  # Create the washer-verification storage bucket via admin SDK (heal if missing)

# Drift checks — compare admin-editable surfaces against live DB
npm run drift          # All four: content + branding + config + design
npm run drift:content  # Only content_overrides keys vs bundled i18next resources
npm run drift:branding # Only app_branding rows vs brand-assets bucket objects
npm run drift:config   # Only app_config keys actually consulted by RPCs/Edge Functions
npm run drift:design   # Only design_overrides ids vs editableManifest.json

# End-to-end smoke for P6/P7/P8 admin flows (create order, suspend user, design override, …)
npm run smoke

# Diagnostic scripts (no npm alias — invoke directly)
node scripts/audit-bootstrap.js       # Parse every migration + compare against live DB; surface declared-but-missing objects
node scripts/verify-live-surfaces.js  # End-to-end live checks for Approvals fetch, agent storage RLS, nearby_jobs exclusion filter

npm run android:sync   # Build web + sync to Android Studio (Capacitor)
npm run android:open   # Open Android Studio

./update.ps1 "msg"     # Deploy: git commit → push (Vercel auto-deploys) → optional APK build
./update.ps1 "msg" -Support  # Same + builds support-app APK → wash-support-latest.apk
```

**Note:** On Windows, some npm script chains break. Use `node ./node_modules/vite/bin/vite.js` directly if `npm run dev` fails (see ADR-005 in DECISIONS.md).

## Required Environment Variables

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
DATABASE_URL=          # Direct Postgres URL for migration scripts
```

## Architecture

**Wash** is a two-sided on-demand car wash marketplace (PWA + Capacitor Android). Consumers book jobs; washers accept nearby jobs. UI is React 18 + Vite + Tailwind; backend is entirely Supabase (Postgres + PostGIS, Auth, Realtime, Storage).

### Three Vite Projects

There are **three separate Vite apps** in this repo:

| App | Path | Port | Users |
|-----|------|------|-------|
| Main app | `src/` | 3000 | Consumers + Washers |
| Support app | `support-app/src/` | 3001 | Agents only |
| Admin app | `admin-app/src/` | 3002 | Super-admins only |

**Agents do not use the main app.** All agent features (queue, chat, approvals, tickets) live exclusively in `support-app/`. Never add agent UI to the main project. **Super-admins do not use the main or support app.** All admin features (content overrides, branding, broadcasts, config knobs, live job control, user management, design editor) live exclusively in `admin-app/`. The admin app is **web-only** — no `capacitor.config.json`, no `android/`, deployed to Vercel only. Auth isolation between the three apps is enforced by distinct Supabase `storageKey`s: main uses the SDK default, support uses `wash-support-auth`, admin uses `wash-admin-auth`. Run all three with `npm run dev:all`.

### Roles

Four roles exist in `profiles.role`:
- `consumer` — books car wash jobs
- `washer` — accepts and performs jobs
- `agent` — support staff; only access `support-app`
- `super_admin` — platform owner/operator; only accesses `admin-app`. Provisioned via the Supabase dashboard + `UPDATE profiles SET role='super_admin'` — there is no public signup. **Does NOT inherit `is_agent()` powers**: `is_super_admin()` (migration 0069) is a distinct security-definer membership check. RLS policies that should also cover super-admins must reference both helpers explicitly.

### Routing and Auth (Main App)

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

### Database (Supabase + PostGIS)

Key tables:
- `profiles` — role (`consumer`/`washer`/`agent`/`super_admin`), GPS location (`current_location` PostGIS point, `last_lat`/`last_lng`/`last_location_at`), online status, preferences (`locale`, ringtone, nav app), tier/rating columns (`current_rating`, `current_tier` int 1–5, `rated_job_count`, `tier_changed_at`), `agent_display_name`, suspension columns (`suspended_at`, `suspended_reason`, `suspended_by` — written by `admin_suspend_user` 0086; all three apps' `AuthContext` check `suspended_at` on profile fetch and force a signout + takeover screen)
- `orders` — PostGIS `geography(Point, 4326)` for location, status state machine, vehicle category (`category IN ('private','jeep','pickup')`), pricing columns (`payout_amount` locked at acceptance), car details (`car_plate`, `car_make`, `car_model`, `car_color`, `car_year`), 4 consumer car photos (`car_photo_front/back/driver/passenger`), site flags (`site_has_water`, `site_has_power`), access notes, 4 arrival photos (`arrival_photo_front/back/driver/passenger`), 4 completion photos (`completion_photo_front/back/driver/passenger`), submitted location (`submitted_lat`, `submitted_lng`, `submitted_location_at`), rating columns (`rated_at`, `rating_skipped`), `cancelled_by` ('consumer'/'washer'/'agent'), `vehicle_id` FK to `vehicles`, approval columns (`submitted_for_approval_at`, `approved_at`, `approved_by`, `decline_reason`, `declined_by`, `declined_at`, `decline_count`), `created_by_admin` FK to `profiles` (set when an order is created on behalf of a consumer via `admin_create_order_for_consumer`)
- `order_events` — insert-only audit log
- `approval_audit` — tracks every agent approve/decline action with `order_id`, `agent_id`, `action` ('approved'/'declined'), `reason`, `created_at`
- `order_messages` — consumer↔washer direct chat per order; writable only while status is `accepted`/`en_route`/`arrived`/`in_progress`; read-only thereafter
- `vehicles` — consumer saved vehicles (`plate`, `nickname`, `make`, `model`, `year`, `color`, `category IN ('private','jeep','pickup')`, `is_default`); at most one default per consumer enforced by unique partial index
- `washer_ratings` — consumer star ratings (1–5) per completed order; drives tier recomputation
- `support_tickets` — auto-created on 1★ rating or manually; `reason IN ('low_rating','manual')`; `status IN ('open','in_progress','resolved')`
- `support_conversations` — washer/consumer-initiated support threads (`opener_role IN ('consumer','washer')`)
- `support_messages` — messages within a support conversation
- `support_canned_responses` — per-agent quick-reply templates
- `device_tokens` — FCM push tokens per user (`user_id`, `token`, `platform`, `last_seen_at`)
- `notification_preferences` — per-user push opt-in and sound preference (`enabled`, `sound`); `sound CHECK ('chirp','chime','bell','gentle')` DEFAULT `'chirp'`; has SELECT + UPDATE + INSERT RLS policies; client uses upsert (not update) so missing rows self-heal
- `notification_log` — audit log of every push attempt (`user_id`, `event_type`, `payload`, `delivered`, `error`)
- `order_washer_notifications` — dedup table; one row per (order_id, washer_id) pair already notified for nearby-job fan-out
- `washer_verifications` — washer onboarding submissions; `status IN ('pending_review','approved','rejected')`; contains paths to ID document (`id_document_path`), selfie (`selfie_path`), and business license (`business_license_path`) stored in `washer-verification` bucket; agents review and approve/reject via `review_washer_verification` RPC. Washer profile gains `washer_verification_status`, `washer_service_areas text[]`, and `washer_dealer_number` columns.
- `content_overrides` — runtime i18n override layer (`app`, `locale`, `key`, `value`); one row per (app, locale, key) triple. Anon SELECT, super_admin write. Each app deep-merges these rows over its bundled i18next resources on boot via `addResourceBundle`; see the i18n section.
- `app_branding` — runtime-swappable brand asset URLs by `slug` (logo, hero, splash, favicon, …); anon SELECT, super_admin write. URLs point at objects in the `brand-assets` storage bucket (also super_admin-write).
- `app_config` — runtime config knobs (`key TEXT PK`, `value JSONB`, `value_type TEXT` for admin-UI hinting). Anon SELECT, super_admin write. Read by RPCs/Edge Functions via `get_config_number(key, default)` / `get_config_text(key, default)`. Notable keys: `pricing_source` (see config note below), `nearby_job_radius_meters`, `arrival_geofence_meters`, `decline_escalation_threshold`.
- `pricing_config` — per-category consumer/washer price rows. Read by `validate_order_prices` only when `app_config.pricing_source = 'table'`.
- `payout_tier_config` — per-tier (and unrated default) payout rows. Read by `payout_for_tier` / `recompute_washer_tier` only when `app_config.pricing_source = 'table'`.
- `broadcast_notifications` — admin-composed promo/announcement record (`title_en`, `title_he`, `body_en`, `body_he`, optional `deep_link_route`, `segment_filter` JSONB, `sent_at`, `sent_count`, `failed_count`); super_admin only. Push delivery is triggered by `trigger_broadcast` RPC.
- `admin_order_audit` — append-only log of every super_admin order action (`order_id`, `admin_id`, `action`, `reason`, `payload` JSONB). super_admin SELECT + INSERT; no anon.
- `admin_user_audit` — append-only log of every super_admin user action (`user_id`, `admin_id`, `action`, `reason`, `payload` JSONB). super_admin SELECT + INSERT; no anon.
- `impersonation_tokens` — one-time, hashed (`extensions.digest(sha256)`) tokens for the admin "open main app as user" flow (`token_hash`, `admin_id`, `target_user_id`, `expires_at`, `consumed_at`). super_admin INSERT (via `admin_create_impersonation_token`); redeem path via the `impersonate-redeem` Edge Function.
- `design_overrides` — runtime visual-property overrides by component id (`component_id`, `property`, `value`, `updated_by`, `updated_at`); anon SELECT, super_admin write. Bound-validated by `admin_set_design_override` RPC; consumed by the `<Editable>` HOC in main + support apps (see Live Design Editor section).
- `admin_change_history` — unified before/after capture for the six runtime-editable override tables (`entity_type`, `entity_key`, `action` create/update/delete, `before_value`/`after_value` jsonb, `note`, `changed_by`, `changed_at`); super_admin SELECT + INSERT, realtime. Written by the `capture_admin_change_history()` AFTER trigger on `content_overrides`, `app_branding`, `app_config`, `pricing_config`, `payout_tier_config`, `design_overrides` — triggers (not admin JS) so no write path can bypass capture (ADR-028). Feeds the admin History tab + scoped undo.

Key RPC functions (security-definer, called from client unless noted):
- `nearby_jobs(washer_lat, washer_lng, radius_km)` — spatial query returning pending orders within distance; **deliberately excludes `key_location`** until after acceptance (ADR-007); excludes washers with active or `pending_approval` orders (ADR-024). **Return shape includes `lat`/`lng`** (computed via `ST_Y`/`ST_X`) — consumed by `WorkerMap.jsx` to render pin markers. Any rewrite must preserve the 13-column shape (superset only) AND use `DROP FUNCTION IF EXISTS` first — `CREATE OR REPLACE FUNCTION` fails if the `RETURNS TABLE` shape differs. `scripts/verify-db.js` and `src/__tests__/useNearbyJobs.test.jsx` guard this contract.
- `get_washer_active_job()` — returns the washer's current in-flight order (includes `pending_approval` status per ADR-024)
- `transition_order_status(order_id, new_status, washer_lat?, washer_lng?, p_admin_override?)` — enforces allowed state transitions; requires 4 arrival photos + arrival-geofence (default 100 m, configurable via `app_config.arrival_geofence_meters`) for `en_route → arrived`; requires 4 completion photos + GPS for `in_progress → pending_approval`; blocks `pending → accepted` if washer has active/pending-approval job; agent can cancel or force-complete from any non-terminal status; writes `approved_at`/`approved_by` on agent completes; writes `submitted_for_approval_at` on submission; writes `approval_audit` on agent approve. **5-arg as of migration 0083:** added `p_admin_override boolean DEFAULT false` — when true AND caller is super_admin, photo/GPS/geofence checks are bypassed (audited to `admin_order_audit`). The DEFAULT preserves all existing 4-arg call sites.
- `decline_order(p_order_id, p_reason)` — agent-only; reverts `pending_approval → in_progress` with reason (≥3 chars); increments `decline_count`; writes `approval_audit`; auto-creates support ticket at 3 declines
- `washer_has_pending_approval(p_washer_id)` — returns boolean; used by client for pre-flight lockout check
- `find_nearby_washers_for_order(p_order_id, p_radius_m)` — spatial query called by fan-out Edge Function; excludes washers already in `order_washer_notifications` and washers with active/pending-approval orders (ADR-024)
- `payout_for_tier(tier)` — returns payout ILS for tier 1–5 (40/45/50/55/60)
- `submit_rating(order_id, stars, feedback?)` / `skip_rating(order_id)` — consumer rates a completed wash
- `recompute_washer_tier(washer_id)` — recalculates `current_tier` from recent ratings
- `set_default_vehicle(vehicle_id)` — sets one vehicle as default, clears previous default
- `notify_send(user_id, event, data)` — internal helper called by DB triggers; fires `net.http_post` to `send-notification` Edge Function via Vault secrets
- `review_washer_verification(p_verification_id, p_decision, p_reason?)` — agent-only RPC; sets verification status to `approved` or `rejected` and mirrors status to `profiles.washer_verification_status`
- `get_washer_verifications(p_status?)` — agent-only security-definer RPC; returns washer verification rows joined with `profiles` (name, phone) and `auth.users` (email) as flat columns (`washer_name`, `washer_phone`, `washer_email`). Used by support-app because `profiles` does not expose `email` directly. Added in migration `0062`; column-ambiguity bug fixed in `0063` (all table references fully qualified with schema prefix; `set search_path = public, auth`; explicit `::text` casts).
- `is_super_admin()` — security-definer membership check; mirrors `is_agent()`. Distinct from agent — does NOT grant agent powers.
- `get_config_number(key, default)` / `get_config_text(key, default)` — read `app_config.value` with typed fallback.
- `resolve_broadcast_segment(p_broadcast_id)` — returns target `user_id`s for a broadcast row by applying its `segment_filter` JSONB (role, locale, online, washer_tier, …); callable by super_admin **or service_role** (0091) so the `send-broadcast` Edge Function can resolve segments using its trusted JWT.
- `trigger_broadcast(p_broadcast_id)` — super_admin only; validates the broadcast row + `net.http_post`s the `send-broadcast` Edge Function with `TRIGGER_SECRET`.
- **P6 Live Jobs (super_admin only, audited to `admin_order_audit`):** `admin_create_order_for_consumer(p_consumer_id, p_payload)` (sets `created_by_admin`), `admin_reassign_washer(p_order_id, p_new_washer_id, p_reason)` (recomputes payout from new washer's tier — ADR-026), `admin_override_order_price(p_order_id, p_new_price, p_new_payout, p_reason)`, `admin_log_photo_replacement(p_order_id, p_slot, p_old_path, p_new_path, p_reason)`.
- **P7 Users (super_admin only, audited to `admin_user_audit`):** `admin_get_user_auth(p_user_id)` (reads `auth.users`), `admin_update_profile(p_user_id, p_changes jsonb)`, `admin_suspend_user(p_user_id, p_reason)` / `admin_unsuspend_user(p_user_id)` (lockout guard: a super_admin cannot be suspended), `admin_merge_users(p_keep_id, p_drop_id)`, `admin_user_activity(p_user_id, p_limit)`, `admin_create_impersonation_token(p_target_user_id, p_reason)`. **Password reset, account deletion, and best-effort user restore live in the `admin-user-mgmt` Edge Function** (actions `reset_password` / `delete_user` / `restore_user`), not as RPCs — they require the service role to touch `auth.users` directly. `delete_user` now also captures the auth email into the audit snapshot (`__auth.email`) so `restore_user` can recreate the login; restore is best-effort (new id possible, relational rows not reconnected — ADR-028).
- **P8 Design (super_admin only):** `admin_set_design_override(p_component_id, p_property, p_value)` — bound-validated per ADR-027: `padding` 0–48 px, `text_size` 0.7–1.5 (relative multiplier), `radius` 0–32 px, `offset_*` ±100 px; `admin_clear_design_override(p_component_id, p_property)`; `admin_reset_all_design_overrides()` — wipes the table.
- **History / Undo (super_admin only, ADR-028):** `get_admin_activity_feed(p_limit, p_before, p_entity_type)` — paginated, super_admin-gated reader over the RLS-locked `admin_activity_feed` view (UNION of `admin_change_history` + `admin_order_audit` + `admin_user_audit` + sent broadcasts); `admin_undo_change(p_history_id)` — reverses an `admin_change_history` row for the six override types only (update→restore before, create→delete, delete→re-insert), with a conflict guard (rejects if the live row changed since) and a pricing guard (blocks pricing/payout undo while `pricing_source='config'`); `admin_get_deletion_snapshot(p_audit_id)` — returns a `delete_user` audit's profile snapshot + captured `__auth.email` for the best-effort restore preview.

Migrations live in `supabase/migrations/` (0001–0095). Run `npm run db:migrate` to apply. `supabase/seed.sql` creates 5 test accounts (password `Test1234!`): `consumer1@test.dev`, `consumer2@test.dev`, `washer1@test.dev`, `washer2@test.dev`, `washer3@test.dev`.

Notable recent migrations:
- `0066_approval_lifecycle.sql` — adds `orders.decline_count` and `orders.submitted_for_approval_at`, the `approval_audit` table + RLS + indexes, and the `washer_has_pending_approval` helper. Also redeclares `nearby_jobs` with the new busy-washer exclusion filter — **the redeclaration is a strict superset of the live shape and MUST keep `lat`/`lng` in the return** (a prior draft accidentally dropped them and would have killed the washer map). Uses `DROP FUNCTION IF EXISTS` before `CREATE OR REPLACE` to allow the redeclaration to succeed even if Postgres deems the shape changed.
- `0067_ensure_orders_decline_count.sql` — idempotent `ALTER TABLE … ADD COLUMN IF NOT EXISTS decline_count`. Heals deployments where 0066 was bootstrapped or rolled back without leaving the column behind.
- `0068_ensure_washer_verification_agent_read.sql` — idempotent recreate of the `agent_read_all_verification` storage policy on `storage.objects` so agents can read selfie / ID / license objects from the `washer-verification` bucket. Mirrors the `job-evidence` agent-read pattern from 0020.

**Admin / CMS migrations (0069–0091):**
- `0069_super_admin_role.sql` — extends `profiles_role_check` with `super_admin`; adds `is_super_admin()`; drops the inert `is_admin()` helper and its two dead policies (zero callers; the `admin` role was never added in 0027).
- `0070_content_overrides.sql` — `content_overrides` table + RLS (anon read, super_admin write) + realtime publication. Runtime i18n override layer for all three apps.
- `0071_brand_assets.sql` — public `brand-assets` storage bucket + `app_branding` table; super_admin write on both.
- `0072_broadcast_notifications.sql` — `broadcast_notifications` table + RLS + `resolve_broadcast_segment(p_broadcast_id)` RPC.
- `0073_promos_optin.sql` — `notification_preferences.promos_enabled boolean DEFAULT true`. Separate opt-in for admin promo broadcasts; transactional `enabled` still gates everything else.
- `0074_trigger_broadcast.sql` — `trigger_broadcast(p_broadcast_id)` RPC; validates row + `net.http_post`s the `send-broadcast` Edge Function.
- `0075_app_config.sql` — `app_config` table + `get_config_number` / `get_config_text` helpers.
- `0076_radius_from_config.sql` — `find_nearby_washers_for_order` reads radius from `app_config.nearby_job_radius_meters` with hardcoded fallback.
- `0077_geofence_decline_from_config.sql` — `transition_order_status` arrival geofence + `decline_order` auto-escalation threshold read from `app_config` with hardcoded fallback.
- `0078_pricing_payout_from_config.sql` — `pricing_config` + `payout_tier_config` tables + dual-path `validate_order_prices` / `payout_for_tier` / `recompute_washer_tier` (gated by `app_config.pricing_source`, COALESCE-fallback to hardcoded values).
- `0079_super_admin_profile_read.sql` — super_admin SELECT policy on `profiles` (so admin UI can resolve "edited by <name>" metadata).
- `0080_fix_pg_net_schema_refs.sql` — fixes `trigger_broadcast` to call `net.http_post` (not `pg_net.http_post` — see Migration discipline below).
- `0081_admin_order_audit.sql` — `admin_order_audit` table + RLS (super_admin SELECT + INSERT).
- `0082_admin_order_rpcs.sql` — `admin_create_order_for_consumer`, `admin_reassign_washer`, `admin_override_order_price`, `admin_log_photo_replacement` RPCs; adds `orders.created_by_admin`; adds super_admin write policies on `car-photos` + `job-evidence` storage objects.
- `0083_transition_order_status_admin_override.sql` — adds `p_admin_override boolean DEFAULT false` 5th arg to `transition_order_status`; bypasses photo/GPS/geofence checks when caller is super_admin.
- `0084_admin_user_audit.sql` — `admin_user_audit` table + RLS (mirrors 0081).
- `0085_profiles_suspension.sql` — `profiles.suspended_at` / `suspended_reason` / `suspended_by` columns.
- `0086_admin_user_rpcs.sql` — `admin_get_user_auth`, `admin_update_profile`, `admin_suspend_user` / `admin_unsuspend_user` (with super_admin lockout guard), `admin_merge_users`, `admin_user_activity` RPCs.
- `0087_impersonation_tokens.sql` — `impersonation_tokens` table + `admin_create_impersonation_token` RPC (issues 32-byte hashed one-time token).
- `0088_design_overrides.sql` — `design_overrides` table + RLS + realtime publication.
- `0089_admin_design_rpcs.sql` — `admin_set_design_override` (bound-validating), `admin_clear_design_override`, `admin_reset_all_design_overrides` RPCs.
- `0090_super_admin_read_all_admin_surfaces.sql` — adds super_admin SELECT policies to 16 admin-readable tables (`orders`, `vehicles`, `washer_ratings`, `device_tokens`, `notification_preferences`, `notification_log`, `approval_audit`, `support_tickets`, `support_conversations`, `support_messages`, …). Discovered by `smoke-p6-p7-p8.js` — P6/P7 writes worked via SECURITY DEFINER but the admin UI's PostgREST reads returned empty. Also fixes `admin_create_impersonation_token`'s `gen_random_bytes` / `digest` calls to schema-qualify as `extensions.*` and add `extensions` to its search_path (pgcrypto lives in the `extensions` schema in Supabase, not `public`).
- `0091_resolve_broadcast_segment_service_role.sql` — `resolve_broadcast_segment` now accepts super_admin OR service_role. Without this, the `send-broadcast` Edge Function's service-role JWT failed the `is_super_admin()` gate (no `sub` claim → `auth.uid()` IS NULL) and every broadcast silently HTTP 500'd with `sent_at=NULL`.

**History / Undo migrations (0092–0095, ADR-028):**
- `0092_admin_change_history.sql` — `admin_change_history` table + RLS (super_admin SELECT/INSERT) + realtime + the `capture_admin_change_history()` AFTER INSERT/UPDATE/DELETE trigger attached to all six override tables. Trigger is SECURITY DEFINER owned by postgres so its insert bypasses RLS and can never roll back the underlying edit (e.g. an `auth.uid()`-less migration write just records `changed_by=NULL`).
- `0093_admin_activity_feed_view.sql` — `admin_activity_feed` view (UNION ALL of `admin_change_history` + `admin_order_audit` + `admin_user_audit` + sent `broadcast_notifications`, normalized + a computed `undoable`/`category`); SELECT revoked from anon/authenticated. `get_admin_activity_feed(limit, before, entity_type)` SECURITY DEFINER RPC is the only read path (gates on `is_super_admin()`, keyset-paginates on `occurred_at`).
- `0094_admin_undo_rpcs.sql` — `admin_undo_change(p_history_id)` + internal `_admin_{source_row,update_source,insert_source,delete_source}` helpers (REVOKE'd from PUBLIC). Conflict guard compares the live row to the entry's `after_value`; pricing guard blocks pricing/payout undo while `pricing_source='config'`. The undo writes through the source table so the trigger logs the undo itself (tagged via the `app.change_note` GUC).
- `0095_admin_restore_user.sql` — extends `admin_user_audit.action` CHECK with `restore_user`; adds `admin_get_deletion_snapshot(p_audit_id)`. The actual auth-user recreation lives in the `admin-user-mgmt` Edge Function (`restore_user` action) — best-effort only (new id possible, relational rows not reconnected; see ADR-028).

**Migration discipline (lessons from the 0066 saga):**
- `npm run db:migrate --bootstrap` records every migration as applied *without* executing its SQL. A subsequent normal `db:migrate` will then skip the file. If schema objects are missing despite a migration existing for them, add a new heal migration (idempotent `… IF NOT EXISTS`) rather than running raw `ALTER` in the dashboard — the runner will pick it up on the next deploy.
- `scripts/audit-bootstrap.js` parses every migration file, queries the live DB, and reports any declared object that's missing. Run it after suspicious deploys.
- `CREATE OR REPLACE FUNCTION` **fails** when the `RETURNS TABLE` shape differs from the existing function (e.g. dropping or reordering columns). Prepend `DROP FUNCTION IF EXISTS public.<name>(<exact arg types>)` before the `CREATE` — the runner wraps each migration in a single `BEGIN`/`COMMIT`, so DROP + CREATE roll back atomically on failure.
- The contract surface for `nearby_jobs` (lat/lng) and the `agent_read_all_verification` storage policy are both asserted by `npm run db:verify`. `scripts/verify-live-surfaces.js` exercises the Approvals fetch, agent storage RLS, and `nearby_jobs` exclusion filter end-to-end against the live DB.
- **Supabase extensions live in the `extensions` schema, not `public`.** Any function calling `pg_net`, `pgcrypto`, `vault`, or `pgsodium` symbols must schema-qualify the call (`net.http_post`, `extensions.gen_random_bytes`, `extensions.digest`) AND include `extensions` in its `SET search_path`. Two production outages traced to this: 0080 fixed `pg_net.http_post` → `net.http_post` in `trigger_broadcast` (`pg_net` is the *extension* name; its symbols live in schema `net`); 0090 fixed unqualified `gen_random_bytes` / `digest` in `admin_create_impersonation_token`. When adding any new RPC that touches an extension, prefer the schema-qualified form from day one.
- **New super_admin-accessible tables need BOTH a write policy/RPC AND an explicit super_admin SELECT policy.** The admin app's reads go through PostgREST with the user's JWT and are RLS-gated. A missing super_admin SELECT policy = silently empty list in the admin UI, NOT an error. 0090 retrofitted SELECT policies onto 16 tables after the admin Jobs/Users tabs returned zero rows in production. Whenever you add an admin-readable table, include the super_admin SELECT policy in the same migration.

### Storage Buckets

- `car-photos` — consumer car photos uploaded at booking time (4 angles per order: front/back/driver/passenger). Path: `{consumer_id}/{order_id}/{angle}.jpg`. Washer can read photos for their assigned order.
- `job-evidence` — washer arrival photos + completion photos. Signed URLs (600 s TTL) fetched client-side for display in RatingModal and support-app ApprovalRow.
- `support-attachments` — support chat file attachments (private, 5 MB, jpg/png/webp). Create manually in Supabase dashboard; apply `supabase/storage_support.sql` for RLS.
- `washer-verification` — private bucket for washer onboarding documents (10 MB limit; jpg/png/webp/pdf). Paths: `{user_id}/id_document.jpg`, `{user_id}/selfie.jpg`, `{user_id}/business_license.{ext}`. Washer can read/insert/update/delete own folder; agents can read all. Bucket + RLS policies created by `0060_create_washer_verification_bucket.sql` and improved by `0061_improve_washer_verification_bucket.sql`. If bucket is missing after migration, run `npm run setup:buckets` (uses admin SDK) then `npm run db:migrate` to apply policies.

### Order Status State Machine (ADR-024)

```
pending → accepted → en_route → arrived → in_progress → pending_approval → completed
                                     ↑                             ↑            ↑
                         100 m geofence + 4 arrival photos   4 completion   agent approves
                                                             photos + GPS

pending_approval:
  - Washer LOCKED: cannot accept or be offered new jobs
  - Consumer sees "awaiting verification" — NO photos, NO rating
  - Agent approves → completed (consumer sees photos + rating modal)
  - Agent declines (with reason) → in_progress (washer can fix and resubmit)
  - After 3 declines: auto-escalate to support ticket

Agent overrides:
  agent can cancel from any non-terminal status
  agent can force-complete from any non-terminal status (bypasses photos/pending_approval)
Consumer can cancel: pending or accepted only
Washer can cancel: accepted or en_route only (their own job)
Any terminal state: no further transitions
```

### Pricing

Prices vary by vehicle category. Set by the `validate_order_prices` Postgres trigger — never trust client-supplied values. Client constants live in `src/lib/pricing.js`:

| Category | Consumer pays | Washer base | Platform margin |
|----------|--------------|-------------|-----------------|
| `private` | ₪100 | ₪60 | ₪40 |
| `jeep` | ₪120 | ₪80 | ₪40 |
| `pickup` | ₪130 | ₪90 | ₪40 |

**VAT:** 18% (included in all prices above).

**Washer payout is tiered** and locked at the `pending → accepted` transition. `payout_amount` is written to the order row and never changed. Tier constants live in `src/lib/payout.js`:

| Tier | Payout (private) |
|------|-----------------|
| Unrated (<3 rated jobs) | ₪50 |
| 1 | ₪40 |
| 2 | ₪45 |
| 3 | ₪50 |
| 4 | ₪55 |
| 5 | ₪60 |

`RATING_GATE_JOBS = 3`: a washer needs 3 rated jobs before their tier activates. Until then they earn the unrated default (₪50).

Service type is always `wash` (single product; no add-ons, no interior vs exterior distinction).

### Consumer Booking Flow

From `/home` (`src/pages/consumer/Home.jsx`):
1. **Vehicle selection** — `VehiclePickerSheet` loads saved vehicles; pre-selects the default. If none saved, shows `LicensePlatePicker` (plate lookup → data.gov.il CKAN API; manual fallback). Post-booking `SaveVehicleDialog` offers to save the vehicle.
2. **Car photos** — `CarPhotoUpload` captures 4 angles (front/back/driver/passenger); uploaded to `car-photos` bucket.
3. **Location pin** — `LocationSheet` + `MapPicker` let consumer drop a pin; address reverse-geocoded via Nominatim.
4. **Site resources** — toggles for `site_has_water` and `site_has_power`.
5. **Access notes** — free-text field for gate codes, parking instructions, etc.
6. Order is submitted; consumer navigates to `/order/:id` (tracking page).

### Israeli License Plate Lookup

`src/lib/vehicleLookup.js` queries the data.gov.il CKAN API (`{plate}` → make/model/color/year/category). Manual fallback fields shown on lookup failure. `LicensePlatePicker` is a single DOM element (never unmounts the input mid-flow). `formatPlate` formats the raw plate string for display.

**Found-state card** (shown after a successful lookup, before confirmation): plate badge at top, bold make+model line, muted `year · color · category · ₪price` line, Yes/No buttons. Outer card uses `dir="ltr"` (block layout, no flex) to prevent RTL cross-axis issues; individual text `<p>` elements use `dir="auto"` for Hebrew color strings. Strings are pre-computed before JSX to avoid expression edge cases. Category label uses `carLabels.*` i18n keys; price from `priceForCategory()` in `src/lib/pricing.js`.

### Order Tracking (`/order/:id`)

Real-time status via `useRealtimeOrder`. Shows a 5-step progress dot row (requested → assigned → en route → washing → complete). Consumer can:
- Cancel (if `pending` or `accepted`)
- Open in-order chat with washer (`OrderChatSheet`) — read-only once `pending_approval`
- Open support chat (`SupportChatSheet`)

**Rating Modal** appears after `completed` status if not yet rated. Shows 4 completion photos (signed URLs from `job-evidence`) + star picker. Calls `submit_rating` or `skip_rating` RPC.

### Order Chat (`order_messages`)

`src/components/chat/OrderChatSheet.jsx` — consumer↔washer direct messaging within an active order. Writable while status is `accepted`/`en_route`/`arrived`/`in_progress`; becomes read-only at `pending_approval` or later. Both parties read all history after completion. Uses `useOrderUnreadCount` hook for unread badge on the tracking page.

### Washer Dashboard (`/washer`)

`src/pages/washer/Dashboard.jsx` — full-screen map view (`WorkerMap`, lazy-loaded). Key UI:
- **OnlinePill** — avatar + online/offline toggle + `···` menu trigger
- **WasherMenu** — slide-in menu (earnings, shop, settings, support, sign out) with unread support badge
- **JobDrawer** — bottom sheet showing nearby pending jobs; tapping a job navigates to `/washer/job/:id`
- **NavLauncher** — deep-links to Google Maps / Waze after job acceptance
- GPS written to `profiles.current_location` (PostGIS) every 10 s while online

`useNearbyJobs` hook subscribes to realtime order changes and does client-side distance filtering.

### Approval Workflow

When a washer completes a job:
1. Washer uploads 4 arrival photos at the `en_route → arrived` step (stored in `job-evidence`)
2. Washer uploads 4 completion photos and submits GPS → `in_progress → pending_approval`
3. Agent sees the order in support-app Approvals tab
4. Agent reviews photos + washer GPS location card, clicks Approve
5. `transition_order_status` RPC sets status → `completed`, writes `approved_at`/`approved_by`

`ApprovalRow` shows a **previously-declined** banner when `orders.decline_count = 1–2` and an **escalated** banner at `decline_count ≥ 3` (the same threshold that auto-creates a support ticket in `decline_order`). The column comes back via the Approvals select in `support-app/src/lib/approvals.js` — guarded by `scripts/verify-db.js` and the `Approvals.fetch.test.js` contract test.

Legacy `evidence_before_path`/`evidence_after_path` video columns still exist in the DB schema but are never written by the current UI.

### Washer Verification (onboarding)

Consolidated overview of the verification pipeline (touchpoints are scattered across the doc):

- **Main app upload** — `src/pages/washer/Verify.jsx` collects ID + business license; `src/components/washer/SelfieVerificationModal.jsx` captures the live selfie and uploads it to `washer-verification/{userId}/selfie.jpg` (one path, upserted on retake). The submit handler inserts a `washer_verifications` row pointing at `selfie_path = '{userId}/selfie.jpg'`.
- **Storage bucket** — `washer-verification` (private, 10 MB, jpg/png/webp/pdf). Per-user folder; bucket + RLS created by 0060/0061. RLS policies on `storage.objects`: `washer_upload_own`, `washer_read_own`, `washer_update_own`, `washer_delete_own` (path-prefixed by `auth.uid()`), and `agent_read_all_verification` (`bucket_id = 'washer-verification' AND EXISTS … role='agent'`) — the last is what lets the support-app render selfies. Re-asserted idempotently by 0068.
- **Agent fetch** — `support-app/src/lib/washerVerifications.js` calls the `get_washer_verifications(p_status)` security-definer RPC (added 0062, schema-qualified in 0063) which joins `washer_verifications` with `profiles` and `auth.users` to expose `washer_name` / `washer_phone` / `washer_email` flat columns the support-app needs. Per-doc signed URLs are fetched via `getVerificationSignedUrl` against the `washer-verification` bucket.
- **Agent UI** — support-app **Washer Verifications tab** (`/`, "אימות"); see the support-app Dashboard section below for tab layout.
- **Decision RPC** — `review_washer_verification(p_verification_id, p_decision, p_reason?)` flips the row's status and mirrors to `profiles.washer_verification_status`.

### Support Chat (Main App)

`support_conversations` / `support_messages` is the support chat system. Consumer and washer both reach `/support` from the main app. `SupportChatSheet` is used inline on the tracking page and washer job screen. `useSupportConversation` and `useSupportUnread` / `useChatUnread` manage subscriptions and badge counts.

### Support App (`support-app/`)

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

### Admin App (`admin-app/`)

Super-admin-only web console at port 3002. Web-only — no Capacitor, no Android project. Vercel Root Directory `admin-app`. Auth isolation via Supabase `storageKey: 'wash-admin-auth'`. No public signup — provision via Supabase dashboard then `UPDATE profiles SET role='super_admin' WHERE id=...`. Login auto-signs-out non-super-admins; suspended super_admins are blocked by AuthContext too (though `admin_suspend_user` refuses to suspend a super_admin in the first place).

Routes: `/login`, `/` (Dashboard with tabs), all tab content rendered in-place.

**Dashboard has seven tabs** (plus the Design Editor):

- **Content tab** — `content_overrides` editor: per-key per-locale edits + per-row reset + JSON export + drift report against bundled i18next resources (`npm run drift:content`).
- **Branding tab** — `app_branding` row editor + `brand-assets` bucket upload. Surfaces an explicit warning when an asset is mobile-baked (icon, splash, monochrome notification icon) and requires a Capacitor rebuild rather than a runtime swap.
- **Broadcasts tab** — composer for EN + HE title/body + optional deep link + segment filter (role, locale, washer tier, online); confirm interstitial showing resolved recipient count; history list with sent/failed counts. Submit calls `trigger_broadcast(id)` which fires `send-broadcast` Edge Function.
- **Config tab** — `app_config` knob editor + `pricing_config` / `payout_tier_config` table editors. `pricing_source` flag is the master switch; see config note below.
- **Live Jobs tab (P6)** — full order control: realtime job list, force-status (calls `transition_order_status` with `p_admin_override=true`), reassign washer (`admin_reassign_washer`), override price/payout (`admin_override_order_price`), edit/replace photos (audited via `admin_log_photo_replacement`), manually create orders on behalf of a consumer (`admin_create_order_for_consumer`). Every write audited to `admin_order_audit`.
- **Users tab (P7)** — view/edit profile, suspend/unsuspend (`admin_suspend_user` / `admin_unsuspend_user`), merge accounts (`admin_merge_users`), delete (via `admin-user-mgmt` Edge Function — needs service role), impersonate (`admin_create_impersonation_token` → URL passed to main app's `impersonate-redeem` Edge Function). Activity tab reads `admin_user_activity`. Every write audited to `admin_user_audit`.
- **History tab (ADR-028)** — `admin-app/src/pages/History.jsx`: one chronological feed across all admin sections via `get_admin_activity_feed` (live-updating on `admin_change_history` INSERT), with filter pills (All / Content / Branding / Config / Design / Orders / Users / Broadcasts). Override edits show a before→after diff and a one-click **Undo** (`admin_undo_change`, conflict- + pricing-guarded); deleted users show a **Restore (best-effort)** button (warning + type-email confirm → `admin-user-mgmt` `restore_user`); everything else is a muted "Not reversible" log entry. Wrappers in `admin-app/src/lib/adminHistory.js`.

**Impersonation flow:** admin issues a one-time token in Users tab → opens main app with `?impersonate=<token>` → main app calls `impersonate-redeem` Edge Function which validates the hash + expiry + consumed_at, swaps the session, marks `consumed_at` → main app shows a persistent amber banner identifying both the originator (admin) and the impersonated user. All subsequent writes are audited with both identities (originator + actor).

**Suspension takeover:** all three apps' `AuthContext` re-checks `profiles.suspended_at` on every profile fetch. A non-null value triggers immediate `signOut()` and renders a takeover screen with the `suspended_reason`. Super_admin role is exempt at the RPC layer (`admin_suspend_user` raises if `target.role='super_admin'`) — there is no admin → admin lockout path.

**Config note — `pricing_source`:** defaults to `'hardcoded'`. The dual-path `validate_order_prices` / `payout_for_tier` / `recompute_washer_tier` (0078) only consult `pricing_config` / `payout_tier_config` when `pricing_source='table'`; otherwise they COALESCE-fallback to the original hardcoded values from `src/lib/pricing.js` / `src/lib/payout.js`. **MUST stay at `'hardcoded'` until a human verifies the table-driven path against staging** — this is a deliberate un-flipped switch, not an oversight.

### Live Design Editor (P8)

Tap-to-edit visual override system for a registered set of component surfaces in the main + support apps. Reference: ADR-027.

- **Manifest** — `admin-app/src/data/editableManifest.json` enumerates every editable surface by id (currently 20: 7 consumer + 6 washer + 7 support). New ids require a manifest entry AND a code-side `<Editable id="…">` wrapper.
- **Render path** — `<Editable id="…" defaults={...}>` HOC in `src/components/editable/` (main) and `support-app/src/components/editable/` (support) reads `DesignOverridesContext` (provider loads `design_overrides` on boot from `src/lib/designOverrides.js` and subscribes to Realtime changes) and applies overrides as inline styles on the wrapper. No JSX structural change — overrides are visual only.
- **Edit mode** — entered via `?design_edit=1` (sets a sessionStorage flag) when the current session is super_admin. In edit mode, `<Editable>` becomes click-targetable and dispatches a `design-edit-open` CustomEvent that `DesignEditOverlay` listens for; the overlay slides in a per-surface inspector. The planned server-validated edit-token redeem (`design-edit-token-redeem`) was NOT built — real protection is RLS on `design_overrides` + the bound-validating `admin_set_design_override` RPC (caps: padding 0–48 px, text_size 0.7–1.5×, radius 0–32 px, offset ±100 px). The `121212` password gate on the admin Design Editor tab (`admin-app/src/pages/DesignEditor.jsx`) is a soft accidental-entry guard, **NOT security** — don't rely on it.
- **Non-goals** — no JSX structural changes; no absolute repositioning; no editing of SVG components (`WashMark`, `MapBG` stay code); the editor does not edit the admin app itself.

### Push Notifications

FCM (Firebase Cloud Messaging) push via three Supabase Edge Functions (`send-notification`, `fan-out-nearby-job`, `send-broadcast`) plus auxiliary admin helpers (`impersonate-redeem`, `admin-user-mgmt`). Native Capacitor only — web/PWA shows an inline toast for foreground notifications but does not register push tokens.

**`send-notification`** (`supabase/functions/send-notification/index.ts`)
- Accepts `{ user_id, event_type, data }` from DB triggers (authenticated via `TRIGGER_SECRET`)
- Checks `notification_preferences` (user opt-in) and `device_tokens` (FCM tokens)
- Resolves locale from `profiles.locale`, picks i18n copy from an inline COPY map
- Sends FCM HTTP v1; caches OAuth2 access token for 50 min across warm instances
- Deletes dead tokens (`UNREGISTERED`/`INVALID_ARGUMENT`) automatically
- Logs every attempt to `notification_log`

**`fan-out-nearby-job`** (`supabase/functions/fan-out-nearby-job/index.ts`)
- Called by `trg_notify_on_new_order` (single `net.http_post` per new order INSERT)
- Calls `find_nearby_washers_for_order` RPC (default 15 km, configurable via `NEARBY_JOB_RADIUS_METERS`)
- Batch-inserts into `order_washer_notifications` (dedup), then calls `send-notification` once per eligible washer
- Re-run safe: already-notified washers excluded by the dedup table

**`send-broadcast`** (`supabase/functions/send-broadcast/index.ts`)
- Called by `trigger_broadcast` RPC (super_admin only) via `net.http_post`; auth via `TRIGGER_SECRET`
- Idempotency: rejects if the broadcast row's `sent_at` is non-null
- Rate limit: rejects if any other broadcast was sent in the previous 10 minutes
- Calls `resolve_broadcast_segment(id)` (0091 lets service_role through) → list of `user_id`s
- `Promise.allSettled` POSTs `send-notification` per user with `event_type='admin_broadcast'` and title/body/route in `data`
- Updates `sent_count` / `failed_count` / `sent_at` on the broadcast row

**Supported event types:** `order_accepted`, `washer_on_way`, `washer_arrived`, `wash_completed`, `wash_pending_review`, `wash_complete_consumer`, `wash_declined`, `order_approved`, `order_cancelled`, `customer_cancelled`, `new_chat_message`, `new_job_nearby`, `support_message`, `support_resolved`, `tier_changed`, `admin_broadcast`

**Promo opt-in (0073):** `notification_preferences.promos_enabled` is a SEPARATE opt-in for `admin_broadcast`. `send-notification` short-circuits with `event_type='admin_broadcast' AND promos_enabled=false`. The transactional `enabled` flag still gates everything else — turning off promos does NOT silence order/support notifications. `NotificationsSection.jsx` renders a second toggle below the master one.

**DB triggers:**
- `trg_notify_on_order_change` (orders UPDATE, status change) → `pending_approval`: notifies washer (`wash_pending_review`); `completed`: notifies washer (`order_approved`) + consumer (`wash_complete_consumer`); `in_progress` from `pending_approval` (decline): notifies washer (`wash_declined`); `cancelled`: branches by `cancelled_by`
- `trg_notify_on_new_order` (orders INSERT) → `fan-out-nearby-job`
- `trg_notify_on_support_message` (support_messages INSERT, agent/system sender only)
- `trg_notify_on_support_resolution` (support_conversations UPDATE, first terminal transition only)
- `trg_notify_on_tier_change` (profiles UPDATE, non-null tier change only)

**Client side** (`src/lib/notifications.js`):
- `initNotifications({ navigate, showToast })` — called once on login by `NotificationsInit` in the router; creates 4 Android notification channels (`wash_chirp`, `wash_chime`, `wash_bell`, `wash_gentle`) before `PushNotifications.register()`; upserts token into `device_tokens`
- `unregisterToken()` — deletes the FCM token from DB on sign-out
- `getOsPermissionState()` — returns `'granted'|'denied'|'prompt'|'web'`

**Notification sounds** (available options): `chirp`, `chime`, `bell`, `gentle`. MP3 files in `public/sounds/{name}.mp3` (web preview) and `android/app/src/main/res/raw/{name}.mp3` (native). Stored in `notification_preferences.sound`; picked in the `NotificationsSection` component (shared by consumer `/profile/settings` and washer `/washer/settings`). The Edge Function sets `channel_id: wash_${sound}` so Android routes to the pre-created channel with the correct sound URI. Android O+ requires channel sound to be set at creation time — the 4 channels are created idempotently on every app init.

**Required Vault secrets:** `edge_function_url`, `service_role_key`, `fan_out_nearby_job_url`
**Required Edge Function secrets:** `TRIGGER_SECRET`, `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_JSON`, `NEARBY_JOB_RADIUS_METERS`

### Realtime

Supabase Realtime channels drive live UX:
- `order:{orderId}` — consumers and washers watch order status changes (`useRealtimeOrder`)
- `order-panel-{orderId}` — support-app `OrderPanel` subscribes to UPDATE events on the linked order
- `approvals-view` — support-app Approvals tab subscribes to order UPDATE events
- `tickets-view` / `ticket-badge` — support-app Tickets tab
- `pending-badge` — support-app pending approval count badge
- Washer GPS written to `profiles.current_location` (PostGIS) every 10 s when online; `last_lat`/`last_lng`/`last_location_at` also written
- support-app subscribes to `profiles` row changes to show live washer location in Approvals and `UserPanel`

### Mobile (Capacitor)

`capacitor.config.json` wraps the `dist/` web build as `com.sparklego.app`. `src/hooks/useGeolocation.js` falls back to Capacitor's native geolocation API when the browser API is unavailable. Build APK via `update.ps1` or Android Studio; output is `wash-latest.apk` in the project root. The APK (and the support APK) both carry the `content_overrides` + `design_overrides` loaders, so admin edits propagate to native users on next app open without requiring a Play Store push.

### Support App Deployment

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

### Dark Mode

`darkMode: 'class'` in Tailwind config — the `.dark` class must be applied explicitly to an ancestor `div`. **Both consumer and washer** can toggle dark mode (ADR-023); washer defaults to dark, consumer defaults to light when `display_preference` is unset.

`useTheme()` returns `{ isDark, theme, setTheme }` and reads/writes `profiles.display_preference`. It does **not** touch the DOM — the shell component is responsible for applying `.dark`. Canonical shell pattern:
```jsx
const { isDark } = useTheme()
return <div className={`${isDark ? 'dark ' : ''}h-full bg-surface text-ink`}>
```

Applied in: `ConsumerLayout` (consumer inner routes), `WasherMapShell`, `WasherShell`, `Support.jsx`, `Profile.jsx`.

### Shared Settings Components

- `src/hooks/useLocale.js` — reads `profile.locale`, writes `profiles.locale` via Supabase + calls `i18n.changeLanguage`. Used by both consumer and washer settings pages.
- `src/components/settings/PillRow.jsx` — animated horizontal pill selector (Framer Motion `LayoutGroup`). Props: `groupId`, `options [{value, label}]`, `value`, `onChange`. Used for Language, Display, Navigation in washer/Settings and Language in consumer/Settings.
- `src/components/settings/NotificationsSection.jsx` — OS permission state + master enabled toggle + sound picker. Shared between consumer `/profile/settings` and washer `/washer/settings`. Uses `upsert` on `notification_preferences`.
- `src/components/settings/AppearanceSection.jsx` — dark/light mode toggle. Consumer-only (washer Settings uses `PillRow` + `GridPill` for Display directly).
- `src/lib/format.js` — `toTitleCase(name)` utility for display names.

**Washer Settings (`/washer/settings`) note:** contains a local `GridPill` component (2×2 grid, used for the ringtone section) that depends on a module-level `const SPRING = { type: 'spring', stiffness: 300, damping: 30 }`. Do not remove this constant during refactors — it is not imported from `PillRow`.

### Tests

Main-app suite lives under `src/**/__tests__/` and `src/__tests__/`; support-app suite under `support-app/src/__tests__/`; admin-app suite under `admin-app/src/__tests__/`. All three use Vitest + jsdom + Testing Library.

`src/test/setup.js` is the global Vitest setup file (loaded via `vite.config.js`'s `test.setupFiles`). It imports `@testing-library/jest-dom` and runs a global `beforeEach` that clears `sessionStorage` and `localStorage`. The reset exists because `SignUp.jsx` (and other surfaces) persist a draft to storage on every render; without the reset, state leaks across tests and reproduces hard-to-trace failures (see the washerSignup pollution incident). Don't remove it — write per-test seeding instead if a test genuinely needs persisted storage.

The Approvals / Verification / nearby_jobs contracts have dedicated regression guards: `scripts/verify-db.js` (column + RLS + return-shape assertions), `support-app/src/__tests__/Approvals.fetch.test.js` (select-string contract), `src/__tests__/useNearbyJobs.test.jsx` (lat/lng pass-through), and `scripts/verify-live-surfaces.js` (end-to-end live DB checks).

### i18n

**Main app:** `i18next` with English and Hebrew. Locale persisted in `localStorage` and stored on `profiles.locale`. Loaded in `src/main.jsx` before React renders. Locale files in `src/i18n/locales/en.json` and `he.json`.

**Support app:** i18n resources defined inline in `support-app/src/main.jsx` (no separate locale files). `fallbackLng: 'he'`. Locale key in localStorage: `support_locale`.

**Admin app:** same `i18next` setup; resources live under `admin-app/src/i18n/`. Locale key in localStorage: `admin_locale`.

**Runtime override layer (all three apps):** the shared module `src/lib/contentOverrides.js` exports `loadOverrides({ supabase, app, locale, i18n })` and `subscribeContentOverrides({ supabase, app, i18n })`. Both peer apps import it via relative path (`../../../src/lib/contentOverrides.js`) — `support-app/vite.config.js` and `admin-app/vite.config.js` both set `server.fs.allow: ['..']` so the dev server can resolve it outside the project root. On boot each app calls `loadOverrides` (hydrates from a stale-while-revalidate `localStorage` cache keyed `wash_content_overrides:v1:<app>:<locale>`, then fetches `content_overrides` rows for that `(app, locale)` and deep-merges them over the bundled bundle via `addResourceBundle`) then `subscribeContentOverrides` (Realtime channel on `content_overrides`; refetches the affected `(app, locale)` on any change). Admin edits in the Content tab — no redeploy needed, web users see changes on next reload, APK users on next app open.

### Vite Code Splitting

**Main app** (`vite.config.js`): manually chunks `leaflet`, `framer-motion`, and `@supabase/supabase-js`.

**Support app** (`support-app/vite.config.js`): same chunks plus `leaflet` for the `MiniMap` component used in Approvals and the chat `UserPanel`.

**Admin app** (`admin-app/vite.config.js`): chunks `framer-motion`, `@supabase/supabase-js`, and `leaflet` (used by Live Jobs map preview).
