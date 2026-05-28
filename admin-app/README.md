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

- React 18 + Vite + Tailwind, dark internal-console palette (amber/gold accent distinguishes from agent mint green).
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

## NOT built into this app

- **Capacitor / Android APK** — admin is desktop-first, by design. No `capacitor.config.json`, no `android/` directory, no `@capacitor/*` deps.
- **Push notifications** — the admin *sends* broadcasts; it does not *receive* them.
- **Leaflet** — no map UI here.
