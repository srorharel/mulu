# Wash Support App

Agent-facing support dashboard for the Wash platform. Reads and writes the same Supabase project as the main Wash app.

## Setup

```bash
cd support-app
cp .env.example .env
# Fill in the same VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY as the main app
npm install
npm run dev   # starts on port 3001
```

## Creating an agent account

There is no public signup. To create an agent:

1. In the Supabase dashboard → Authentication → Users: create the user (email + password).
2. In the SQL editor, insert their profile:

```sql
insert into public.profiles (id, role, full_name, agent_display_name, agent_is_active)
values (
  '<auth_user_id>',
  'agent',
  'Full Name',
  'Display Name shown to customers',
  true
);
```

3. Share the email/password with the agent. They log in at the support-app URL.

## Architecture

- Three-pane desktop-first layout: Queue rail | Chat pane | Context rail
- Realtime via Supabase channels on `support_conversations` (queue) and `support_messages` (chat)
- Typing indicators via Supabase Presence on `typing:{convId}`
- Hebrew-first RTL; English toggle available in Settings
- Agent role is enforced by `AuthContext`: non-agent sessions are signed out immediately

## Scripts

```bash
npm run dev      # Dev server on :3001
npm run build    # Production build
npm run preview  # Preview production build
```

## Deploying to Vercel

### One-time setup

1. Vercel dashboard → **Add New** → **Project** → import the same GitHub repo as the main app.
2. **Project name:** `wash-support` (or whatever subdomain you want).
3. **Root Directory:** click **Edit** → set to `support-app` (CRITICAL — isolates from the main app build).
4. **Framework Preset:** Vite (auto-detected).
5. **Build Command:** leave default (`vercel.json` overrides).
6. **Output Directory:** leave default (`vercel.json` overrides).
7. **Environment Variables:** add:
   - `VITE_SUPABASE_URL` = (same value as main app)
   - `VITE_SUPABASE_ANON_KEY` = (same value as main app)
8. Click **Deploy**.

### Custom domain (optional)

Vercel dashboard → support project → Settings → Domains → add `support.<yourdomain>`.

### How it works

- Both Vercel projects watch the same GitHub repo.
- Main app project: Root Directory = `.` → builds from root `package.json`.
- Support project: Root Directory = `support-app` → builds from `support-app/package.json`.
- A push to main triggers BOTH deployments in parallel.
- SPA routing: `vercel.json` has a catch-all rewrite so `/conversations/:id` doesn't 404 on refresh.
- Auth isolation: Supabase client uses `storageKey: 'wash-support-auth'` to avoid token collisions if domains overlap.

## Building the Agent Android APK

Prerequisites: JDK 17, Android SDK 34, Android Studio (or just Gradle CLI).

### First time

```bash
cd support-app
npm install
npx cap add android         # only if android/ doesn't exist
```

### Every build

```bash
cd support-app
npm run android:sync         # builds + copies dist into android/
npm run android:open         # opens Android Studio for signed builds
# OR for debug APK:
cd android && ./gradlew assembleDebug
# Output: support-app/android/app/build/outputs/apk/debug/app-debug.apk
```

### Naming the output

Rename to `wash-support-latest.apk` for distribution. The `update.ps1 -Support` flag in the repo root automates this.

### TODO (push notifications)

Push notifications are scaffolded (`src/lib/pushInit.js`) but not fully wired. Still needed:

- `google-services.json` for a Firebase project (separate from the main app, or shared — your choice)
- Add `google-services.json` to `support-app/android/app/`
- Reuse or create an Edge Function for agent-specific push events (new conversation, new ticket, new approval)
- App icon: currently uses the default Capacitor icon — replace with a branded "S" icon in `android/app/src/main/res/mipmap-*/`
