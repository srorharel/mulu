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
- Tabs: Live Jobs (P6) · Users (P7) · Content (P2) · Branding (P3) · Broadcasts (P4) · Design Editor (P8) · Config (P5).

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
npm run drift           # all four drift reports in sequence
npm run drift:content   # content_overrides only
npm run drift:branding  # app_branding only
npm run drift:config    # app_config + pricing_config + payout_tier_config
npm run drift:design    # design_overrides vs editableManifest.json
```

## Design Editor (P8)

See ADR-027 for the philosophy and bound rules. Quick reference:

- **Enter:** click the **Design Editor** tab. Passphrase prompt appears; type `121212`. This is a SOFT GATE — it prevents accidental entry but is not a security boundary. RLS + the bound-validating RPC enforce real write protection.
- **Edit a surface:** from the unlocked editor, click **Edit live** next to any registered surface. The main / support app opens in a new tab with `?design_edit=1`. An amber outline appears on hover over every `<Editable>` component; tap one and an inline property panel slides in (color, bg, text-size, padding, border-radius, offset-x, offset-y).
- **What's editable:** only the seven visual properties above, only on surfaces wrapped in `<Editable id="...">`, and only the ids registered in `admin-app/src/data/editableManifest.json`. JSX structure, SVG icons, form behavior, and the admin app itself are NOT editable.
- **Bounds:** offsets ±100 px, text-size 0.7–1.5 em, radius 0–32 px, padding 0–48 px. Enforced both client-side (slider min/max) and server-side (RPC raises on out-of-bound writes).
- **Reset a property:** each row in the Active Overrides table has a Reset button (clears the single override). The **Reset all** button at the top of the editor wipes every row — confirm by typing `RESET DESIGN`.
- **Drift:** `npm run drift:design` reports orphan rows (id was removed from the manifest) and unbounded values (impossible via the RPC; only happens if a back-door write inserted them).
- **Exit edit mode:** the bottom-of-screen amber bar shows "Exit edit mode" — click to clear the session flag and reload.

## NOT built into this app

- **Capacitor / Android APK** — admin is desktop-first, by design. No `capacitor.config.json`, no `android/` directory, no `@capacitor/*` deps.
- **Push notifications** — the admin *sends* broadcasts; it does not *receive* them.
- ~~Leaflet~~ — Leaflet IS now used in `CreateOrderForm.jsx` (P6) for the location pin step when creating an order on behalf of a consumer.
