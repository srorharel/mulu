# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev            # Vite dev server on port 3000
npm run build          # Production build
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

### Routing and Auth

`src/router.jsx` defines routes behind `<RoleGuard>`, which reads profile role from `AuthContext`:
- **Consumer routes:** `/home`, `/order/:id`, `/history`
- **Washer routes:** `/washer` (map view), `/washer/job/:id`, `/washer/earnings`, `/washer/settings`, etc.
- **Public routes:** `/`, `/login`, `/signup`

`src/context/AuthContext.jsx` manages the Supabase session and user profile. All auth state flows from here.

### Database (Supabase + PostGIS)

Key tables:
- `profiles` — role (`consumer`/`washer`), GPS location, online status, preferences (locale, ringtone, nav app)
- `orders` — PostGIS `geography(Point, 4326)` for location, status state machine, pricing columns, add-ons, evidence video paths
- `order_events` — insert-only audit log

Key RPC functions (security-definer, called from client):
- `nearby_jobs(washer_lat, washer_lng, radius_km)` — spatial query returning pending orders within distance; **deliberately excludes `key_location`** until after acceptance (ADR-007)
- `get_washer_active_job()` — returns the washer's current in-flight order
- `transition_order_status(order_id, new_status)` — enforces allowed state transitions; pricing is validated by a Postgres trigger (`validate_order_prices`)

Migrations live in `supabase/migrations/` (0001–0010). Run `npm run db:migrate` to apply. `supabase/seed.sql` creates 5 test accounts (password `Test1234!`): `consumer1@test.dev`, `consumer2@test.dev`, `washer1@test.dev`, `washer2@test.dev`, `washer3@test.dev`.

### Realtime

Supabase Realtime channels drive live UX:
- `order:{orderId}` — consumers and washers watch order status changes
- Washer dashboards subscribe via `useNearbyJobs` hook, which also does client-side distance filtering
- Washer GPS is written to `profiles.location` on an interval when online

### Mobile (Capacitor)

`capacitor.config.json` wraps the `dist/` web build as `com.sparklego.app`. `src/hooks/useGeolocation.js` falls back to Capacitor's native geolocation API when the browser API is unavailable. Build APK via `update.ps1` or Android Studio; output is `wash-latest.apk` in the project root.

### Pricing

Prices are set exclusively by the `validate_order_prices` Postgres trigger — never trust client-supplied prices. Base price depends on car type + service type (ILS ₪), add-ons (wiper fluid, tire pressure ₪20 each) fold into base price, and a 15% platform fee is applied.

### i18n

`i18next` with English and Hebrew. Locale persisted in `localStorage` and also stored on `profiles.locale`. Loaded in `src/main.jsx` before React renders.

### Vite Code Splitting

`vite.config.js` manually chunks `leaflet`, `framer-motion`, and `@supabase/supabase-js` into separate vendor bundles to keep the initial bundle small.
