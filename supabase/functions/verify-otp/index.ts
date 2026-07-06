// supabase/functions/verify-otp/index.ts
//
// Feature 1 (HIDDEN): checks a 6-digit code against the active challenge for the
// CALLING user and, on success, stamps profiles.phone_verified_at = now() and
// clears the user's verification rows. Invoked from the browser via
// supabase.functions.invoke('verify-otp', { body: { code } }).
//
// Security: the active challenge is the newest non-expired row; codes are
// compared as salted SHA-256 hashes (same hash the sender stored). Max 5
// attempts per challenge, then it locks (a new code is needed).
//
// Edge Function secrets: OTP_HASH_SALT (same value as send-otp).
//
// Expected outcomes return HTTP 200 with a `verified` flag + `error` field so
// the browser's functions.invoke() always yields `data`.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

const MAX_ATTEMPTS = 5

async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ verified: false, error: 'method_not_allowed' })

  const salt = Deno.env.get('OTP_HASH_SALT')
  if (!salt) {
    console.error('verify-otp: OTP_HASH_SALT not set')
    return jsonResponse({ verified: false, error: 'server_misconfigured' })
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!jwt) return jsonResponse({ verified: false, error: 'unauthorized' })

  let code = ''
  try {
    code = String((await req.json()).code ?? '').replace(/\D/g, '')
  } catch {
    return jsonResponse({ verified: false, error: 'bad_request' })
  }
  if (code.length !== 6) return jsonResponse({ verified: false, error: 'invalid_code' })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
  if (userErr || !userData?.user) return jsonResponse({ verified: false, error: 'unauthorized' })
  const userId = userData.user.id

  // Active challenge = newest non-expired row.
  const { data: rows } = await admin
    .from('phone_verifications')
    .select('id, phone, code_hash, attempts, expires_at')
    .eq('user_id', userId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)

  const challenge = rows?.[0]
  if (!challenge) return jsonResponse({ verified: false, error: 'expired' })
  if (challenge.attempts >= MAX_ATTEMPTS) return jsonResponse({ verified: false, error: 'locked' })

  // The code was SENT to challenge.phone — it only proves ownership of THAT
  // number. If the profile phone changed since (editable in Profile), stamping
  // would "verify" a number the user never received a code on.
  const { data: prof } = await admin
    .from('profiles')
    .select('phone')
    .eq('id', userId)
    .single()
  if (!prof?.phone || prof.phone !== challenge.phone) {
    return jsonResponse({ verified: false, error: 'phone_changed' })
  }

  // Claim an attempt slot ATOMICALLY before comparing — N parallel requests
  // otherwise all read the same counter, each learns a compare result, and
  // together they exceed MAX_ATTEMPTS. The .eq('attempts', …) is a CAS: only
  // one concurrent request wins the slot; losers are told to retry.
  const { data: claimed } = await admin.from('phone_verifications')
    .update({ attempts: challenge.attempts + 1 })
    .eq('id', challenge.id)
    .eq('attempts', challenge.attempts)
    .select('id')
  if (!claimed?.length) return jsonResponse({ verified: false, error: 'retry' })

  const candidate = await sha256hex(`${code}:${userId}:${salt}`)
  if (candidate !== challenge.code_hash) {
    return jsonResponse({
      verified: false,
      error: 'wrong_code',
      attempts_left: Math.max(0, MAX_ATTEMPTS - (challenge.attempts + 1)),
    })
  }

  // Success: stamp the profile + clear all challenges for this user.
  await admin.from('profiles')
    .update({ phone_verified_at: new Date().toISOString() })
    .eq('id', userId)
  await admin.from('phone_verifications').delete().eq('user_id', userId)

  return jsonResponse({ verified: true })
})
