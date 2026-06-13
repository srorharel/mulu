# DATABASE.md

Deep reference for the MULU backend: Supabase Postgres + PostGIS, RPCs, migrations, storage buckets, the order state machine, pricing/payout, and migration discipline. See **CLAUDE.md** for the index and load-bearing gotchas, **ARCHITECTURE.md** for app structure, **NOTIFICATIONS.md** for push.

## Tables

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
- `content_overrides` — runtime i18n override layer (`app`, `locale`, `key`, `value`); one row per (app, locale, key) triple. Anon SELECT, super_admin write. Each app deep-merges these rows over its bundled i18next resources on boot via `addResourceBundle`; see ARCHITECTURE.md i18n section.
- `app_branding` — runtime-swappable brand asset URLs by `slug` (logo, hero, splash, favicon, …); anon SELECT, super_admin write. URLs point at objects in the `brand-assets` storage bucket (also super_admin-write).
- `app_config` — runtime config knobs (`key TEXT PK`, `value JSONB`, `value_type TEXT` for admin-UI hinting). Anon SELECT, super_admin write. Read by RPCs/Edge Functions via `get_config_number(key, default)` / `get_config_text(key, default)`. Notable keys: `pricing_source` (see config note below), `nearby_job_radius_meters`, `arrival_geofence_meters`, `decline_escalation_threshold`. ⚠️ As of migration 0083 the arrival geofence in `transition_order_status` is **hardcoded to 100 m** (the config-driven lookup added in 0077 was lost in the 0083 rebuild) — `arrival_geofence_meters` is currently inert for arrivals until restored.
- `pricing_config` — per-category consumer/washer price rows. Read by `validate_order_prices` only when `app_config.pricing_source = 'table'`.
- `payout_tier_config` — per-tier (and unrated default) payout rows. Read by `payout_for_tier` / `recompute_washer_tier` only when `app_config.pricing_source = 'table'`.
- `broadcast_notifications` — admin-composed promo/announcement record (`title_en`, `title_he`, `body_en`, `body_he`, optional `deep_link_route`, `segment_filter` JSONB, `sent_at`, `sent_count`, `failed_count`); super_admin only. Push delivery is triggered by `trigger_broadcast` RPC.
- `admin_order_audit` — append-only log of every super_admin order action (`order_id`, `admin_id`, `action`, `reason`, `payload` JSONB). super_admin SELECT + INSERT; no anon.
- `admin_user_audit` — append-only log of every super_admin user action (`user_id`, `admin_id`, `action`, `reason`, `payload` JSONB). super_admin SELECT + INSERT; no anon.
- `impersonation_tokens` — one-time, hashed (`extensions.digest(sha256)`) tokens for the admin "open main app as user" flow (`token_hash`, `admin_id`, `target_user_id`, `expires_at`, `consumed_at`). super_admin INSERT (via `admin_create_impersonation_token`); redeem path via the `impersonate-redeem` Edge Function.
- `design_overrides` — runtime visual-property overrides by component id (`component_id`, `property`, `value`, `updated_by`, `updated_at`); anon SELECT, super_admin write. Bound-validated by `admin_set_design_override` RPC; consumed by the `<Editable>` HOC in main + support apps (see ARCHITECTURE.md Live Design Editor section).
- `admin_change_history` — unified before/after capture for the six runtime-editable override tables (`entity_type`, `entity_key`, `action` create/update/delete, `before_value`/`after_value` jsonb, `note`, `changed_by`, `changed_at`); super_admin SELECT + INSERT, realtime. Written by the `capture_admin_change_history()` AFTER trigger on `content_overrides`, `app_branding`, `app_config`, `pricing_config`, `payout_tier_config`, `design_overrides` — triggers (not admin JS) so no write path can bypass capture (ADR-028). Feeds the admin History tab + scoped undo.

## RPC functions (security-definer, called from client unless noted)

- `nearby_jobs(washer_lat, washer_lng, radius_km)` — spatial query returning pending orders within distance; **deliberately excludes `key_location`** until after acceptance (ADR-007); excludes washers with active or `pending_approval` orders (ADR-024). **Return shape includes `lat`/`lng`** (computed via `ST_Y`/`ST_X`) — consumed by `WorkerMap.jsx` to render pin markers. Any rewrite must preserve the 13-column shape (superset only) AND use `DROP FUNCTION IF EXISTS` first — `CREATE OR REPLACE FUNCTION` fails if the `RETURNS TABLE` shape differs. `scripts/verify-db.js`, `src/__tests__/useNearbyJobs.test.jsx`, and `src/__tests__/nearbyJobsShape.contract.test.js` guard this contract.
- `get_washer_active_job()` — returns the washer's current in-flight order (includes `pending_approval` status per ADR-024)
- `transition_order_status(order_id, new_status, washer_lat?, washer_lng?, p_admin_override?)` — enforces allowed state transitions; requires 4 arrival photos + arrival-geofence (100 m hardcoded as of 0083) for `en_route → arrived`; requires 4 completion photos + GPS for `in_progress → pending_approval`; blocks `pending → accepted` if washer has active/pending-approval job; agent can cancel or force-complete from any non-terminal status; writes `approved_at`/`approved_by` on agent completes; writes `submitted_for_approval_at` on submission; writes `approval_audit` on agent approve. **5-arg as of migration 0083:** added `p_admin_override boolean DEFAULT false` — when true AND caller is super_admin, photo/GPS/geofence checks are bypassed (audited to `admin_order_audit`). The DEFAULT preserves all existing 4-arg call sites. Allowed-transition matrix + gates are guarded by `src/__tests__/transitionOrderStatus.stateMachine.test.js`; param names by `transitionOrderStatus.contract.test.js`.
- `decline_order(p_order_id, p_reason)` — agent-only; reverts `pending_approval → in_progress` with reason (≥3 chars); increments `decline_count`; writes `approval_audit`; auto-creates support ticket at the config-driven threshold (`decline_auto_escalate_count`, default 3, per 0077). Guarded by `src/__tests__/declineOrder.contract.test.js`.
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

## Migrations

Migrations live in `supabase/migrations/` (0001–0110). Run `npm run db:migrate` to apply. `supabase/seed.sql` creates 5 test accounts (password `Test1234!`): `consumer1@test.dev`, `consumer2@test.dev`, `washer1@test.dev`, `washer2@test.dev`, `washer3@test.dev`.

### Notable recent migrations
- `0066_approval_lifecycle.sql` — adds `orders.decline_count` and `orders.submitted_for_approval_at`, the `approval_audit` table + RLS + indexes, and the `washer_has_pending_approval` helper. Also redeclares `nearby_jobs` with the new busy-washer exclusion filter — **the redeclaration is a strict superset of the live shape and MUST keep `lat`/`lng` in the return** (a prior draft accidentally dropped them and would have killed the washer map). Uses `DROP FUNCTION IF EXISTS` before `CREATE OR REPLACE` to allow the redeclaration to succeed even if Postgres deems the shape changed.
- `0067_ensure_orders_decline_count.sql` — idempotent `ALTER TABLE … ADD COLUMN IF NOT EXISTS decline_count`. Heals deployments where 0066 was bootstrapped or rolled back without leaving the column behind.
- `0068_ensure_washer_verification_agent_read.sql` — idempotent recreate of the `agent_read_all_verification` storage policy on `storage.objects` so agents can read selfie / ID / license objects from the `washer-verification` bucket. Mirrors the `job-evidence` agent-read pattern from 0020.

### Admin / CMS migrations (0069–0091)
- `0069_super_admin_role.sql` — extends `profiles_role_check` with `super_admin`; adds `is_super_admin()`; drops the inert `is_admin()` helper and its two dead policies (zero callers; the `admin` role was never added in 0027).
- `0070_content_overrides.sql` — `content_overrides` table + RLS (anon read, super_admin write) + realtime publication. Runtime i18n override layer for all three apps.
- `0071_brand_assets.sql` — public `brand-assets` storage bucket + `app_branding` table; super_admin write on both.
- `0072_broadcast_notifications.sql` — `broadcast_notifications` table + RLS + `resolve_broadcast_segment(p_broadcast_id)` RPC.
- `0073_promos_optin.sql` — `notification_preferences.promos_enabled boolean DEFAULT true`. Separate opt-in for admin promo broadcasts; transactional `enabled` still gates everything else.
- `0074_trigger_broadcast.sql` — `trigger_broadcast(p_broadcast_id)` RPC; validates row + `net.http_post`s the `send-broadcast` Edge Function.
- `0075_app_config.sql` — `app_config` table + `get_config_number` / `get_config_text` helpers.
- `0076_radius_from_config.sql` — `find_nearby_washers_for_order` reads radius from `app_config.nearby_job_radius_meters` with hardcoded fallback.
- `0077_geofence_decline_from_config.sql` — `transition_order_status` arrival geofence + `decline_order` auto-escalation threshold read from `app_config` with hardcoded fallback. ⚠️ The geofence half was later overwritten by 0083 (see audit) — the `decline_auto_escalate_count` half is still live.
- `0078_pricing_payout_from_config.sql` — `pricing_config` + `payout_tier_config` tables + dual-path `validate_order_prices` / `payout_for_tier` / `recompute_washer_tier` (gated by `app_config.pricing_source`, COALESCE-fallback to hardcoded values).
- `0079_super_admin_profile_read.sql` — super_admin SELECT policy on `profiles` (so admin UI can resolve "edited by <name>" metadata).
- `0080_fix_pg_net_schema_refs.sql` — fixes `trigger_broadcast` to call `net.http_post` (not `pg_net.http_post` — see Migration discipline below).
- `0081_admin_order_audit.sql` — `admin_order_audit` table + RLS (super_admin SELECT + INSERT).
- `0082_admin_order_rpcs.sql` — `admin_create_order_for_consumer`, `admin_reassign_washer`, `admin_override_order_price`, `admin_log_photo_replacement` RPCs; adds `orders.created_by_admin`; adds super_admin write policies on `car-photos` + `job-evidence` storage objects.
- `0083_transition_order_status_admin_override.sql` — adds `p_admin_override boolean DEFAULT false` 5th arg to `transition_order_status`; bypasses photo/GPS/geofence checks when caller is super_admin. ⚠️ Rebuilt from the 0066 body, so it reverted 0077's config-driven arrival geofence back to a hardcoded `> 100`.
- `0084_admin_user_audit.sql` — `admin_user_audit` table + RLS (mirrors 0081).
- `0085_profiles_suspension.sql` — `profiles.suspended_at` / `suspended_reason` / `suspended_by` columns.
- `0086_admin_user_rpcs.sql` — `admin_get_user_auth`, `admin_update_profile`, `admin_suspend_user` / `admin_unsuspend_user` (with super_admin lockout guard), `admin_merge_users`, `admin_user_activity` RPCs.
- `0087_impersonation_tokens.sql` — `impersonation_tokens` table + `admin_create_impersonation_token` RPC (issues 32-byte hashed one-time token).
- `0088_design_overrides.sql` — `design_overrides` table + RLS + realtime publication.
- `0089_admin_design_rpcs.sql` — `admin_set_design_override` (bound-validating), `admin_clear_design_override`, `admin_reset_all_design_overrides` RPCs.
- `0090_super_admin_read_all_admin_surfaces.sql` — adds super_admin SELECT policies to 16 admin-readable tables (`orders`, `vehicles`, `washer_ratings`, `device_tokens`, `notification_preferences`, `notification_log`, `approval_audit`, `support_tickets`, `support_conversations`, `support_messages`, …). Discovered by `smoke-p6-p7-p8.js` — P6/P7 writes worked via SECURITY DEFINER but the admin UI's PostgREST reads returned empty. Also fixes `admin_create_impersonation_token`'s `gen_random_bytes` / `digest` calls to schema-qualify as `extensions.*` and add `extensions` to its search_path (pgcrypto lives in the `extensions` schema in Supabase, not `public`).
- `0091_resolve_broadcast_segment_service_role.sql` — `resolve_broadcast_segment` now accepts super_admin OR service_role. Without this, the `send-broadcast` Edge Function's service-role JWT failed the `is_super_admin()` gate (no `sub` claim → `auth.uid()` IS NULL) and every broadcast silently HTTP 500'd with `sent_at=NULL`.

### History / Undo migrations (0092–0095, ADR-028)
- `0092_admin_change_history.sql` — `admin_change_history` table + RLS (super_admin SELECT/INSERT) + realtime + the `capture_admin_change_history()` AFTER INSERT/UPDATE/DELETE trigger attached to all six override tables. Trigger is SECURITY DEFINER owned by postgres so its insert bypasses RLS and can never roll back the underlying edit (e.g. an `auth.uid()`-less migration write just records `changed_by=NULL`).
- `0093_admin_activity_feed_view.sql` — `admin_activity_feed` view (UNION ALL of `admin_change_history` + `admin_order_audit` + `admin_user_audit` + sent `broadcast_notifications`, normalized + a computed `undoable`/`category`); SELECT revoked from anon/authenticated. `get_admin_activity_feed(limit, before, entity_type)` SECURITY DEFINER RPC is the only read path (gates on `is_super_admin()`, keyset-paginates on `occurred_at`).
- `0094_admin_undo_rpcs.sql` — `admin_undo_change(p_history_id)` + internal `_admin_{source_row,update_source,insert_source,delete_source}` helpers (REVOKE'd from PUBLIC). Conflict guard compares the live row to the entry's `after_value`; pricing guard blocks pricing/payout undo while `pricing_source='config'`. The undo writes through the source table so the trigger logs the undo itself (tagged via the `app.change_note` GUC).
- `0095_admin_restore_user.sql` — extends `admin_user_audit.action` CHECK with `restore_user`; adds `admin_get_deletion_snapshot(p_audit_id)`. The actual auth-user recreation lives in the `admin-user-mgmt` Edge Function (`restore_user` action) — best-effort only (new id possible, relational rows not reconnected; see ADR-028).

### Legal docs / account deletion / UGC migrations (0107–0110, ADR-036–039)
- `0107_legal_documents.sql` — `legal_documents` (versioned; partial unique index `one is_current per (doc_type,locale)`; unique `(doc_type,locale,version)`) + `user_legal_acknowledgments`. SECURITY DEFINER RPCs `publish_legal_document` (agent-gated, demote-before-insert), `get_current_legal_document` (he-fallback), `pending_legal_acknowledgments` (role-filtered), `acknowledge_legal_document`. Adds `legal_documents` to realtime; seeds v1 he skeletons for all three doc types.
- `0108_legal_update_fanout.sql` — `legal_update_audience(doc_type)` (role + opt-in) + `notify_on_legal_publish()` AFTER-INSERT-`WHEN is_current` trigger → one `net.http_post` to `fan-out-legal-update` (Vault `fan_out_legal_update_url`).
- `0109_account_deletion_fk_setnull.sql` — relaxes `orders.consumer_id` (drops NOT NULL), `orders.washer_id`, `order_events.actor_id` to **ON DELETE SET NULL** so a profile can be deleted while its orders/events are preserved (anonymized). Powers the `delete-account` Edge Function (ADR-038).
- `0110_content_reports_blocks.sql` — `content_reports` (reporter own insert/read; agents read+update all via `is_agent()`; realtime) + `content_blocks` (owner-scoped). UGC report/block (ADR-039).
- `0111_first_wash_discount.sql` — `orders.discount_percent`/`discount_amount` columns + `validate_order_prices` applies a 30% first-wash discount (ADR-040): consumer's first non-cancelled order, platform absorbs (base_price/payout untouched, platform_fee shrinks), advisory xact lock per consumer against concurrent double-claims. Pinned by `firstWashDiscount.contract.test.js`.
- `0112_backfill_locale_hebrew.sql` — backfills legacy `profiles.locale='en'` rows (pre-0064 default, incl. seed test accounts) to `'he'`. Logging into such an account flipped the whole device to English via `AuthContext.syncLocale`, which then persists to localStorage.
- `0113_receipts.sql` — `receipts` table (sequential `receipt_number_seq` from 1001, UNIQUE order_id, consumer + business + financial snapshots) + 9 admin-editable `app_config` receipt keys + `issue_receipt_on_completion` SECURITY DEFINER trigger (orders → `'completed'`: insert receipt, ONE `net.http_post` to `send-receipt` via Vault **`send_receipt_url`**) + `admin_resend_receipt(uuid)` (super_admin-gated re-fire). RLS: consumer own SELECT + super_admin SELECT. Receipt email = Resend API (ADR-041). Pinned by `receipts.contract.test.js`.
- `0114_receipts_backup.sql` — `receipts.pdf_path` + private `receipts` storage bucket (PDF-only, 5 MB) + `super_admin_read_receipts` storage policy. `send-receipt` archives every חשבונית מס/קבלה PDF to `<year>/invoice-receipt-<n>.pdf` before emailing; admin tab downloads via signed URL. **Deliberately not purged by delete-account** (retained financial records).

### Migration discipline (lessons from the 0066 saga)
- `npm run db:migrate --bootstrap` records every migration as applied *without* executing its SQL. A subsequent normal `db:migrate` will then skip the file. If schema objects are missing despite a migration existing for them, add a new heal migration (idempotent `… IF NOT EXISTS`) rather than running raw `ALTER` in the dashboard — the runner will pick it up on the next deploy.
- `scripts/audit-bootstrap.js` parses every migration file, queries the live DB, and reports any declared object that's missing. Run it after suspicious deploys.
- `CREATE OR REPLACE FUNCTION` **fails** when the `RETURNS TABLE` shape differs from the existing function (e.g. dropping or reordering columns). Prepend `DROP FUNCTION IF EXISTS public.<name>(<exact arg types>)` before the `CREATE` — the runner wraps each migration in a single `BEGIN`/`COMMIT`, so DROP + CREATE roll back atomically on failure.
- The contract surface for `nearby_jobs` (lat/lng) and the `agent_read_all_verification` storage policy are both asserted by `npm run db:verify`. `scripts/verify-live-surfaces.js` exercises the Approvals fetch, agent storage RLS, and `nearby_jobs` exclusion filter end-to-end against the live DB. In CI, `src/__tests__/nearbyJobsShape.contract.test.js`, `transitionOrderStatus.stateMachine.test.js`, and `declineOrder.contract.test.js` parse the latest migration SQL directly (no live DB).
- **Supabase extensions live in the `extensions` schema, not `public`.** Any function calling `pg_net`, `pgcrypto`, `vault`, or `pgsodium` symbols must schema-qualify the call (`net.http_post`, `extensions.gen_random_bytes`, `extensions.digest`) AND include `extensions` in its `SET search_path`. Two production outages traced to this: 0080 fixed `pg_net.http_post` → `net.http_post` in `trigger_broadcast` (`pg_net` is the *extension* name; its symbols live in schema `net`); 0090 fixed unqualified `gen_random_bytes` / `digest` in `admin_create_impersonation_token`. When adding any new RPC that touches an extension, prefer the schema-qualified form from day one.
- **New super_admin-accessible tables need BOTH a write policy/RPC AND an explicit super_admin SELECT policy.** The admin app's reads go through PostgREST with the user's JWT and are RLS-gated. A missing super_admin SELECT policy = silently empty list in the admin UI, NOT an error. 0090 retrofitted SELECT policies onto 16 tables after the admin Jobs/Users tabs returned zero rows in production. Whenever you add an admin-readable table, include the super_admin SELECT policy in the same migration.
- **Avoid an inner `BEGIN;`/`COMMIT;` inside a migration file.** The runner already wraps every file in a single transaction; an inner `COMMIT` commits the runner's transaction early and defeats its atomicity guarantee (see 0069).

## Storage Buckets

- `car-photos` — consumer car photos uploaded at booking time (4 angles per order: front/back/driver/passenger). Path: `{consumer_id}/{order_id}/{angle}.jpg`. Washer can read photos for their assigned order.
- `job-evidence` — washer arrival photos + completion photos. Signed URLs (600 s TTL) fetched client-side for display in RatingModal and support-app ApprovalRow.
- `support-attachments` — support chat file attachments (private, 5 MB, jpg/png/webp). Create manually in Supabase dashboard; apply `supabase/storage_support.sql` for RLS.
- `receipts` — private bucket archiving every issued חשבונית מס/קבלה PDF (5 MB, `application/pdf` only). Path: `{year}/invoice-receipt-{number}.pdf`. Written only by the `send-receipt` Edge Function (service role); read by super_admins via signed URLs in the admin Receipts tab. **Retained on account deletion** — not in delete-account's purge list (0114).
- `washer-verification` — private bucket for washer onboarding documents (10 MB limit; jpg/png/webp/pdf). Paths: `{user_id}/id_document.jpg`, `{user_id}/selfie.jpg`, `{user_id}/business_license.{ext}`. Washer can read/insert/update/delete own folder; agents can read all. Bucket + RLS policies created by `0060_create_washer_verification_bucket.sql` and improved by `0061_improve_washer_verification_bucket.sql`. If bucket is missing after migration, run `npm run setup:buckets` (uses admin SDK) then `npm run db:migrate` to apply policies.

## Order Status State Machine (ADR-024)

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

The allowed-transition matrix + every gate is pinned by `src/__tests__/transitionOrderStatus.stateMachine.test.js` against the latest `transition_order_status` migration; the decline path by `declineOrder.contract.test.js`.

**Legacy:** `evidence_before_path`/`evidence_after_path` video columns still exist in the schema but are never written by the current UI (the support-app Approvals select still reads them — dead, always null).

## Pricing

Prices vary by vehicle category. Set by the `validate_order_prices` Postgres trigger — never trust client-supplied values. Client constants live in `src/lib/pricing.js`:

| Category | Consumer pays | Washer base | Platform margin |
|----------|--------------|-------------|-----------------|
| `private` | ₪100 | ₪60 | ₪40 |
| `jeep` | ₪120 | ₪80 | ₪40 |
| `pickup` | ₪130 | ₪90 | ₪40 |

**VAT:** 18% (included in all prices above).

**First-wash discount (ADR-040, 0111):** every consumer's first non-cancelled order gets **30% off `total_price`**, applied inside `validate_order_prices` at insert (cancelled orders don't burn it). The platform absorbs it: `base_price` and the tier-locked `payout_amount` are untouched; `platform_fee` shrinks by the discount, preserving `total_price = base_price + platform_fee`. `orders.discount_percent`/`discount_amount` record what was applied. Client mirror: `applyFirstWashDiscount` in `src/lib/pricing.js` + `useFirstWashDiscount` hook (display-only — the trigger decides). Guarded by `firstWashDiscount.contract.test.js`.

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

### Receipts (ADR-041, 0113)

When an order transitions INTO `completed`, the `issue_receipt_on_completion` trigger issues a row in `receipts` — sequential `receipt_number` (seq starts 1001), amounts + VAT split, and a **snapshot of the business config at issue time** (admin edits never rewrite history) — then fires ONE `net.http_post` to the `send-receipt` Edge Function, which emails the customer a Hebrew RTL receipt + wash confirmation via the **Resend API** and writes back `status` (`pending`/`sent`/`failed`). The email carries a **חשבונית מס/קבלה PDF attachment** generated in the function (pdf-lib + fontkit; Alef Hebrew font fetched from jsdelivr and cached per isolate; manual RTL visual-order conversion since PDFs have no bidi engine — RTL is on inner divs/tables in the HTML too, because Gmail strips `<html>`/`<body>` attributes). A PDF build failure degrades to a mail without the attachment, noted as `pdf_skipped:` in `error_detail`. Idempotent (UNIQUE order_id), kill-switched by `app_config.receipts_enabled`, exception-safe (never aborts the transition), skips consumer-less orders. The 9 `receipt_*`/`receipts_enabled` config keys are edited in the admin **Receipts** tab; `admin_resend_receipt(uuid)` re-fires the email server-side so Vault secrets never reach the client. `delete-account` anonymizes `receipts.consumer_name/email` (financial record retained, like orders).

**One-time setup (done 2026-06-12 unless noted):** Vault secret `send_receipt_url` ✓; `send-receipt` deployed ✓; `TRIGGER_SECRET` ✓; `RESEND_API_KEY` ✓; end-to-end verified ✓ (real email delivered via Resend's test sender `onboarding@resend.dev`, which is the current `receipt_sender_email` and only delivers to the Resend account owner `muluwash@gmail.com`). **Still required by a human: verify the real domain at resend.com/domains, then set `receipt_sender_email` to an address on it + fill עוסק מורשה/business details in the admin Receipts tab.** Until then customer sends fail soft (`resend_403` — resend from the admin tab after). Same date: `delete-account` + `fan-out-legal-update` were found **never deployed** and are now deployed, with Vault `fan_out_legal_update_url` created.

### Config note — `pricing_source`

Defaults to `'hardcoded'`. The dual-path `validate_order_prices` / `payout_for_tier` / `recompute_washer_tier` (0078) only consult `pricing_config` / `payout_tier_config` when `pricing_source='table'`; otherwise they COALESCE-fallback to the original hardcoded values from `src/lib/pricing.js` / `src/lib/payout.js`. **MUST stay at `'hardcoded'` until a human verifies the table-driven path against staging** — this is a deliberate un-flipped switch, not an oversight.
