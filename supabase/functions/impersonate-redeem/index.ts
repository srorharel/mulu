// supabase/functions/impersonate-redeem/index.ts
//
// Validates a one-time impersonation token issued by
// public.admin_create_impersonation_token (migration 0087) and returns a
// fresh Supabase session for the target user.
//
// Inputs:  { token: string }
// Outputs: { access_token, refresh_token, target_user_id, admin_id, expires_at }
//
// The auth here is the token itself — it is single-use and short-TTL. We
// hash + look up + mark-used in one UPDATE so a race produces 1 success and
// 1 "already_used".

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL          = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() })
  if (req.method !== 'POST')   return new Response('method_not_allowed', { status: 405, headers: corsHeaders() })

  let body: { token?: string }
  try { body = await req.json() } catch { return json({ error: 'invalid_json' }, 400) }
  const token = (body.token ?? '').trim()
  if (!token) return json({ error: 'token_required' }, 400)

  const hash = await sha256Hex(token)

  // Atomic claim: only one caller can flip used_at from NULL to now().
  const { data: claimed, error: claimErr } = await supabase
    .from('impersonation_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('token_hash', hash)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .select('id, target_user_id, admin_id, expires_at')
    .single()

  if (claimErr || !claimed) {
    return json({ error: 'invalid_or_used_or_expired' }, 401)
  }

  // Look up the target user's email — generateLink needs the email, not just id.
  const { data: target, error: tgtErr } = await supabase.auth.admin.getUserById(claimed.target_user_id)
  if (tgtErr || !target?.user?.email) {
    return json({ error: 'target_user_not_found' }, 404)
  }

  // generateLink('magiclink') returns a hashed_token + email we can build a
  // verify URL out of. For programmatic sign-in we use verifyOtp from the
  // returned token. Supabase doesn't expose a direct "give me a session for
  // user X" admin endpoint, so this is the supported workaround.
  const { data: link, error: linkErr } = await supabase.auth.admin.generateLink({
    type:  'magiclink',
    email: target.user.email,
  })
  if (linkErr) return json({ error: 'magiclink_failed', detail: linkErr.message }, 500)

  // The client will swap the hashed_token for a session via verifyOtp.
  return json({
    target_user_id: claimed.target_user_id,
    target_email:   target.user.email,
    admin_id:       claimed.admin_id,
    expires_at:     claimed.expires_at,
    hashed_token:   link?.properties?.hashed_token,
    email_otp:      link?.properties?.email_otp,
  })

  function json(obj: unknown, status = 200) {
    return new Response(JSON.stringify(obj), {
      status,
      headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
    })
  }
})
