// src/lib/impersonate.js
//
// Main-app handler for the admin "Open as user" flow. On boot, AuthContext
// calls redeemImpersonationFromUrl() which:
//   1. reads ?impersonate_token=<plain> from window.location
//   2. POSTs to the impersonate-redeem Edge Function
//   3. verifies the returned magic-link OTP → fresh Supabase session
//   4. records an in-session banner ("Impersonated by admin …")
//   5. strips the token from the URL
//
// The banner is sessionStorage-scoped so it survives soft reloads but does
// NOT cross tabs and does NOT persist after the user closes the tab.

import { supabase } from './supabase.js'

const BANNER_KEY = 'wash-impersonation-banner'
const URL_PARAM  = 'impersonate_token'

function edgeUrl(name) {
  const base = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '')
  return `${base}/functions/v1/${name}`
}

function readBanner() {
  try {
    const raw = sessionStorage.getItem(BANNER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function writeBanner(b) {
  try { sessionStorage.setItem(BANNER_KEY, JSON.stringify(b)) } catch { /* noop */ }
}

export function getImpersonationBanner() {
  return readBanner()
}

export function clearImpersonationBanner() {
  try { sessionStorage.removeItem(BANNER_KEY) } catch { /* noop */ }
}

export async function redeemImpersonationFromUrl() {
  if (typeof window === 'undefined') return null
  const url = new URL(window.location.href)
  const token = url.searchParams.get(URL_PARAM)
  if (!token) return readBanner()  // Nothing to redeem; surface any existing banner.

  // Strip the param immediately so a refresh doesn't re-redeem (and the
  // token has already been single-use anyway).
  url.searchParams.delete(URL_PARAM)
  window.history.replaceState({}, '', url.toString())

  const res = await fetch(edgeUrl('impersonate-redeem'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
    },
    body: JSON.stringify({ token }),
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok || !payload?.target_email || !payload?.email_otp) return null

  // Verify the OTP → produces a real session as the target user.
  const { error } = await supabase.auth.verifyOtp({
    email: payload.target_email,
    token: payload.email_otp,
    type:  'email',
  })
  if (error) return null

  const banner = {
    target_user_id: payload.target_user_id,
    admin_id:       payload.admin_id,
    started_at:     new Date().toISOString(),
  }
  writeBanner(banner)
  return banner
}
