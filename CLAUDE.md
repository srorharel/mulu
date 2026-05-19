# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Main app (port 3000) + support-app (port 3001) together
npm run dev:all        # Recommended: runs both apps via concurrently

# Individual apps
npm run dev            # Main app only (port 3000)
cd support-app && npm run dev   # Agent support app only (port 3001)

npm run build          # Production build (main app)
npm run lint           # ESLint (zero warnings policy)
npm run preview        # Preview production build locally

npm run setup          # Full DB init: check env → migrate → verify
npm run db:migrate     # Apply SQL migrations to Postgres
npm run db:verify      # Verify tables, RLS, functions, seed data
npm run check:env      # Validate required .env variables

npm run android:sync   # Build web + sync to Android Studio (Capacitor)
npm run android:open   # Open Android Studio

./update.ps1 "msg"     # Deploy: git commit → push (Vercel auto-deploys) → optional APK build
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

### Dual Vite Projects

There are **two separate Vite apps** in this repo:

| App | Path | Port | Users |
|-----|------|------|-------|
| Main app | `src/` | 3000 | Consumers + Washers |
| Support app | `support-app/src/` | 3001 | Agents only |

**Agents do not use the main app.** All agent features (queue, chat, approvals, tickets) live exclusively in `support-app/`. Never add agent UI to the main project. Run both with `npm run dev:all`.

### Roles

Three roles exist in `profiles.role`:
- `consumer` — books car wash jobs
- `washer` — accepts and performs jobs
- `agent` — support staff; only access `support-app`

### Routing and Auth (Main App)

`src/router.jsx` defines routes behind `<RoleGuard>`. `NotificationsInit` renders inside `BrowserRouter` to register push listeners once a user logs in.

**Consumer routes** (inside `ConsumerLayout`):
- `/home` — booking form + active order summary
- `/order/:id` — order tracking page
- `/history` — order history
- `/profile/vehicles` — saved vehicles management

**Washer routes**:
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
- `profiles` — role (`consumer`/`washer`/`agent`), GPS location (`current_location` PostGIS point, `last_lat`/`last_lng`/`last_location_at`), online status, preferences (`locale`, ringtone, nav app), tier/rating columns (`current_rating`, `current_tier` int 1–5, `rated_job_count`, `tier_changed_at`), `agent_display_name`
- `orders` — PostGIS `geography(Point, 4326)` for location, status state machine, vehicle category (`category IN ('private','jeep','pickup')`), pricing columns (`payout_amount` locked at acceptance), car details (`car_plate`, `car_make`, `car_model`, `car_color`, `car_year`), 4 consumer car photos (`car_photo_front/back/driver/passenger`), site flags (`site_has_water`, `site_has_power`), access notes, 4 arrival photos (`arrival_photo_front/back/driver/passenger`), 4 completion photos (`completion_photo_front/back/driver/passenger`), submitted location (`submitted_lat`, `submitted_lng`, `submitted_location_at`), rating columns (`rated_at`, `rating_skipped`), `cancelled_by` ('consumer'/'washer'/'agent'), `vehicle_id` FK to `vehicles`
- `order_events` — insert-only audit log
- `order_messages` — consumer↔washer direct chat per order; writable only while status is `accepted`/`en_route`/`arrived`/`in_progress`; read-only thereafter
- `vehicles` — consumer saved vehicles (`plate`, `nickname`, `make`, `model`, `year`, `color`, `category IN ('private','jeep','pickup')`, `is_default`); at most one default per consumer enforced by unique partial index
- `washer_ratings` — consumer star ratings (1–5) per completed order; drives tier recomputation
- `support_tickets` — auto-created on 1★ rating or manually; `reason IN ('low_rating','manual')`; `status IN ('open','in_progress','resolved')`
- `support_conversations` — washer/consumer-initiated support threads (`opener_role IN ('consumer','washer')`)
- `support_messages` — messages within a support conversation
- `support_canned_responses` — per-agent quick-reply templates
- `device_tokens` — FCM push tokens per user (`user_id`, `token`, `platform`, `last_seen_at`)
- `notification_preferences` — per-user push opt-in and sound preference (`enabled`, `sound`)
- `notification_log` — audit log of every push attempt (`user_id`, `event_type`, `payload`, `delivered`, `error`)
- `order_washer_notifications` — dedup table; one row per (order_id, washer_id) pair already notified for nearby-job fan-out

Key RPC functions (security-definer, called from client unless noted):
- `nearby_jobs(washer_lat, washer_lng, radius_km)` — spatial query returning pending orders within distance; **deliberately excludes `key_location`** until after acceptance (ADR-007)
- `get_washer_active_job()` — returns the washer's current in-flight order
- `transition_order_status(order_id, new_status, washer_lat?, washer_lng?)` — enforces allowed state transitions; requires 4 arrival photos + 100 m geofence for `en_route → arrived`; requires 4 completion photos + GPS for `in_progress → pending_approval`; agent can cancel or force-complete from any non-terminal status; writes `approved_at`/`approved_by` on agent completes
- `find_nearby_washers_for_order(p_order_id, p_radius_m)` — spatial query called by fan-out Edge Function; excludes washers already in `order_washer_notifications`
- `payout_for_tier(tier)` — returns payout ILS for tier 1–5 (40/45/50/55/60)
- `submit_rating(order_id, stars, feedback?)` / `skip_rating(order_id)` — consumer rates a completed wash
- `recompute_washer_tier(washer_id)` — recalculates `current_tier` from recent ratings
- `set_default_vehicle(vehicle_id)` — sets one vehicle as default, clears previous default
- `notify_send(user_id, event, data)` — internal helper called by DB triggers; fires `net.http_post` to `send-notification` Edge Function via Vault secrets

Migrations live in `supabase/migrations/` (0001–0053). Run `npm run db:migrate` to apply. `supabase/seed.sql` creates 5 test accounts (password `Test1234!`): `consumer1@test.dev`, `consumer2@test.dev`, `washer1@test.dev`, `washer2@test.dev`, `washer3@test.dev`.

### Storage Buckets

- `car-photos` — consumer car photos uploaded at booking time (4 angles per order: front/back/driver/passenger). Path: `{consumer_id}/{order_id}/{angle}.jpg`. Washer can read photos for their assigned order.
- `job-evidence` — washer arrival photos + completion photos. Signed URLs (600 s TTL) fetched client-side for display in RatingModal and support-app ApprovalRow.
- `support-attachments` — support chat file attachments (private, 5 MB, jpg/png/webp). Create manually in Supabase dashboard; apply `supabase/storage_support.sql` for RLS.

### Order Status State Machine

```
pending → accepted → en_route → arrived → in_progress → pending_approval → completed
                                     ↑                             ↑
                         100 m geofence + 4 arrival photos   4 completion photos + GPS
                                             agent approves in support-app → completed

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

Legacy `evidence_before_path`/`evidence_after_path` video columns still exist in the DB schema but are never written by the current UI.

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
- **Settings** (`/settings`) — agent display name + personal canned responses (create/delete)

**URL-based conversation persistence:** selected conversation is reflected in the URL as `/conversations/:conversationId`. On page load/refresh the Dashboard reads this param and auto-selects the conversation once the queue loads.

### Push Notifications

FCM (Firebase Cloud Messaging) push via two Supabase Edge Functions. Native Capacitor only — web/PWA shows an inline toast for foreground notifications but does not register push tokens.

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

**Supported event types:** `order_accepted`, `washer_on_way`, `washer_arrived`, `wash_completed`, `order_approved`, `order_cancelled`, `customer_cancelled`, `new_chat_message`, `new_job_nearby`, `support_message`, `support_resolved`, `tier_changed`

**DB triggers:**
- `trg_notify_on_new_order` (orders INSERT) → `fan-out-nearby-job`
- `trg_notify_on_support_message` (support_messages INSERT, agent/system sender only)
- `trg_notify_on_support_resolution` (support_conversations UPDATE, first terminal transition only)
- `trg_notify_on_tier_change` (profiles UPDATE, non-null tier change only)

**Client side** (`src/lib/notifications.js`):
- `initNotifications({ navigate, showToast })` — called once on login by `NotificationsInit` in the router; registers Capacitor push listeners before `PushNotifications.register()`; upserts token into `device_tokens`
- `unregisterToken()` — deletes the FCM token from DB on sign-out
- `getOsPermissionState()` — returns `'granted'|'denied'|'prompt'|'web'`

**Notification sounds** (available options): `chirp`, `chime`, `bell`, `gentle`. Files served from `/sounds/{name}.mp3`. Stored in `notification_preferences.sound`; picked by the user in Washer Settings (`NotificationsSection` component).

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

`capacitor.config.json` wraps the `dist/` web build as `com.sparklego.app`. `src/hooks/useGeolocation.js` falls back to Capacitor's native geolocation API when the browser API is unavailable. Build APK via `update.ps1` or Android Studio; output is `wash-latest.apk` in the project root.

### i18n

**Main app:** `i18next` with English and Hebrew. Locale persisted in `localStorage` and stored on `profiles.locale`. Loaded in `src/main.jsx` before React renders. Locale files in `src/i18n/locales/en.json` and `he.json`.

**Support app:** i18n resources defined inline in `support-app/src/main.jsx` (no separate locale files). `fallbackLng: 'he'`. Locale key in localStorage: `support_locale`.

### Vite Code Splitting

**Main app** (`vite.config.js`): manually chunks `leaflet`, `framer-motion`, and `@supabase/supabase-js`.

**Support app** (`support-app/vite.config.js`): same chunks plus `leaflet` for the `MiniMap` component used in Approvals and the chat `UserPanel`.
