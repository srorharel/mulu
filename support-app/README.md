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
