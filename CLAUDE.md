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

**Agents do not use the main app.** All agent features (queue, chat, approvals) live exclusively in `support-app/`. Never add agent UI to the main project. Run both with `npm run dev:all`.

### Roles

Three roles exist in `profiles.role`:
- `consumer` — books car wash jobs
- `washer` — accepts and performs jobs
- `agent` — support staff; only access `support-app`

### Routing and Auth (Main App)

`src/router.jsx` defines routes behind `<RoleGuard>`, which reads profile role from `AuthContext`:
- **Consumer routes:** `/home`, `/order/:id`, `/history`
- **Washer routes:** `/washer` (map view), `/washer/job/:id`, `/washer/earnings`, `/washer/settings`
- **Shared route:** `/support` — branches on role; washer sees washer support chat, consumer sees consumer support
- **Public routes:** `/`, `/login`, `/signup`

`src/context/AuthContext.jsx` manages the Supabase session and user profile. All auth state flows from here.

### Database (Supabase + PostGIS)

Key tables:
- `profiles` — role (`consumer`/`washer`/`agent`), GPS location columns (`current_location` PostGIS point, `last_lat`/`last_lng`/`last_location_at` for agent visibility), online status, preferences (locale, ringtone, nav app)
- `orders` — PostGIS `geography(Point, 4326)` for location, status state machine, pricing columns, car details (`car_plate`, `car_make`, `car_model`, `car_color`, `car_year`), evidence video paths (`evidence_before_path`, `evidence_after_path`)
- `order_events` — insert-only audit log
- `support_conversations` — washer/consumer-initiated support threads (`opener_role IN ('consumer', 'washer')`)
- `support_messages` — messages within a conversation
- `support_canned_responses` — agent quick-reply templates

Key RPC functions (security-definer, called from client):
- `nearby_jobs(washer_lat, washer_lng, radius_km)` — spatial query returning pending orders within distance; **deliberately excludes `key_location`** until after acceptance (ADR-007)
- `get_washer_active_job()` — returns the washer's current in-flight order
- `transition_order_status(order_id, new_status)` — enforces allowed state transitions; agent can also cancel or force-complete from any non-terminal status (migration 0023); `approved_at`/`approved_by` stamp on all agent-initiated completes

Migrations live in `supabase/migrations/` (0001–0023). Run `npm run db:migrate` to apply. `supabase/seed.sql` creates 5 test accounts (password `Test1234!`): `consumer1@test.dev`, `consumer2@test.dev`, `washer1@test.dev`, `washer2@test.dev`, `washer3@test.dev`.

### Order Status State Machine

```
pending → accepted → en_route → arrived → in_progress → pending_approval → completed
                                                                          ↑
                                             washer submits before+after evidence
                                             agent approves in support-app → completed

Agent overrides (migration 0023):
  agent can cancel from any non-terminal status
  agent can force-complete from any non-terminal status (bypasses evidence/pending_approval)
Any state → cancelled
```

### Pricing (Flat)

Prices are set exclusively by the `validate_order_prices` Postgres trigger — never trust client-supplied prices:
- **Consumer pays:** ₪100 (`CONSUMER_PRICE_ILS`)
- **Washer earns:** ₪60 (`WORKER_PAYOUT_ILS`)
- **VAT:** 18% (`VAT_RATE`)
- Service type is always `wash` (single product; no add-ons, no interior vs exterior distinction)

### Israeli License Plate Lookup

Car details are populated via `src/lib/vehicleLookup.js` which queries the data.gov.il CKAN API (`{plate}` → make/model/color/year). Manual fallback fields are shown when the lookup fails. The picker is `src/components/LicensePlatePicker.jsx` — a single DOM element (never unmounts the input mid-flow).

### Approval Workflow

When a washer completes a job:
1. Washer records before/after evidence videos → uploaded to `job-evidence` Storage bucket
2. Order transitions to `pending_approval`
3. Agent sees the order in support-app Approvals tab
4. Agent reviews videos + washer GPS location card, clicks Approve
5. `transition_order_status` RPC (called with agent session) sets status → `completed`, writes `approved_at`/`approved_by`

### Support Chat

`support_conversations` / `support_messages` is the single chat system. Washers and consumers open conversations from `/support` in the main app. Agents see and respond from support-app's queue/chat pane. The support-app has three views:
- **Queue tab** — conversation list with type label pills (Mine / In treatment / Waiting / General) inline in each row
- **Chat pane** — message stream + composer + typing presence
- **Approvals tab** — pending_approval orders with video review + one-click approve
- **Order panel** (right rail, when conversation has a linked order) — order details + agent Cancel / Mark complete (override) action buttons; subscribes to realtime order row updates

**URL-based conversation persistence:** selected conversation is reflected in the URL as `/conversations/:conversationId`. On page load/refresh the Dashboard reads this param and auto-selects the conversation once the queue loads. Clicking a queue row navigates to that URL.

### Realtime

Supabase Realtime channels drive live UX:
- `order:{orderId}` — consumers and washers watch order status changes
- `order-panel-{orderId}` — support-app OrderPanel subscribes to UPDATE events on the linked order so status changes reflect immediately without a page reload
- Washer dashboards subscribe via `useNearbyJobs` hook, which also does client-side distance filtering
- Washer GPS is written to `profiles.current_location` (PostGIS) every 10s when online; `last_lat`/`last_lng`/`last_location_at` are also written for agent location cards
- support-app subscribes to `profiles` row changes to show live washer location in both the Approvals view and the UserPanel chat sidebar

### Mobile (Capacitor)

`capacitor.config.json` wraps the `dist/` web build as `com.sparklego.app`. `src/hooks/useGeolocation.js` falls back to Capacitor's native geolocation API when the browser API is unavailable. Build APK via `update.ps1` or Android Studio; output is `wash-latest.apk` in the project root.

### i18n

**Main app:** `i18next` with English and Hebrew. Locale persisted in `localStorage` and also stored on `profiles.locale`. Loaded in `src/main.jsx` before React renders. Locale files in `src/i18n/locales/en.json` and `he.json`.

**Support app:** i18n resources are defined inline in `support-app/src/main.jsx` (no separate locale files). `fallbackLng: 'he'`. Locale key in localStorage: `support_locale`.

### Vite Code Splitting

**Main app** (`vite.config.js`): manually chunks `leaflet`, `framer-motion`, and `@supabase/supabase-js`.

**Support app** (`support-app/vite.config.js`): same chunks plus `leaflet` for the MiniMap component used in Approvals and the chat UserPanel.
