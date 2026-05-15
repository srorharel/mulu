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
