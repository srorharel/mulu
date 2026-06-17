// supabase/functions/notify-call/index.ts
//
// Feature 2 (HIDDEN): best-effort "incoming call" push so the callee rings even
// when the app is backgrounded/closed. Invoked by the CALLER from the browser
// via supabase.functions.invoke('notify-call', { body: { to_user_id, call_id,
// from_name, order_id } }).
//
// The in-app Realtime ring is the PRIMARY path (works while the app is open);
// this just fans a push out via the existing send-notification function, so it
// reuses all the FCM token / locale / channel machinery already in place.
//
// It does NOT, by itself, produce a full-screen CallKit / Android telecom
// incoming-call screen — that's a native follow-up (see OTP_AND_CALLS_SETUP.md).
// Tapping the push opens the app, where the in-app CallSheet takes over if the
// call is still ringing.
//
// Auth: the caller's JWT (so only a logged-in user can trigger a ring). Internal
// fan-out to send-notification uses the service role key (== that function's
// TRIGGER_SECRET). All outcomes return HTTP 200.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!jwt) return jsonResponse({ ok: false, error: 'unauthorized' })

  let body: { to_user_id?: string; call_id?: string; from_name?: string; order_id?: string }
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ ok: false, error: 'bad_request' })
  }
  if (!body.to_user_id) return jsonResponse({ ok: false, error: 'missing_to_user_id' })

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const url = Deno.env.get('SUPABASE_URL')!

  // Verify the caller is authenticated (we don't restrict who they call — that's
  // already constrained by the app surfacing the button only on an active order).
  const admin = createClient(url, serviceKey)
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
  if (userErr || !userData?.user) return jsonResponse({ ok: false, error: 'unauthorized' })

  // Fan out via send-notification (same service-role bearer it expects).
  const res = await fetch(`${url}/functions/v1/send-notification`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: body.to_user_id,
      event_type: 'incoming_call',
      data: {
        call_id: body.call_id ?? '',
        from_name: body.from_name ?? '',
        order_id: body.order_id ?? '',
        sound: 'bell',
        route: '/home',
      },
    }),
  })

  return jsonResponse({ ok: res.ok })
})
