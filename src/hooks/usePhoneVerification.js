import { useState, useCallback } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase.js'
import { FEATURES } from '../lib/featureFlags.js'

// Roles that must verify their phone. Agents / super_admins use the other apps
// and are never gated here.
const GATED_ROLES = ['consumer', 'washer']

// Surfaces whether the current user still needs to verify their phone, and wraps
// the two Edge Functions (send-otp / verify-otp). `needed` is false unless the
// VITE_ENABLE_PHONE_VERIFY flag is on AND the profile is an unverified
// consumer/washer — so with the flag off this hook is completely inert and the
// gate modal never renders.
export function usePhoneVerification() {
  const { user, profile, refreshProfile } = useAuth()
  const [sending, setSending]     = useState(false)
  const [verifying, setVerifying] = useState(false)

  const needed =
    FEATURES.phoneVerification &&
    !!user && !!profile &&
    GATED_ROLES.includes(profile.role) &&
    !profile.phone_verified_at

  // Requests a fresh code to the registered number. Returns the Edge Function's
  // JSON body (`{ ok, sent, error, retry_after_s, ... }`) or a transport `error`.
  const sendCode = useCallback(async () => {
    setSending(true)
    try {
      const { data, error } = await supabase.functions.invoke('send-otp')
      return error ? { error } : (data ?? {})
    } finally {
      setSending(false)
    }
  }, [])

  // Submits a 6-digit code. On success refreshes the profile so `needed` flips
  // false and the gate closes. Returns `{ verified, error, attempts_left, ... }`.
  const verifyCode = useCallback(async (code) => {
    setVerifying(true)
    try {
      const { data, error } = await supabase.functions.invoke('verify-otp', { body: { code } })
      if (error) return { error }
      if (data?.verified) await refreshProfile()
      return data ?? {}
    } finally {
      setVerifying(false)
    }
  }, [refreshProfile])

  return { needed, phone: profile?.phone ?? '', sendCode, verifyCode, sending, verifying }
}
