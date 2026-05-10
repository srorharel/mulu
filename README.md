# Wash — Mobile Car Wash Marketplace

On-demand mobile car wash PWA. Connects car owners with washers who travel to the customer's location.

## Daily workflow

Use `update.ps1` from the project root whenever you ship a change.

### First-time setup (PowerShell execution policy)

If PowerShell blocks the script on first run, allow it once:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

### Full update — web + new APK

```powershell
.\update.ps1 "describe what changed"
```

Answer **Y** at the APK prompt. The script commits, pushes to GitHub (Vercel auto-deploys), builds the bundle, syncs to Android, runs Gradle, and copies the APK to `wash-latest.apk` in the project root. Send that file to your phone and tap to install.

### Web-only update — no APK rebuild

```powershell
.\update.ps1 "describe what changed"
```

Answer **N** at the APK prompt. Vercel redeploys; no new APK is built. Use this when the change is frontend-only and the installed app doesn't need updating.

### npm-style invocation

```bash
npm run update -- "describe what changed"
```

The `--` separator is required so npm passes the argument through to the PowerShell script.

### Omitting the commit message

```powershell
.\update.ps1
```

Auto-generates a message: `"update: YYYY-MM-DD HH:MM"`.

---

## Tech stack

- **Frontend:** React 18 + Vite, Tailwind CSS, Lucide React, React Router v6
- **Backend:** Supabase (Postgres + PostGIS, Auth, Realtime, RLS)
- **Maps:** Leaflet + react-leaflet (OpenStreetMap — no API key needed)
- **Forms:** react-hook-form + zod

## Quick start

### 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**
2. Enter a name (e.g. `wash`), choose a region, and generate a strong database password — **save it**, you'll need it in the next step
3. Click **Create new project** and wait ~2 minutes for provisioning

### 2. Copy three values into .env

```bash
cp .env.example .env
```

Open `.env` and fill in all three variables:

| Variable | Where to find it in the Supabase dashboard |
|----------|--------------------------------------------|
| `VITE_SUPABASE_URL` | Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Settings → API → Project API keys → **anon public** |
| `DATABASE_URL` | Settings → Database → Connection string → **URI** — replace `[YOUR-PASSWORD]` with your database password |

### 3. Install dependencies

```bash
npm install
```

### 4. Disable email confirmation (development only)

Supabase requires email confirmation by default. For dev, turn it off so signups redirect immediately:

1. Supabase dashboard → **Authentication** → **Providers** → **Email**
2. Toggle **"Confirm email"** **off** → Save

With confirmation off, `signUp()` returns a live session and the app redirects to the home screen. In production, leave this **on** — the app shows a "Check your email" screen when confirmation is required.

### 5. Run setup

```bash
npm run setup
```

This runs in sequence: env validation → migrations → seed data → verification. If any step fails the error is printed and the process stops.

### 6. Test accounts

All five seed accounts use password **`Test1234!`** and have `email_confirmed_at` set, so they work regardless of the confirmation setting:

| Email | Role | Notes |
|-------|------|-------|
| `consumer1@test.dev` | consumer | 2 sample orders |
| `consumer2@test.dev` | consumer | 1 sample order |
| `washer1@test.dev` | washer | Online, near Jerusalem |
| `washer2@test.dev` | washer | Online, near Jerusalem |
| `washer3@test.dev` | washer | Offline |

### 5. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) on your phone browser or desktop.

## Build for production

```bash
npm run build
npm run preview
```

## User flows

### Consumer
1. Sign up → select **Car owner** role
2. Home: map auto-centres on your GPS location; drag pin to adjust
3. Pick car type & service; see live price breakdown
4. Tap **Book Now** → lands on live status tracker
5. Watch order progress in real-time as the washer advances through statuses

### Washer
1. Sign up → select **Washer** role
2. Dashboard: toggle **Online** — broadcasts your GPS location and shows nearby pending jobs
3. Tap a job card → review details → **Accept Job**
4. Active job screen: advance status step by step until **Completed**
5. Earnings screen: running total by job

## Pricing (ILS ₪)

| Car type | Exterior | Interior | Full |
|----------|----------|----------|------|
| Sedan    | ₪60      | ₪70      | ₪110 |
| SUV      | ₪75      | ₪85      | ₪130 |
| Pickup   | ₪80      | ₪90      | ₪140 |
| Van      | ₪90      | ₪100     | ₪160 |

Platform fee: **15%** shown separately. Validated both client- and server-side.

## Project structure

```
src/
  main.jsx          Entry point
  App.jsx           Root with providers
  router.jsx        All routes + auth guards
  lib/
    supabase.js     Supabase client
    pricing.js      Price table + calculator
    geo.js          Haversine + geo helpers
  context/
    AuthContext.jsx  Session + profile state
  components/
    ui/             BottomNav, PageShell, Toast
    MapPicker.jsx   Leaflet map with draggable pin
    JobCard.jsx     Washer job list card
    StatusTimeline.jsx  Order status steps
    RoleGuard.jsx   Auth + role-aware route guard
  pages/
    Landing / SignUp / Login / Profile
    consumer/       Home, OrderTracking, OrderHistory
    washer/         Dashboard, JobDetail, ActiveJob, Earnings
  hooks/
    useGeolocation.js     Browser GPS
    useRealtimeOrder.js   Supabase Realtime order watcher
    useNearbyJobs.js      nearby_jobs RPC + realtime refresh
supabase/
  migrations/       SQL run once, in order
  seed.sql          Test data
```

## Out of scope

Real payments, in-app chat, push notifications, ratings, i18n, admin dashboard.
