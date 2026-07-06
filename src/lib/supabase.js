import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

const PLACEHOLDER_URL = 'https://your-project-id.supabase.co'
const PLACEHOLDER_KEY = 'your-anon-key-here'

export const isSupabaseConfigured =
  !!url && !!key && url !== PLACEHOLDER_URL && key !== PLACEHOLDER_KEY

if (!isSupabaseConfigured) {
  console.warn(
    '[MULU] Supabase is not configured.\n' +
    'Copy .env.example to .env and fill in your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.\n' +
    'Get them from: Supabase dashboard → your project → Settings → API'
  )
}

const CONFIG_MSG =
  'Supabase is not configured — copy .env.example to .env and fill in your project credentials.'

// Stub client returned when env vars are missing so the app renders instead of white-screening.
// auth.getSession / onAuthStateChange return safe nulls so AuthContext loads normally.
// All other calls surface the config error via Supabase's { data, error } format.
const stubClient = {
  auth: {
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signInWithPassword: () => Promise.resolve({ data: null, error: { message: CONFIG_MSG } }),
    signUp: () => Promise.resolve({ data: null, error: { message: CONFIG_MSG } }),
    resetPasswordForEmail: () => Promise.resolve({ data: null, error: { message: CONFIG_MSG } }),
    updateUser: () => Promise.resolve({ data: null, error: { message: CONFIG_MSG } }),
    signOut: () => Promise.resolve({ error: null }),
  },
  from: () => { throw new Error(CONFIG_MSG) },
  rpc: () => Promise.reject(new Error(CONFIG_MSG)),
  // Chainable so multi-listener channels (.on().on().subscribe()) don't throw.
  channel: () => {
    const chan = { on: () => chan, subscribe: () => chan, send: () => Promise.resolve() }
    return chan
  },
  removeChannel: () => {},
}

export const supabase = isSupabaseConfigured ? createClient(url, key) : stubClient
