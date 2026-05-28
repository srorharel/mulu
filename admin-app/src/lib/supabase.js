import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.warn('[Admin] Copy .env.example to .env and fill in Supabase credentials.')
}

// Distinct storageKey isolates admin auth from main app and support-app
// when all three are open against the same domain.
export const supabase = url && key
  ? createClient(url, key, { auth: { storageKey: 'wash-admin-auth' } })
  : null
