// supabase/functions/send-otp/index.ts
//
// Feature 1 (HIDDEN): sends a 6-digit SMS verification code to the registered
// phone of the CALLING user. Invoked from the browser via
// supabase.functions.invoke('send-otp') with the user's session (so the
// platform validates the JWT and we read the uid from it — a user can only
// request a code for their own number).
//
// The code is stored only as a salted SHA-256 hash in phone_verifications
// (service-role-only table). Plaintext is sent via the SMS provider and never
// persisted. See verify-otp for the check side.
//
// Edge Function secrets:
//   OTP_HASH_SALT  — REQUIRED. Random string; salts the stored code hash.
//   SMS_PROVIDER + SMS_* — the SMS adapter (see _shared/sms.ts). Defaults to
//                  'log' (no real send) so this is safe before a provider exists.
//   (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are auto-injected by the platform.)
//
// Abuse limits: 60s cooldown between sends, max 5 codes/hour per user.
//
// Expected outcomes are returned as HTTP 200 with an `ok`/`error` field so the
// browser's functions.invoke() always yields `data` (non-2xx becomes an opaque
// FunctionsHttpError). Only true faults log to console.error.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { sendSms, toIsraeliE164 } from '../_shared/sms.ts'

const CODE_TTL_MIN = 10
const RESEND_COOLDOWN_S = 60
const MAX_PER_HOUR = 5

async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function genCode(): string {
  const a = new Uint32Array(1)
  crypto.getRandomValues(a)
  return String(a[0] % 1_000_000).padStart(6, '0')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method_not_allowed' })

  const salt = Deno.env.get('OTP_HASH_SALT')
  if (!salt) {
    console.error('send-otp: OTP_HASH_SALT not set')
    return jsonResponse({ ok: false, error: 'server_misconfigured' })
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!jwt) return jsonResponse({ ok: false, error: 'unauthorized' })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Identify the caller from their JWT — they can only verify their own number.
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
  if (userErr || !userData?.user) return jsonResponse({ ok: false, error: 'unauthorized' })
  const userId = userData.user.id

  const { data: profile } = await admin
    .from('profiles')
    .select('phone, phone_verified_at')
    .eq('id', userId)
    .single()

  if (!profile?.phone) return jsonResponse({ ok: false, error: 'no_phone_on_file' })
  if (profile.phone_verified_at) return jsonResponse({ ok: true, sent: false, already_verified: true })

  // Housekeeping: drop challenges older than the rate-limit window. NOT rows
  // that merely expired (10-min TTL) — deleting those before counting reduced
  // the "5/hour" cap to 5 per 10 minutes (send 5, wait for expiry, repeat →
  // ~30 SMS/hour). Rows must survive a full hour to be countable; expiry is
  // enforced at verify time.
  await admin.from('phone_verifications').delete()
    .eq('user_id', userId)
    .lt('created_at', new Date(Date.now() - 3600_000).toISOString())

  // Throttle: cooldown + hourly cap, computed from the rows in the last hour.
  const hourAgo = new Date(Date.now() - 3600_000).toISOString()
  const { data: recent } = await admin
    .from('phone_verifications')
    .select('last_sent_at')
    .eq('user_id', userId)
    .gte('created_at', hourAgo)
    .order('last_sent_at', { ascending: false })

  if (recent && recent.length) {
    const sinceLast = (Date.now() - new Date(recent[0].last_sent_at).getTime()) / 1000
    if (sinceLast < RESEND_COOLDOWN_S) {
      return jsonResponse({ ok: false, error: 'cooldown', retry_after_s: Math.ceil(RESEND_COOLDOWN_S - sinceLast) })
    }
    if (recent.length >= MAX_PER_HOUR) {
      return jsonResponse({ ok: false, error: 'rate_limited' })
    }
  }

  const code = genCode()
  const codeHash = await sha256hex(`${code}:${userId}:${salt}`)
  const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60_000).toISOString()

  const { error: insErr } = await admin.from('phone_verifications').insert({
    user_id: userId,
    phone: profile.phone,
    code_hash: codeHash,
    expires_at: expiresAt,
  })
  if (insErr) {
    console.error('send-otp: insert failed:', insErr)
    return jsonResponse({ ok: false, error: 'db_error' })
  }

  const sms = await sendSms(
    toIsraeliE164(profile.phone),
    `MULU: קוד האימות שלך הוא ${code}`,
    { code },
  )
  if (!sms.ok) {
    console.error('send-otp: SMS provider rejected:', sms.detail)
    return jsonResponse({ ok: false, error: 'sms_failed' })
  }

  return jsonResponse({ ok: true, sent: true, expires_in_s: CODE_TTL_MIN * 60 })
})
