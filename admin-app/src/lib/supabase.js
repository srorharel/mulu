import { createClient } from '@supabase/supabase-js'

// Defensive normalization for env vars that may have been pasted into the
// Vercel dashboard with formatting noise:
//   - surrounding double or single quotes
//   - leading or trailing whitespace
//   - a trailing slash on the URL (supabase-js concats `${url}/auth/v1/...`,
//     producing a double-slash path that Supabase's gateway rejects with
//     "Invalid path specified in request URL")
//
// Same Supabase client; same `storageKey: 'wash-admin-auth'`; just
// tolerant of the Vercel-UI paste pitfalls. Exported so the regression
// test in __tests__/supabase.test.js can pin the normalization shape.
export function normalizeEnv(raw) {
  if (typeof raw !== 'string') return raw
  return raw.trim().replace(/^["']|["']$/g, '').replace(/\/+$/, '')
}

const url = normalizeEnv(import.meta.env.VITE_SUPABASE_URL)
const key = normalizeEnv(import.meta.env.VITE_SUPABASE_ANON_KEY)

if (!url || !key) {
  console.warn('[Admin] Copy .env.example to .env and fill in Supabase credentials.')
}

// Distinct storageKey isolates admin auth from main app and support-app
// when all three are open against the same domain.
export const supabase = url && key
  ? createClient(url, key, { auth: { storageKey: 'wash-admin-auth' } })
  : null
