# Architecture Decisions

## ADR-001: Manual Vite scaffold instead of `create-vite`
**Date:** 2026-05-01  
**Status:** Accepted  
**Context:** `create-vite` requires interactive TTY confirmation when the target directory is non-empty (it contains `.claude/`). Piping `y` did not work.  
**Decision:** Scaffolded the project manually by writing `package.json`, `vite.config.js`, `index.html`, `tailwind.config.js`, and `postcss.config.js` directly. Identical output to a `create-vite` scaffold.  
**Consequence:** None — structure is equivalent.

## ADR-002: `@hookform/resolvers` not in package.json (Step 1 only)
**Date:** 2026-05-01  
**Status:** Accepted  
**Context:** `react-hook-form` zod integration requires `@hookform/resolvers`.  
**Decision:** Added to `dependencies` alongside `zod`.  
**Consequence:** None.

## ADR-003: Default map center → Tel Aviv (32.08, 34.78)
**Date:** 2026-05-01  
**Status:** Accepted  
**Context:** The spec targets ILS pricing, implying an Israeli market. A sensible default center for the MapPicker fallback (when GPS is unavailable) is Tel Aviv.  
**Consequence:** Users outside Israel will still be able to drag/tap the map to any location.

## ADR-004: Profile `equipment_notes` field
**Date:** 2026-05-01  
**Status:** Accepted  
**Context:** The spec mentions "(washer) equipment notes" in the Profile screen but the DB schema does not include this column.  
**Decision:** UI field is included; the `0001_init.sql` migration will add `equipment_notes text` to `profiles`.  
**Consequence:** Slight schema extension beyond the literal spec.

## ADR-005: npm scripts can't run in this directory — use node directly
**Date:** 2026-05-01  
**Status:** Accepted  
**Context:** The project directory name contains `&&`, which Windows cmd.exe (used by npm scripts) interprets as a command separator, breaking `.cmd` shim paths in `node_modules/.bin`.  
**Decision:** Run Vite directly via `node .\node_modules\vite\bin\vite.js` instead of `npm run dev/build`. Documented in README.  
**Consequence:** Minor developer experience inconvenience — all functionality is unaffected.

## ADR-006: `zodResolver` import from `@hookform/resolvers/zod`
**Date:** 2026-05-01  
**Status:** Accepted  
**Context:** Standard pattern for react-hook-form + zod integration.  
**Decision:** Used throughout auth forms.

## ADR-007: key_location excluded from nearby_jobs RPC only
**Date:** 2026-05-01  
**Status:** Accepted  
**Context:** Key location is sensitive and should only be revealed to the assigned washer post-accept.  
**Decision:** Excluded from the `nearby_jobs` RPC SELECT. The direct-table RLS policy "orders: washer read pending" technically allows any online washer to read the full row (including key_location), but the app UI never surfaces it pre-accept. Column-level RLS would require a security-definer view — deferred as over-engineering for MVP.  
**Consequence:** A determined API caller could read key_location from a pending order. Accepted trade-off.

## ADR-008: Add-ons folded into base_price
**Date:** 2026-05-01  
**Status:** Accepted  
**Context:** Wiper fluid (₪20) and tire pressure (₪20) add-ons need pricing.  
**Decision:** Add-on prices are added to `base_price` (washer payout). Platform fee (15%) applies to the full base including add-ons. Mirrored exactly between `src/lib/pricing.js` and the `validate_order_prices` server trigger. Trigger overwrites all client-supplied price values on INSERT.  
**Consequence:** `base_price` represents total washer payout, not just service price.

## ADR-009: Evidence videos — 30 s / 50 MB, private bucket, immutable
**Date:** 2026-05-01  
**Status:** Accepted  
**Context:** Proof-of-work evidence is required before an order can be completed.  
**Decision:** Client validates duration (via video metadata) and file size before upload. Server enforces via `transition_order_status` exception on missing paths. Storage bucket `job-evidence` is private; INSERT restricted to assigned washer; SELECT to order parties; UPDATE/DELETE blocked. Path: `{order_id}/{type}.mp4`.  
**Consequence:** No new npm dependencies. Eruda debug tool loaded from CDN only in dev + `?debug=1`.

## ADR-010: Site resources visible pre-accept
**Date:** 2026-05-01  
**Status:** Accepted  
**Context:** Washer needs to know whether water and power are available before deciding to accept a job.  
**Decision:** `site_has_water` and `site_has_power` included in `nearby_jobs` RPC return and shown on Job Detail pre-accept. Not sensitive.  
**Consequence:** None.

## ADR-011: Support agent app as nested project under support-app/
**Date:** 2026-05-12  
**Status:** Accepted  
**Context:** The build prompt allows either a monorepo (apps/support/) or a sibling repo. The current repo has no monorepo tooling (no npm workspaces, no Turborepo).  
**Decision:** Created `support-app/` as a self-contained Vite project nested inside the same Git repo. Not a true monorepo — no shared package extraction. `support.js` is copied rather than shared via a local package. Shared environment variables (Supabase URL + anon key) are duplicated in both `.env` files.  
**Consequence:** Simpler setup; a real shared package can be extracted later when the surface area stabilizes.

## ADR-012: sender_role validated in support.js via profile fetch, not DB trigger
**Date:** 2026-05-12  
**Status:** Accepted  
**Context:** The build prompt warns against trusting client-supplied `sender_role`. A DB trigger that overwrites it is belt-and-suspenders; the alternative is validating in the client helper.  
**Decision:** `support.js#sendMessage` fetches the caller's profile (`id`, `role`) from Supabase before inserting the message. This adds one round-trip per send but avoids schema changes. The DB check constraint on `sender_role` still catches invalid values.  
**Consequence:** One extra DB query per message send (~5 ms on a warm connection). Acceptable for a support chat where latency is not critical.

---

## 2026-05-13 — Support agent app: nested project, not true monorepo or sibling repo

**Context.** The spec offered two options: a monorepo under `apps/support/` or a sibling repo `sparklego-support/`. Neither fit cleanly — the main repo has no workspace tooling, but a separate remote adds operational overhead.  
**Decision.** Created `support-app/` as a self-contained Vite project nested inside the same Git repo. Shares git history and is cloned together, but has its own `package.json`, `node_modules`, and `.env`. `support.js` is copied, not extracted to a shared package. See also ADR-011.  
**Alternatives considered.** npm workspaces monorepo: too much tooling churn for one extra app. True sibling repo: separate clone/deploy story, shared nothing.  
**Implications.** `support.js` diverges silently if edited in only one place. If a third app appears, extract to a proper workspace then.

## 2026-05-13 — Agent role on existing profiles.role, not a separate table

**Context.** Need a way to identify support agents in auth/RLS; could add a column to the existing `profiles` table or create a separate `support_agents` table.  
**Decision.** Extended the `profiles_role_check` constraint to include `'agent'` (migration `0011_support_role.sql`). Added `agent_display_name` and `agent_is_active` columns to `profiles`. Agents are Supabase auth users like everyone else.  
**Alternatives considered.** Separate `support_agents` table: cleaner schema isolation but doubles the auth lookup path; every RLS `is_agent()` function would need a join instead of a single profiles scan.  
**Implications.** Agents appear in `profiles` and could accidentally match consumer/washer queries if role filters are omitted. The `is_agent()` security-definer function centralises this check.

## 2026-05-13 — Nullable order_id in support_conversations (order-linked and general both supported)

**Context.** Support conversations can be opened from an active order ("Need help?" button) or from the general Support menu with no order context.  
**Decision.** `support_conversations.order_id` is `NULL`able with `ON DELETE SET NULL`. One table handles both cases; callers check `order_id IS NULL` to determine whether to show `OrderPanel` or `UserPanel` in the agent app.  
**Alternatives considered.** Separate `order_conversations` and `general_conversations` tables: cleaner constraints but doubles schema surface and client-side branching.  
**Implications.** Any query that uses `order_id` must handle NULL. The agent app's right-rail panel already branches on this.

## 2026-05-13 — Supabase Realtime (postgres_changes) over custom WebSocket layer

**Context.** Need live message delivery from DB insert to both chat participants without polling.  
**Decision.** All live delivery uses `supabase.channel(...).on('postgres_changes', ...)`. Transport is the Supabase Realtime WebSocket; no custom ws server, no third-party service (Ably, Pusher, etc.).  
**Alternatives considered.** Socket.io server: full control but requires separate infra. Ably/Pusher: adds vendor dependency and cost. Polling: acceptable latency cost but wastes battery/connections on mobile.  
**Implications.** Tied to Supabase Realtime row-level filtering, which requires tables to be in the `supabase_realtime` publication (see 2026-05-13 publication entry below). Realtime capacity is shared with order-status sync.

## 2026-05-13 — Presence-based typing indicators, not DB-row typing state

**Context.** Need to show "Agent is typing…" / user typing without writing rows on every keystroke.  
**Decision.** Typing state is tracked via Supabase Realtime Presence on a per-conversation channel (`typing:{convId}`). `useTypingPresence` calls `channel.track({ typing: true/false, name })` and listens to `on('presence', { event: 'sync' }, ...)`. No DB writes.  
**Alternatives considered.** A `typing_state` table with upsert + TTL trigger: durable but produces one DB write per keystroke per user, clogs the WAL, and requires cleanup jobs.  
**Implications.** Typing state is lost if the WebSocket drops. Presence channels are not subject to the publication — they work regardless of which tables are in `supabase_realtime`.

## 2026-05-13 — Read receipts: one timestamp per participant on conversation, not per-message

**Context.** Need to show "Seen" under the last sent message without the cost of a per-message read-state table.  
**Decision.** `support_conversations` has three nullable `timestamptz` columns: `opener_last_read_at`, `counterparty_last_read_at`, `agent_last_read_at`. The `mark_conversation_read` RPC updates the caller's column to `now()`. "Seen" is inferred by comparing message `created_at` against the other participant's read timestamp.  
**Alternatives considered.** A `message_reads` junction table (message_id, user_id, read_at): precise per-message receipts but O(messages × participants) rows; expensive for long threads.  
**Implications.** Can only show "read" on the most-recent message, not individually on every bubble. Unread count is approximate (conversation-level, not message-level). Acceptable for a support chat.

## 2026-05-13 — Hex constants in support-app Tailwind config, not CSS variables

**Context.** Original `support-app/tailwind.config.js` was built mirroring the main app — semantic tokens like `accent`, `ink`, `surface-elevated` were defined as `var(--color-*)` CSS variable strings. This matched the spec intent ("reuse design tokens").  
**Decision.** Switched all semantic token values to direct hex/rgba constants (e.g. `accent: '#7DD9A2'`, `ink.muted: '#a3a3a3'`). The CSS variables are still declared in `support-app/src/index.css` for base styles, but the Tailwind config does not reference them.  
**Alternatives considered.** Keeping CSS variables: clean for runtime theming but Tailwind v3 cannot decompose `var(--color-*)` strings into R/G/B channels, so `/opacity` modifier utilities like `ring-accent/30` and `bg-surface-elevated/60` silently fail to generate valid CSS.  
**Implications.** The support app cannot switch colour themes at runtime without a config rebuild. Not a concern — it is a single dark-mode-only tool. If runtime theming is ever needed, switch to the `rgb(R G B / <alpha-value>)` notation Tailwind v3 supports natively.

## 2026-05-13 — Migration runner: auto-discovery + schema_migrations state tracking

**Context.** `scripts/run-migrations.js` had a hardcoded file list (0001–0004) that stopped applying new migrations silently; support migrations 0011–0014 were never run by `npm run db:migrate`.  
**Decision.** Replaced the hardcoded list with `readdirSync` auto-discovery (filter `^\d{4}_.*\.sql$`, sort lexicographically). Applied versions are tracked in a `public.schema_migrations` table (version TEXT PRIMARY KEY). Each file's SQL and its `schema_migrations` insert run in the same transaction — partial apply is impossible. A `--bootstrap` flag (`npm run db:migrate:bootstrap`) records all existing files as applied without executing SQL, for databases that pre-date the tracker.  
**Alternatives considered.** Supabase CLI migrations: requires the CLI to be present and authenticated; adds a separate tool. Keeping the hardcoded list: too easy to forget to update, proved by the fact that it already broke once.  
**Implications.** Every new migration file is picked up automatically on next `npm run db:migrate`. The file naming convention (`NNNN_description.sql`) is now load-bearing — files must be zero-padded to sort correctly.

## 2026-05-13 — Explicit alter publication migration for Supabase Realtime

**Context.** Supabase Realtime only broadcasts `postgres_changes` for tables in the `supabase_realtime` publication. Tables created by raw SQL migrations are not added automatically.  
**Decision.** Migration `0015_realtime_publication.sql` explicitly adds `orders`, `support_messages`, and `support_conversations` using an idempotent `DO $$ ... $$` block that checks `pg_publication_tables` before each `ALTER PUBLICATION`. Discovered during support-chat debugging; the publication had zero tables, meaning order-status sync in the main app (`useRealtimeOrder`, `useNearbyJobs`) had also been silently non-functional.  
**Alternatives considered.** Adding tables via the Supabase dashboard Realtime UI: works but not reproducible and not tracked in `schema_migrations`. `FOR ALL TABLES` publication: indiscriminate, exposes tables that should not broadcast (e.g. `auth.users`).  
**Implications.** Every future table that needs live updates must get its own `ALTER PUBLICATION supabase_realtime ADD TABLE` statement, either in its creation migration or a follow-on. Adding it to the creation migration is the right default.

## 2026-05-13 — Auto-close cron deferred (no 7-day idle-close in v1)

**Context.** The spec called for conversations to auto-close after 7 days of agent-side inactivity via a scheduled function.  
**Decision.** Not built in v1. No cron, no scheduled edge function, no DB trigger for time-based close. Conversations only close when an agent explicitly calls `close_conversation` (status → `closed`, `closed_at = now()`).  
**Alternatives considered.** Supabase scheduled functions (pg_cron): cleanest approach, but requires enabling `pg_cron` extension and testing the schedule. Edge function on a cron trigger: works but adds Supabase Edge Function infra.  
**Implications.** Old resolved conversations accumulate in the queue as `resolved` status indefinitely. Build when support volume makes queue noise a real problem. Trigger: when agents start complaining about stale items in "All" queue tab.

## ADR-013: Live map on Order Tracking deferred — visual placeholder only
**Date:** 2026-05-15
**Status:** Accepted
**Context:** The mockup shows a full-screen Leaflet map on the consumer Order Tracking screen with an animated washer pin. Implementing this requires a new realtime subscription to the washer's GPS position and a second Leaflet instance on the consumer side.
**Decision:** Use the static `MapBG` SVG component (ported from `brand.jsx`) as a visual placeholder with a single non-animated marker at the order's stored lat/lng. No live GPS feed, no new subscription. Follow-up feature after the redesign is visually complete.
**Consequence:** Consumer cannot see the washer moving in real time during Phase 3. The placeholder communicates the intended layout without adding scope.

## ADR-014: History yearly summary card uses placeholder content
**Date:** 2026-05-15
**Status:** Accepted
**Context:** The mockup History screen shows a green summary card with total wash count, total spend, and estimated time saved for the current year. Rendering this accurately requires a new aggregate query.
**Decision:** Render the card with static placeholder dashes (`—`) until a proper stats query is scoped. The card's visual chrome (green gradient, Sparkles icon, layout) is implemented; only the numbers are deferred.
**Consequence:** The summary card looks correct in the redesign but shows no real data.

## ADR-015: Washer Dashboard today's earnings widget uses placeholder content
**Date:** 2026-05-15
**Status:** Accepted
**Context:** The mockup Washer Dashboard shows a "TODAY ₪420" widget in the top-right of the map. This requires querying the sum of `base_price` on today's completed orders for the washer.
**Decision:** Render the widget with a placeholder dash (`₪—`) in Phase 4. No new DB query. A follow-up task will add a `get_washer_today_earnings` RPC.
**Consequence:** Widget chrome and placement are live; number is deferred.

## ADR-016: ETA on Order Tracking is a static placeholder
**Date:** 2026-05-15
**Status:** Accepted
**Context:** The mockup shows "4 min · 1.2 km" ETA on the Order Tracking screen. Computing this requires the washer's real-time GPS position and a routing call (e.g. OSRM) from washer to order location. Subscribing to washer location from the consumer side would be a new realtime channel.
**Decision:** Show "~15 min" as a static placeholder. No new subscription or routing call. Follow-up: add a consumer-side channel subscription to `profiles` for the assigned washer's `current_location`, then route via OSRM to produce a live ETA.
**Consequence:** Consumer sees decorative ETA rather than a real one.

## ADR-017: Washer star rating on Order Tracking is a static placeholder
**Date:** 2026-05-15
**Status:** Accepted
**Context:** The mockup shows washer name, star rating, and wash count on the consumer's Order Tracking screen. The `profiles` table has `full_name` but no `rating` or `completed_jobs_count` column. Building a review system is out of redesign scope.
**Decision:** Show the washer's real name (fetched from `profiles` via `order.washer_id`) but display "4.8" and "— washes" as static placeholders. A follow-up will add `rating numeric` and `completed_jobs_count int` to `profiles`, maintained by a trigger on `orders.status → completed`.
**Consequence:** Washer name is real; star count and wash count are decorative.

## 2026-05-13 — Support push notifications deferred (in-app only for v1)

**Context.** The spec explicitly deferred push notifications for support to a later phase; v1 is in-app only.  
**Decision.** No FCM/APNs code in any support component. New support messages are only visible when the user has the chat sheet open or navigates to the Support page. No background notification fires.  
**Alternatives considered.** Extending the existing order FCM work to cover support messages: the plumbing (service worker, FCM token on profiles) exists for orders. Wiring support would be additive, not a rewrite.  
**Implications.** Users miss messages if the app is backgrounded. When building push for support: add a `support_fcm_enabled` flag to profiles and reuse the existing notification edge function, filtering inserts to `support_messages` the same way order status changes are filtered.

## 2026-05-13 — Agent invite flow deferred (manual Supabase dashboard + SQL for v1)

**Context.** The spec ruled out public agent signup; agents must be provisioned by an admin.  
**Decision.** No invite URL, no email flow, no admin UI. Creating an agent requires: (1) create auth user in the Supabase dashboard, (2) run a manual SQL INSERT into `profiles` with `role = 'agent'`. Documented in `support-app/README.md`. `AuthContext` in the agent app enforces role — a non-agent who logs in is signed out immediately.  
**Alternatives considered.** Magic-link invite via Supabase Auth: clean UX but requires an edge function to send the invite and set the role atomically. Admin-panel route in the agent app: scope creep for v1.  
**Implications.** Provisioning a new agent requires direct DB access. Acceptable while the support team is small (1–3 people). Build the invite flow when onboarding becomes a recurring task.

---

## ADR-018: Washer star rating placeholder removed from Order Tracking
**Date:** 2026-05-17
**Status:** Accepted
**Context:** ADR-017 added a static 4.8 star placeholder (with "— washes" wash count) to the WasherCard on OrderTracking. The rating system spec explicitly prohibits consumers from seeing washer ratings.
**Decision:** Removed the star row from WasherCard entirely. The washer's name still displays (it is fetched from `profiles.full_name`). No star count, no wash count shown to consumer anywhere.
**Consequence:** WasherCard shows name + message/call buttons only. The star placeholder is gone.

## Open follow-ups from the redesign arc

These are pending items, not decided ones. No ADR assigned yet. Promote to a full ADR when a decision is made on scope/approach.

### Deferred from the visual redesign (ADR-013 – ADR-017)

**ADR-013 · Live map on Order Tracking** — Priority: **high**  
Consumer Order Tracking shows a static `MapBG` SVG placeholder. Real-time washer location requires a consumer-side Supabase Realtime subscription to `profiles.current_location` for the assigned washer, plus a second Leaflet instance (or a lightweight canvas overlay) to render the moving pin. Routing line via OSRM is optional but paired with ADR-016.

**ADR-014 · History yearly stats server-side aggregate** — Priority: **low**  
The year-stat card (count + spend) currently computes client-side from the already-loaded orders array — correct for typical users but silently undercounts if a consumer has more than Supabase's default 1,000-row page limit. A `get_consumer_year_stats(year int)` RPC returning `{count, total_spent}` would fix this permanently with one round-trip.

**ADR-015 · Washer today's earnings widget** — Priority: **med**  
The top-right widget on the Washer Dashboard shows `₪—`. Needs a `get_washer_today_earnings()` security-definer RPC returning the sum of `base_price` on completed orders where `approved_at::date = current_date`. Trigger or live subscription on new completions optional (a per-mount fetch is probably sufficient).

**ADR-016 · Live ETA on Order Tracking** — Priority: **high**  
Paired with ADR-013. Once the washer's `current_location` is subscribed on the consumer side, compute ETA by sending a single OSRM `/route` request from washer lat/lng to `order.lat/lng`. Cache result; refresh every position update. Display as `X min · Y km` in the existing ETA pill. Fallback: keep `~15 min` if location or routing is unavailable.  
*Update 2026-05-20:* ETA minutes display removed; pill now shows status-driven label. Live ETA still deferred.

**ADR-017 · Washer and consumer star ratings** — Priority: **med**  
Both the washer card on Order Tracking and the customer card in Active Job show a hardcoded `4.8`. Needs: `rating numeric(3,2)` and `completed_jobs_count int` columns on `profiles`; a trigger on `orders` that updates the washer's stats when `status → completed`; a consumer-facing review submission screen or modal after job completion. The consumer side of ADR-017 (customer card in Active Job) also needs `consumer_orders_count int` for the "— orders" line.

---

### Code-level TODOs accumulated during the redesign

**Consumer dark-mode completion** — ~~Priority: **med**~~ **Resolved.**  
54 hardcoded-light occurrences across 10 files patched with `dark:` variants. In-progress note removed from /profile/settings Appearance toggle. See commit `feat(consumer): close dark-mode gap; remove in-progress note`.

**Phone numbers on profiles** — Priority: **med**  
The washer card (Order Tracking) and customer card (Active Job) both have a dimmed phone button that does nothing. Needs a `phone text` column on `profiles`, capture at signup, and a `tel:` href wired to the button. Washer phone is the more urgent half — the consumer needs to reach the washer quickly on arrival.

**History filter** — Priority: **med**  
The filter icon button in the History header is a non-functional placeholder. Needs a bottom-sheet filter panel with status multi-select and date-range picker, plus a filtered Supabase query (indexed `status` and `created_at` columns already exist). Grouping by time bucket should remain after filtering.

**`rounded-2xl` → `rounded-glass` in unchanged washer components** — Priority: **low**  
`EvidenceCard` (JobDrawer line 80), `VehicleSection` wrapper (line 294), and `JobCard` (line 73) still use `rounded-2xl` (16px). Updating these three to `rounded-glass` (22px) brings them in line with everything else redesigned in Phase 2–6. One-line change each, no logic impact. See DESIGN.md §16 items 1–2.

**Bottom-sheet top-radius standardisation** — Priority: **low**  
`JobDrawer` uses `rounded-t-3xl` (24px); the Order Tracking bottom sheet uses `rounded-t-[28px]` (28px). Standardise `JobDrawer` to 28px to match. See DESIGN.md §16 item 3.

**`bg-surface-glass` legacy alias cleanup** — Priority: **low**  
`--color-surface-glass` in `src/index.css` `.dark {}` still holds the old `rgba(26,29,39,0.72)` opacity. The `tailwind.config.js` `surface.glass` key points to it. Neither is referenced by any current component (all glass uses `bg-glass` → `--color-glass-surface` at 0.50). Remove the CSS var from the dark block and the `surface.glass` Tailwind key to avoid confusion. See DESIGN.md §16 item 8.

**WasherMenu online status indicator** — Priority: **low**  
`WasherMenu` shows a passive online/offline dot in its header. The toggle has moved to the top `OnlinePill` — so the menu's status display is now read-only decoration. Either remove it (cleaner) or make it a secondary toggle target (consistent). Current state is not broken, just slightly redundant.

---

## ADR-019: set_default_vehicle as SECURITY DEFINER RPC, not two client-side UPDATEs
**Date:** 2026-05-18
**Status:** Accepted
**Context:** Switching a consumer's default vehicle requires clearing the old default and setting the new one. Two sequential client-side UPDATEs are a race condition: a second tap or slow network can produce two concurrent requests, and the partial unique index (`WHERE is_default = true`) would surface as a confusing Postgres error rather than a clean UX.
**Decision:** Wrap both UPDATEs in a SECURITY DEFINER PL/pgSQL function (`set_default_vehicle(p_vehicle_id uuid)`). PostgreSQL executes the function body in a single implicit transaction, so the two UPDATEs are atomic. Ownership is validated explicitly inside the function (`consumer_id = auth.uid()`) before any UPDATE fires. SECURITY DEFINER is consistent with all other RPCs in the codebase (`transition_order_status`, `nearby_jobs`, etc.).
**Consequence:** The RLS UPDATE policy on `vehicles` is bypassed by the function, but the explicit ownership check is strictly equivalent. One small RPC call replaces two round-trips from the client.

## ADR-020: Auto-default for first saved vehicle implemented as a DB trigger, not app logic
**Date:** 2026-05-18
**Status:** Accepted
**Context:** When a consumer saves their first vehicle, it should automatically become the default so the Home screen pre-selects it on the next visit. This can be enforced in application code (check before INSERT, set is_default accordingly) or in a BEFORE INSERT trigger.
**Decision:** BEFORE INSERT trigger (`vehicles_auto_default_trg`). The invariant "a consumer with one vehicle always has a default" is a DB-level constraint, not a UI concern — enforcing it in the trigger means it holds regardless of which client path created the vehicle (the post-booking save dialog, the management page, a future API call, or a seed script).
**Consequence:** The application layer can always INSERT with `is_default = false`; the trigger promotes it if needed. No app-level logic required. A consumer who deletes their default vehicle is left with no default (the trigger only fires on INSERT, not on DELETE) — the app must handle the "no default" state gracefully, which it does by falling back to the full plate-lookup flow.

## ADR-022: Edit nickname is inline, not a modal
**Date:** 2026-05-18
**Status:** Accepted
**Context:** The vehicle management list lets consumers rename a saved vehicle. The edit could be done inline (text becomes an input in place, with Save / Cancel buttons) or via a modal (tap edit → modal with input → save).
**Decision:** Inline. Nickname is a single short field; a modal adds ceremony (backdrop, dismiss affordance, header) that is disproportionate to the action. Inline editing keeps the user's eye on the vehicle row they are modifying, matches established patterns for single-field list-item renames (Notion tasks, iOS shortcuts), and is consistent with the app's density target (Wolt-level, §13). State is minimal: one `editingId` + `editingValue` per page. The ConfirmDialog component is reserved for destructive confirmations (delete) where friction is intentional.
**Consequence:** The vehicle row expands slightly when in edit mode to accommodate the input and Save/Cancel buttons. Only one row can be in edit mode at a time; starting a new edit implicitly cancels the previous one.

## ADR-023: Consumer display_preference enabled (role-split relaxed)
**Date:** 2026-05-20
**Status:** Accepted
**Context:** DESIGN.md §2 codified Light vs. Dark as a role-based architecture: consumer always light, washer respects `display_preference`. The product decision is to allow consumers to opt into dark mode via a Settings toggle.
**Decision:** `profile.display_preference` now drives theme for both roles. `useTheme()` already respected `display_preference` before role in its resolution order — no hook change was needed. The UI toggle lives at `/profile/settings → Appearance`. A one-line note informs the consumer that dark mode is in progress. The role-based default (consumer → light, washer → dark) still applies when `display_preference` is unset.
**Consequence:** All consumer pages need dark-mode equivalents. The redesign was built consumer-light-only; 9 files have hardcoded light values without `dark:` variants (see "Consumer dark-mode completion" in Open follow-ups). A smoke test was performed in this commit; screens confirmed navigable in dark mode. Remaining gaps tracked in follow-ups.
**Alternatives considered:** Keep the role split (rejected — user explicitly wants the toggle). Render the toggle but no-op it for consumer (rejected — dishonest UI). Ship as hidden feature flag (rejected — adds complexity not needed at this scale).

## ADR-024: Support-gated wash approval lifecycle
**Date:** 2026-05-28
**Status:** Accepted

**Context:** Photos and rating must not reach the consumer until a support agent has approved the wash. Washers must not be offered new jobs while they have a wash awaiting approval — this prevents them from racing through jobs and leaving low-quality work hidden behind the gate.

**Decision:**
- `pending_approval` is the only non-terminal status that locks the washer.
- Consumer is told "awaiting verification" during this window; no photos, no rating modal.
- Agent decision branches:
  - **approve** → `completed` (consumer sees photos + rating modal; washer unlocked)
  - **decline** → `in_progress` with `decline_reason` (washer can fix and resubmit)
- After 3 consecutive declines on the same order, auto-create a support ticket flagging quality issues.
- All status writes go through `transition_order_status` or `decline_order`. No exceptions.
- `nearby_jobs` and `find_nearby_washers_for_order` both exclude washers with active or `pending_approval` orders.
- `get_washer_active_job` includes `pending_approval` so the washer dashboard shows the locked state.
- Notification trigger: `pending_approval` notifies the washer (acknowledgment), NOT the consumer. `completed` notifies both. Decline notifies the washer with the reason.

**Consequence:**
- Slight UX delay for the consumer (they wait until agent approves).
- Throughput hit per washer when an approval is slow; mitigation: SLA target on agents.
- `approval_audit` table tracks every approve/decline for transparency.

---

## ADR-021: orders INSERT RLS updated to validate vehicle_id ownership
**Date:** 2026-05-18
**Status:** Accepted
**Context:** `orders.vehicle_id` is a nullable FK to `vehicles`. Without an explicit RLS check, a consumer could supply any UUID in the `vehicle_id` field of an INSERT, including one belonging to another consumer. The FK constraint only guarantees referential integrity, not ownership.
**Decision:** The `orders: consumer insert` RLS policy was updated in migration 0041 to add: when `vehicle_id IS NOT NULL`, a subquery confirms `vehicles.consumer_id = auth.uid()`. This is the minimal, correct guard — it runs inside the policy `WITH CHECK`, so it fires on every INSERT regardless of the calling code path.
**Consequence:** Replacing the old policy with DROP + CREATE causes a brief window during the migration where no INSERT policy exists; since migrations run as the service role (which bypasses RLS), there is no practical exposure. The new policy is strictly more restrictive than the old one for authenticated users.


## ADR-026: Reassigned-washer payout recomputed from new tier
**Date:** 2026-05-29
**Status:** Accepted
**Context:** `admin_reassign_washer` (0082) replaces the assigned washer on a non-terminal order. The locked `payout_amount` (set at `pending → accepted` per the tier-payout rule) was the previous washer's rate. Two reasonable choices: preserve the original payout, or recompute from the new washer's tier.
**Decision:** Recompute from the new washer's tier (`payout_for_tier(p.current_tier)`, or 50 if unrated). Reassignment is typically a remediation — the original washer dropped the job, was unreachable, or produced bad work — so the financial baseline should match the new operator. The full before/after payout deltas land in `admin_order_audit.payload` for transparency.
**Alternatives considered:** Preserve original payout — defensible when the reassignment is administrative (e.g. consolidating two accounts). Rejected: the audit log makes it easy to spot when a recompute lowered a payout, and the admin can immediately follow with `admin_override_order_price` if a one-off adjustment is needed. Encoding both behaviors behind a flag would be premature.
**Consequence:** Reassigning to a higher-tier washer increases the order's `payout_amount`; reassigning to a lower-tier or unrated washer decreases it. The change is always audited.

## ADR-027: Live design editor scope, bounds, and gate philosophy
**Date:** 2026-05-29
**Status:** Accepted
**Context:** P8 ships a live tap-to-edit design editor. Designers / owners need to tweak visual properties (color, padding, radius, offset) on individual UI surfaces without a code deploy. Three concerns: (a) avoid breaking layout, (b) avoid drifting too far from the bundled design, (c) keep accidental entry from a normal admin session out of the way.

**Decision:**
- **Scope (what CAN be edited):** seven properties per registered surface — `color`, `bg`, `text_size`, `padding`, `border_radius`, `offset_x`, `offset_y`. Stored in `design_overrides` keyed by `(app, id, property)`. Anon SELECT (visual properties, no more sensitive than the CSS bundle). super_admin write via `admin_set_design_override` RPC with bound validation.
- **Bounds:** `offset_x`/`offset_y` ∈ [-100, 100] px; `text_size` ∈ [0.7, 1.5] em; `border_radius` ∈ [0, 32] px; `padding` ∈ [0, 48] px. Enforced server-side in the RPC AND client-side via the slider `min`/`max`. Picked so a misclick can't push elements off-screen or shrink text below legibility.
- **Non-goals (explicitly):** no JSX structural edits, no absolute repositioning beyond the offset bound, no SVG-only component edits (WashMark, MapBG), no form input behavior, no edits to the admin app itself.
- **Surface registry:** the manifest at `admin-app/src/data/editableManifest.json` is the source of truth. A surface is editable only when (a) it is in the manifest AND (b) the code wraps it in `<Editable id="...">`. ~20 surfaces are instrumented for v1 (consumer Home book CTA, washer Dashboard online pill, support Approvals row, etc.); the full list is in the manifest. Wrapping more is a routine PR.
- **Passphrase gate:** `DESIGN_GATE = '121212'` in `DesignEditor.jsx`, stored in `useState` (tab-session only, NOT localStorage). Closing the tab re-locks. **This is a soft gate, not a security boundary.** Anyone with DevTools can flip the React state. The actual write protection is the `is_super_admin()` RLS policy on `design_overrides` plus the bound-validating RPC. The gate's only job is to prevent a super_admin from accidentally dropping into edit mode while doing other admin work.
- **Drift detection:** `npm run drift:design` (script `scripts/design-drift.js`) lists orphaned rows (id no longer in manifest), active rows, and unbounded rows (impossible via the RPC; only happens if the table is written by a back-door).

**Alternatives considered:**
- A full visual page builder: rejected — moves the project from "owner can tweak knobs" to "owner builds layouts," requiring a much larger drag-drop UI and tighter coupling to runtime rendering. Out of scope.
- Storing CSS variables in `app_branding` (the existing branding table): rejected — `app_branding` is keyed by global theme tokens, not by per-component instance. Mixing them would muddy both.
- Stronger gate (password from `app_config` table, or super_admin-only RLS on a `design_editor_unlocked` row): rejected — the gate's purpose is friction, not security; once you concede that DevTools can bypass anything client-side, an RLS-backed gate is just security theater.

**Consequence:** Owner can rapidly iterate on visual properties of any of the ~20 instrumented surfaces without a deploy. Edits propagate to live users via Realtime (same channel as `content_overrides`). The drift script ensures the manifest doesn't decay as components are renamed or removed.

---

## ADR-025: Broadcast scheduling deferred — manual send only in v1
**Date:** 2026-05-28
**Status:** Accepted
**Context:** P4 (admin broadcasts) supports `scheduled_at` on `broadcast_notifications` so the admin can compose a broadcast for later. Executing the scheduled rows requires either pg_cron (Supabase extension) or a separate Edge Function on a cron trigger.
**Decision:** Build the data model and admin UI for scheduling, but defer the execution path. The admin UI persists `scheduled_at` and shows a warning that scheduled broadcasts wait for pg_cron. Send-now broadcasts (no scheduled_at) work today via `trigger_broadcast()` RPC → pg_net → send-broadcast Edge Function.
**To enable scheduled execution:** enable the pg_cron extension in the Supabase dashboard, then add a job like `SELECT public.trigger_broadcast(id) FROM public.broadcast_notifications WHERE scheduled_at <= now() AND sent_at IS NULL` on a 5-min schedule. No code change needed.
**Consequence:** Owner can compose-now-send-later semantics are not live until pg_cron is wired. Send-now path is fully functional.

---

## ADR-028: Unified admin History tab — trigger-based capture, scoped undo, best-effort user restore
**Date:** 2026-05-29
**Status:** Accepted

**Context:** The admin app accumulated several independent write surfaces (content / branding / config / pricing / payout / design overrides; P6 order actions; P7 user actions; broadcasts) but had no single place to see *who changed what, when* — and no way to undo a mistaken edit. The override tables stored only the current value, so undo had nothing to restore from.

**Decision:**

- **Capture via DB triggers, not admin JS** (migration 0092). A single `capture_admin_change_history()` AFTER INSERT/UPDATE/DELETE trigger is attached to all six override tables (`content_overrides`, `app_branding`, `app_config`, `pricing_config`, `payout_tier_config`, `design_overrides`). It records `before_value`/`after_value` as full-row `to_jsonb`. Triggers capture every write path — PostgREST from the admin UI, the `admin_set_design_override` RPC, or raw SQL — so nothing can bypass history. The function is SECURITY DEFINER owned by postgres; since the source tables are postgres-owned with no FORCE ROW LEVEL SECURITY, its insert into `admin_change_history` bypasses RLS and **can never roll back the underlying edit** (even when `auth.uid()` is NULL during a migration/seed — `changed_by` is simply NULL then). A `note` column (set via the transaction-local `app.change_note` GUC) tags undo-generated rows.

- **One feed view, not a table migration** (migration 0093). `admin_activity_feed` UNION ALLs `admin_change_history` + `admin_order_audit` + `admin_user_audit` + sent `broadcast_notifications`, normalizing to `(source_table, ref_id, entity_type, category, entity_label, action, actor_id, actor_name, reason, before_value, after_value, occurred_at, undoable)`. The view is RLS-locked (SELECT revoked from anon/authenticated); the only read path is the SECURITY DEFINER `get_admin_activity_feed(limit, before, entity_type)` RPC, which gates on `is_super_admin()` and keyset-paginates on `occurred_at`. A view alone can't enforce super_admin across four differently-owned tables.

- **Undo scope is deliberately narrow** (migration 0094). One-click `admin_undo_change(history_id)` reverses ONLY the six override entity types: `update`→write `before_value` back, `create`→delete, `delete`→re-insert. The undo writes through the same source tables so the trigger records the undo itself (re-undoable). Two guard rails: (1) **conflict** — if the live row no longer equals this entry's `after_value` (someone edited since), undo is rejected; this naturally limits undo to the *latest* change of an entity and prevents clobbering newer edits; (2) **pricing safety** — undoing `pricing_config`/`payout_tier_config` is blocked while `app_config.pricing_source='config'` (same philosophy as the Config-tab reset guard — don't silently move live pricing). Everything else (sent broadcasts, merges, order force-actions, price overrides, suspend/unsuspend, impersonation, manual order creation) is a **read-only log entry with no undo** — either irreversible (can't unsend a push), trivially reversible by its normal control (suspend), or financially/state-machine sensitive.

- **User restore is explicitly best-effort and honest** (migration 0095 + `admin-user-mgmt` Edge Function `restore_user` action). Recreating an auth user needs the service role, so it lives in the Edge Function, not an RPC. **Known fragility, surfaced loudly in the UI before the admin confirms:** (a) the recreated login may get a **NEW uuid** — the function attempts to reuse the original id via the GoTrue admin API and falls back to a fresh id if rejected; (b) the email is in `auth.users`, not the profile snapshot, so it can only be recovered if captured at delete time (delete now augments the snapshot with a reserved `__auth.email`); older deletes require the admin to supply the email; (c) only the profile is restored — **orders, ratings, tokens, and chat that referenced the old id are NOT reconnected** (they were never in the deletion snapshot). The restore confirm dialog requires typing the user's email and shows the warning verbatim; the function returns a detailed report of what was and was not restored.

**Alternatives considered:**
- *History in admin JS* — rejected: misses every non-UI write and drifts silently. Triggers are the only way to guarantee completeness.
- *Four separate history tables (one per override family)* — rejected: a single typed `admin_change_history` plus a UNION view is simpler and the feed wants them merged anyway.
- *Broad undo (including orders/users/broadcasts)* — rejected: un-sending pushes, un-merging users, and reversing notified order state are unsafe; the value of undo is precisely that it's scoped to surfaces where the previous value is a complete, side-effect-free description of state.
- *Recreating full relational graph on user restore* — rejected as out of scope and dishonest to imply; the snapshot only holds the profile, and re-parenting cascaded rows after a hard delete isn't reliably possible.

**Consequence:** Migrations 0092–0095 (0091 was already taken by `resolve_broadcast_segment_service_role`). The override tables now pay one extra trigger insert per write (negligible). Undo is safe and auditable; user restore is available but framed as a rescue with caveats, not a clean reversal.

---

## ADR-029: Super_admin read-only visibility into all support conversations
**Date:** 2026-05-31
**Status:** Accepted

**Context:** The admin app (super_admin) had no way to see support conversations. Agents handle all support in the support app; the owner needs oversight — to read what consumers/washers and agents are discussing — without the ability to intervene (no reply, reassign, resolve, close, or delete from admin).

**Decision:** Add a **read-only** "Chats" tab to the admin app (`admin-app/src/pages/Chats.jsx`, data layer `admin-app/src/lib/adminChats.js`). The super_admin can view every `support_conversations` row and its full `support_messages` history. There is **no write path** from the admin app: `adminChats.js` exposes only SELECT queries, two realtime SUBSCRIPTIONS, and pure display helpers — no insert/update/delete/upsert/RPC mutation. Replies remain exclusively in the support app; a banner in the thread says so.

- **RLS-enforced, no new migration.** Reads go through PostgREST with the super_admin's JWT. Migration **0090** already granted `super_admin reads all support_conversations` and `super_admin reads all support_messages` SELECT policies (verified live in `pg_policies`); **0079** lets super_admin read every `profiles` row so the opener/agent/sender name embeds resolve. No 0102 was needed.
- **Attachments via public URL, deliberately.** `support_messages.attachment_path` points into the `support-attachments` bucket, which is currently configured **public**; the thread links to the object via `getPublicUrl` (opens in a new tab). We do NOT use a signed URL: `storage.objects` has no `is_super_admin()` SELECT policy for this bucket (only participants + `is_agent()`), so `createSignedUrl` would fail RLS for a super_admin. If the bucket is ever made private, a super_admin storage SELECT policy (mirroring 0068) would be required to keep attachments viewable.

**Privacy note (intentional, not silent):** these conversations contain consumer/washer PII and private support discussion. Super_admin read access is deliberate platform-owner oversight, enforced by RLS at the table layer, and is documented here so the access is on record rather than implicit. No admin code can mutate support conversations.

**Alternatives considered:**
- *Surface support chat inside the support app for admins* — rejected: agents and super_admins use separate, auth-isolated apps by design (ARCHITECTURE.md); admin oversight belongs in the admin app.
- *Allow admin to reply / take over a thread* — rejected: muddies who-owns-the-conversation and the agent assignment model; oversight ≠ operation. Kept strictly read-only.
- *Add a super_admin storage policy + signed URLs for attachments* — deferred: unnecessary while the bucket is public, and would expand a private-bucket access surface for marginal benefit. Revisit only if the bucket is locked down.

**Consequence:** No schema change. One new admin tab, one read-only data module (guarded by `admin-app/src/__tests__/adminChats.test.js` asserting zero mutation exports and `Chats.test.jsx` asserting no compose/input affordance), and `scripts/smoke-chats.js` proving a super_admin can actually SELECT a conversation and its messages through RLS.

---

## ADR-035: Underground-parking orders — offline capture + geofence/GPS bypass
**Date:** 2026-06-01
**Status:** Accepted

**Context:** Many washes happen in covered/subterranean parking garages with no cellular or GPS reception. Two parts of the normal washer flow assume reception:
1. `transition_order_status` rejects `en_route → arrived` unless the washer is within the arrival geofence (needs a GPS fix), and rejects `in_progress → pending_approval` unless GPS coords are supplied.
2. The washer app uploads the 4 arrival + 4 completion photos to `job-evidence` and calls the RPC inline — both require network.

A washer descending into a garage to do the job literally cannot satisfy either. Forcing it produces stuck jobs and support tickets.

**Decision:** Add a per-order boolean `orders.is_underground_parking` (migration **0103**, `NOT NULL DEFAULT false`, back-filled in place; **no DB CHECK** — see below). The consumer sets it at booking; when ON the **access-notes field becomes required client-side** (a CHECK constraint would fail on every pre-existing `false`/null-notes row and, more to the point, "notes required" is a booking-time UX rule, not a storage invariant).

Migration **0104** redefines `transition_order_status` (the highest-risk change) keeping the **identical 5-arg signature** `(uuid, text, double precision, double precision, boolean)`, the admin-override (force-stage) branch, its audit row, and the 0100 config-driven geofence all **byte-for-byte unchanged**. The only change: when `v_order.is_underground_parking` is true,
- `en_route → arrived` skips the GPS-required + geofence checks (accepts null coords); the **4 arrival photos stay mandatory**;
- `in_progress → pending_approval` skips the GPS-required check; the **4 completion photos stay mandatory**; `submitted_lat/lng` stay null.

The function reads the flag from the order row itself — no new argument, so every existing null-coord caller keeps working. `admin_force_order_stage` (0101) calls `transition_order_status` by name; plpgsql creates no hard dependency, so the DROP-before-CREATE in 0104 does not break it and it is intentionally not recreated.

**Offline capture (washer app, `src/lib/offlineSync/`):** engaged **only** when `order.is_underground_parking === true`; for every other order the existing online flow is byte-for-byte untouched. At arrival the 4 photos are resized to JPEG blobs and stored in **IndexedDB** (never localStorage — blobs), the local order state advances optimistically (`arrived` → `in_progress` → completion photos queued for `pending_approval`), and a "queued — will sync when online" indicator is shown. On reconnect (the DOM `online`/`offline` events + `navigator.onLine`, which fire in the Android WebView; @capacitor/network could not be installed in this environment due to an npm-registry TLS failure, and can be layered on later — it needs `npx cap sync android`) **and** on app init (in case the app was killed underground), the engine replays each queued task in order: upload photos to the deterministic `job-evidence/{order_id}/{set}/{angle}.jpg` paths (upsert → idempotent), then call `transition_order_status(orderId, 'arrived', null, null)` and later `(orderId, 'pending_approval', null, null)`. Replay is **resumable + idempotent**: it re-reads the live order status before each step and skips steps the server already applied, tolerates partial uploads, and clears blobs only after the server confirms. No optimistic write touches the server outside replay.

**Agent display:** for `pending_approval` orders where `is_underground_parking` is true and `submitted_lat/lng` are null, the support-app `ApprovalRow` replaces the GPS/map card with a clear **"Location unavailable (underground)"** state (no coords, no map). `approvals.js` adds `is_underground_parking` to its SELECT (contract test updated).

**Alternatives considered:**
- *DB CHECK enforcing notes when underground* — rejected: fails on existing rows and conflates a UX rule with a storage invariant.
- *A new RPC for underground transitions* — rejected: duplicates the state machine; a single in-function branch on the flag keeps one source of truth and preserves all callers.
- *localStorage queue* — rejected: can't hold image blobs reliably; IndexedDB is the correct durable binary store.
- *Trust client-supplied coords for underground* — rejected: there are none to trust; null is honest and the agent UI says so.

**Agent control (migration 0105):** customers often only report a no-reception garage *after* booking, via support chat. `agent_set_order_underground(p_order_id, p_value)` (SECURITY DEFINER, `is_agent()`-gated, blocked on terminal orders — mirrors how agents already act via `transition_order_status`) lets a support agent flip a regular order to underground (or back) from the support-app `OrderPanel`. The washer app then switches that order to offline capture + skips the GPS arrival gate. Being SECURITY DEFINER, the UPDATE bypasses RLS, so no agent UPDATE policy on `orders` is needed.

**Consequence:** Migrations 0103 + 0104 (+ 0105 for the agent control). The geofence/GPS bypass is scoped strictly to flagged orders; photo requirements are unchanged for everyone. **Hardware caveat:** the offline→reconnect path (airplane-mode toggle on a real device) cannot be fully proven in jsdom — it must be verified on-device before release.

## ADR-036: DB-backed versioned legal documents + acknowledgment model
**Date:** 2026-06-04
**Status:** Accepted

**Context:** Consumer terms, privacy policy, and washer terms must be editable by staff (not hardcoded), versioned, and re-acknowledged by users when they change — an App Store / Play store and privacy-law expectation.

**Decision:** Content lives in `legal_documents` (migration **0107**) — one row per (`doc_type` ∈ consumer_terms/privacy_policy/washer_terms, `locale` ∈ he/en, `version`), with a **partial unique index** guaranteeing at most one `is_current` per (doc_type, locale). Agents publish via `publish_legal_document(...)` (SECURITY DEFINER, `is_agent()`-gated): it computes the next version, **demotes the current row before inserting** the new one (so the partial unique index never sees two currents), and stamps `published_at`/`published_by`. Reads go through `get_current_legal_document(doc_type, locale)` (he-fallback when a locale has no current version). `user_legal_acknowledgments` (PK `user_id`,`doc_type`) records the version each user accepted; `pending_legal_acknowledgments(user_id)` returns the unacknowledged current docs **filtered by role** (consumer → consumer_terms+privacy; washer → washer_terms+privacy; agents → none). A global `LegalUpdateModal` (mounted once in `src/router.jsx` beside `NotificationsInit`) gates consumers/washers until they acknowledge; read-only viewers live at `/legal/terms`, `/legal/privacy`, `/legal/washer-terms`. `legal_documents` is in the realtime publication so a live publish surfaces without reload.

**RLS:** any authenticated user reads `is_current` rows; an additive agent-only policy reads **all** versions (powers the support-app history list). No client writes — only the SECURITY DEFINER publish RPC.

**Consequence:** Three doc types seeded v1 he as `[למילוי]` skeletons (privacy + washer) and a labelled consumer placeholder; Harel fills them via the support-app editor. Guarded by `legalDocuments.contract.test.js`, `LegalUpdateModal.test.jsx`, and live checks in `verify-db.js`.

**Amendment (2026-06-15, migration 0121):** the signup Terms+Privacy checkbox was purely client-side gating — consent was never persisted, so `pending_legal_acknowledgments` re-reported the docs and `LegalUpdateModal` re-prompted the user on their very first login, right after they had accepted at registration. Fix: `handle_new_user` now seeds `user_legal_acknowledgments` at account creation when the signup form passes `accepted_legal` in `raw_user_meta_data` (consumer → consumer_terms+privacy_policy; washer → privacy_policy only — the washer **contract** is still acknowledged post-approval via the modal). This fires for both the auto-login and the email-confirmation signup flows (the `auth.users` row is inserted at signUp regardless of confirmation). The migration also one-time-backfills existing consumer/washer accounts at the current version (non-destructive — `on conflict do nothing`), so already-registered users are not prompted for docs they already accepted. Net behavior: the modal appears **only** when a new doc version is published. Guarded by `legalConsentOnSignup.contract.test.js`.

## ADR-037: legal_update push fan-out (trigger → one Edge Function → per-user send)
**Date:** 2026-06-04
**Status:** Accepted

**Context:** Publishing a legal document should push-notify the affected users, mirroring the existing new-job-nearby / broadcast fan-out architecture rather than looping per-user inside a trigger.

**Decision:** An `AFTER INSERT … WHEN (NEW.is_current)` trigger on `legal_documents` (migration **0108**) makes **one** `net.http_post` to the `fan-out-legal-update` Edge Function (Vault secret `fan_out_legal_update_url`; `net.http_post` with `net` in `search_path`, per the 0080 gotcha). That function resolves the audience via `legal_update_audience(doc_type)` (role-based + opt-in pre-filter on `notification_preferences.enabled`; service_role/agent-gated) and fans out to `send-notification` once per user in chunks. The new `legal_update` event type is added to the send-notification COPY map (he+en) and `routeFor` (deep-links to the matching `/legal/*` viewer). `send-notification` re-checks `enabled` per user, so the audience filter is a pre-filter, not the only gate.

**Consequence:** Reuses `TRIGGER_SECRET` auth and the `notification_log` write path. Actual push **delivery is device-test-only**. Guarded by `legalUpdateFanout.contract.test.js` + audience/opt-out behavioural checks in `verify-db.js`.

## ADR-038: Account deletion — anonymize orders, delete the user (FK SET NULL)
**Date:** 2026-06-04
**Status:** Accepted

**Context:** In-app + web account deletion is a store blocker. We must delete the user and their personal data but **retain order/payment records** for legal/tax purposes. The original FKs made this impossible: `orders.consumer_id` was `NOT NULL` with no ON-DELETE action, so deleting a profile that has orders is rejected.

**Decision:** Migration **0109** relaxes `orders.consumer_id` (drops NOT NULL), `orders.washer_id`, and `order_events.actor_id` to **ON DELETE SET NULL**. The `delete-account` Edge Function (service-role; authenticates the caller's JWT; consumer/washer only) then: purges per-user storage (`washer-verification/{uid}`, `car-photos/{uid}`, `job-evidence` for the caller's own orders); **anonymizes** the caller's orders (nulls car PII, photo paths, access notes, submitted coords — keeps `base_price`/`platform_fee`/`total_price`/`payout_amount`/`status`/timestamps); deletes blocking child rows (order/support messages, conversations, ratings, vehicles, verifications, tokens, prefs, logs, legal acks, content reports/blocks); deletes the `profiles` row (SET NULL nulls the order/event references); and deletes the auth user. The in-app flow (consumer + washer settings) uses **type-to-confirm**, then `unregisterToken()` + `signOut()`. A public `/account/delete` route (no auth guard) runs the flow when logged in and shows instructions + support contact when logged out — this is the Play deletion URL.

**Consequence:** Orphaned (deleted-user) orders carry NULL `consumer_id`, which no RLS policy or app query matches; active orders always set it. `job-evidence` for *other* consumers' orders is retained on a washer deletion (it belongs to the consumer's preserved record) — a deliberate integrity choice over a literal "delete all my jobs' evidence" reading. Guarded by `DeleteAccountModal.test.jsx`, `AccountDeletion.test.jsx`, `deleteAccount.contract.test.js`, and FK checks in `verify-db.js`. **Token/auth revocation is device-test-only.**

## ADR-039: UGC moderation — content_reports view, not support_tickets
**Date:** 2026-06-04
**Status:** Accepted

**Context:** Apple/Google require reporting objectionable content and blocking abusive users. The obvious "route reports into `support_tickets`" path is blocked: `support_tickets.order_id` is `NOT NULL` **and** `UNIQUE`, which cannot represent a support-chat report (no order) or a second report on an already-ticketed order.

**Decision:** Migration **0110** adds `content_reports` (reporter, reported user, context order_chat/support_chat, optional order/message ids, reason, `open→reviewed→actioned` status) and `content_blocks` (per-user block list). RLS: reporters insert/read **only their own** reports; agents read + action **all** (`is_agent()` — no same-table subquery, so no policy recursion); block lists are owner-scoped. Reports surface in a **dedicated Reports view** in the support app with a live open-count badge (`content_reports` is in the realtime publication) — **not** funneled into `support_tickets`. In the main app, a per-message menu (`MessageActions`) reports any counterpart message; in order chat it can also block the counterpart (their messages stop rendering, composing disabled, unblock available) — blocking is client-enforced (hide + disable), not server-delivery-blocked. Blocking is intentionally not offered against support agents.

**Consequence:** Guarded by `contentReports.contract.test.js`, `MessageActions.test.jsx` (main), `ReportsView.test.jsx` (support), and behavioural RLS checks in `verify-db.js`.

## ADR-040: First-wash discount — applied in the pricing trigger, platform-absorbed
**Date:** 2026-06-11
**Status:** Accepted

**Context:** Marketing promises every new customer 30% off their first wash (landing intro popup). Prices are set by the `validate_order_prices` BEFORE INSERT trigger and client values are never trusted, so a client-side discount would be cosmetic; a coupon-code system is overkill for a single universal, one-shot promotion.

**Decision:** Migration **0111** adds `orders.discount_percent` / `discount_amount` and applies the discount inside `validate_order_prices`: if the inserting consumer has **no prior non-cancelled order**, `total_price` drops 30% (cancelled orders do not burn eligibility). The **platform absorbs** the discount — `base_price` and the tier-locked `payout_amount` are untouched; `platform_fee` shrinks by the discount amount, preserving `total_price = base_price + platform_fee` (it may go negative under future config-table margins — honest accounting). A `pg_advisory_xact_lock` keyed on the consumer serializes concurrent first bookings so two can't both claim it. The eligibility `NOT EXISTS` runs as the inserting user: a consumer's RLS exposes exactly their own orders (the only rows that matter), and `admin_create_order_for_consumer` is SECURITY DEFINER. Client side is display-only: `applyFirstWashDiscount` (`src/lib/pricing.js`, rounding matches SQL) + `useFirstWashDiscount` drive a strikethrough + badge on the booking card; OrderTracking shows the applied discount from the order row.

**Consequence:** Account deletion (ADR-038) anonymizes orders (`consumer_id` → NULL), so a deleted-and-recreated account regains eligibility — accepted. Both simultaneous-first-orders and the discount rules are pinned by `firstWashDiscount.contract.test.js`.

## ADR-041: Receipts — DB-triggered issue, config snapshot, Resend email
**Date:** 2026-06-11
**Status:** Accepted

**Context:** Customers must receive a receipt (קבלה) by email once their wash is approved, with the business details (עוסק מורשה number, sender address, footer…) editable by the owner without redeploys. Receipts are legal/financial records: they need sequential numbering and must not change retroactively when settings change.

**Decision:** Migration **0113** adds `receipts` (sequential `receipt_number_seq` starting 1001, `UNIQUE(order_id)` for idempotency) and an AFTER UPDATE trigger `issue_receipt_on_completion` on orders → `'completed'` (covers agent approval AND admin force-complete). The trigger SNAPSHOTS the 9 admin-editable `app_config` receipt keys plus consumer name/email (auth.users via SECURITY DEFINER) and the VAT split onto the row, then fires ONE `net.http_post` (Vault `send_receipt_url`, 0108 pattern) to the new `send-receipt` Edge Function, which renders a Hebrew RTL receipt + wash-confirmation email and sends via the **Resend API** (`RESEND_API_KEY`), writing `status` back. Failures never abort the order transition (exception → warning; receipt row survives for manual resend). Admin app gets a **Receipts** tab: settings editor over the config keys + issued-receipts list with a resend button calling `admin_resend_receipt(uuid)` — a super_admin-gated SECURITY DEFINER RPC so Vault secrets never reach the client. `delete-account` anonymizes the consumer snapshot on receipts (record retained, ADR-038 semantics). `receipts_enabled` is the kill switch.

**Consequence:** Sending requires one-time ops: Vault `send_receipt_url`, Edge secrets `TRIGGER_SECRET`/`RESEND_API_KEY`, a Resend-verified sender domain, and `supabase functions deploy send-receipt`. Until then receipts are issued but marked unsent (admin can resend). Guarded by `receipts.contract.test.js`, `Receipts.test.jsx` (admin), and table/function checks in `verify-db.js`.
