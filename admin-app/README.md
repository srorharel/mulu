# Wash Admin

Owner-facing super-admin console for the Wash platform. **Web-only** (no Capacitor, no Android APK) — deploys to its own Vercel project alongside the main app and support-app, against the same Supabase backend.

## Setup

```bash
cd admin-app
cp .env.example .env
# Fill in the same VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY as the main app
npm install
npm run dev   # starts on port 3002
```

## Provisioning a super_admin

There is no public signup. To create the first super_admin (and any subsequent ones):

1. Supabase dashboard → **Authentication** → **Users** → create the user (email + password).
2. SQL editor:

```sql
INSERT INTO public.profiles (id, role, full_name)
VALUES (
  '<auth_user_id>',
  'super_admin',
  'Owner Name'
);
```

3. Sign in at the admin URL with the email + password.

Non-`super_admin` accounts that authenticate are signed out immediately by `AuthContext`. Agents do **not** inherit super_admin powers; super_admins do **not** inherit agent powers. They are separate roles by design.

## Architecture

- React 18 + Vite + Tailwind, light internal-console palette (amber/gold accent distinguishes from agent mint green).
- LTR-first (English default); Hebrew supported via the locale toggle in the sidebar header.
- Auth via `@supabase/supabase-js` with `storageKey: 'wash-admin-auth'` — isolates from the main app and support-app even when all three are open on the same domain.
- Role gating mirrors the support-app pattern (`AuthContext.jsx` rejects `role !== 'super_admin'`).
- Tabs: Content (P2) · Branding (P3) · Broadcasts (P4) · Config (P5).

## Deploying to Vercel

### One-time setup

1. Vercel dashboard → **Add New** → **Project** → import the same GitHub repo as the main app.
2. **Project name:** `wash-admin` (or whatever subdomain you want).
3. **Root Directory:** set to `admin-app`. CRITICAL — isolates the admin build from the main and support builds.
4. **Framework Preset:** Vite (auto-detected).
5. **Environment Variables:** add the same `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as the main app.
6. Click **Deploy**.

A push to `main` triggers all three Vercel projects (main, support, admin) in parallel; the admin project ignores changes outside `admin-app/` automatically.

### How it works

- All three Vercel projects watch the same GitHub repo.
- Admin project: Root Directory = `admin-app` → builds from `admin-app/package.json`.
- SPA routing: `vercel.json` has a catch-all rewrite so deep links don't 404 on refresh.
- Auth isolation: `storageKey: 'wash-admin-auth'`.

## Scripts

```bash
npm run dev      # Dev server on :3002
npm run build    # Production build
npm run preview  # Preview production build
npm run lint     # ESLint (zero warnings policy)
npm run test     # Vitest run
```

## Sync policy

The CMS lets you edit live runtime content (i18n strings, brand assets, config knobs) without redeploying. That power has a maintenance cost: over time the live DB drifts from the bundled code defaults. Keep these rules in mind:

- **The DB is the source of truth for runtime content.** Whatever the admin saves into `content_overrides`, `app_branding`, `app_config`, `pricing_config`, or `payout_tier_config` is what every running app reads.
- **Code defaults are fallbacks** for fresh installs (no DB row yet) and for the offline-boot path (when `loadOverrides()` can't reach Supabase). They are NOT the canonical content once a row exists.
- **Run `npm run drift` periodically** from the repo root. It prints a per-table report comparing live DB rows against the bundled defaults. Use it to spot:
  - Overrides that match the bundle (safe to delete — their existence is just noise)
  - Overrides that genuinely differ (real product decisions that should eventually be merged back into the bundle)
  - Orphaned overrides (the bundle dropped the key but the DB row lingers)
- **When the drift list gets noisy**, click **Export overrides** in the Content tab (and **Export branding + config** in the Dashboard side rail). Hand the resulting JSON to Claude Code with the prompt: "merge these into the bundled defaults and clear the corresponding override rows". The bundles get a synchronized refresh; the DB loses the now-redundant rows; the admin starts clean.
- **Never edit `en.json`/`he.json` AND the corresponding `content_overrides` row in the same change without consciously deciding which wins.** The DB always wins at runtime (boot-time merge via `addResourceBundle`), so a bundle edit alone won't fix a "wrong string in production" report if a DB override exists. Reset the override (the per-row Reset button on every Content / Branding / Config table) when you want the bundle value to win again.

## Scripts

```bash
npm run dev      # Dev server on :3002
npm run build    # Production build
npm run preview  # Preview production build
npm run lint     # ESLint (zero warnings policy)
npm run test     # Vitest run
```

From the repo root:

```bash
npm run drift           # all three drift reports in sequence
npm run drift:content   # content_overrides only
npm run drift:branding  # app_branding only
npm run drift:config    # app_config + pricing_config + payout_tier_config
```

## NOT built into this app

- **Capacitor / Android APK** — admin is desktop-first, by design. No `capacitor.config.json`, no `android/` directory, no `@capacitor/*` deps.
- **Push notifications** — the admin *sends* broadcasts; it does not *receive* them.
- **Leaflet** — no map UI here.
