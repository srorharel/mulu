import { createClient } from '@supabase/supabase-js'

// Supabase client for the /auth/confirm landing page ONLY (token-hash email
// verification + password recovery). The anon key is a publishable, RLS-protected
// key — safe in client code.
//
// Security posture for an auth-landing origin:
//   persistSession:    false  → the recovery session lives only in memory on
//                               muluwash.com; no auth token is written to disk on
//                               the marketing origin.
//   autoRefreshToken:  false  → no background refresh; the page is short-lived.
//   detectSessionInUrl: false → we verify explicitly via verifyOtp({token_hash});
//                               nothing is parsed from the URL hash automatically.
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  : null
