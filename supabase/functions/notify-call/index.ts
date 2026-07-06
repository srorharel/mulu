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
  // send-notification authenticates the bearer against TRIGGER_SECRET (NOT the
  // service-role key — the two are not necessarily the same value). Every working
  // internal caller (fan-out-nearby-job, fan-out-legal-update) uses TRIGGER_SECRET,
  // so we must too, or send-notification 401s and the call push is silently dropped.
  const triggerSecret = Deno.env.get('TRIGGER_SECRET') ?? serviceKey

  // Verify the caller is authenticated.
  const admin = createClient(url, serviceKey)
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
  if (userErr || !userData?.user) return jsonResponse({ ok: false, error: 'unauthorized' })
  const fromId = userData.user.id

  // Authorization: the caller and callee MUST be the two parties on the given
  // order. Without this, any logged-in user could POST an arbitrary to_user_id +
  // spoofed from_name and spam a victim with a fake "incoming call" banner. The
  // app only ever calls between the consumer and washer of an active order, so
  // requiring that relationship costs nothing legitimate.
  if (!body.order_id) return jsonResponse({ ok: false, error: 'missing_order_id' })
  const { data: order } = await admin
    .from('orders')
    .select('consumer_id, washer_id')
    .eq('id', body.order_id)
    .maybeSingle()
  const parties = order ? [order.consumer_id, order.washer_id] : []
  if (
    !order ||
    fromId === body.to_user_id ||
    !parties.includes(fromId) ||
    !parties.includes(body.to_user_id)
  ) {
    return jsonResponse({ ok: false, error: 'not_a_party' })
  }

  // Fan out via send-notification (TRIGGER_SECRET bearer — see note above).
  // try/catch: a network throw here would 500 without CORS headers, which the
  // browser surfaces as an opaque error — return a JSON failure instead (the
  // in-app Realtime ring is the primary path anyway; this push is best-effort).
  try {
    const res = await fetch(`${url}/functions/v1/send-notification`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${triggerSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: body.to_user_id,
        event_type: 'incoming_call',
        data: {
          call_id: body.call_id ?? '',
          from_id: fromId,
          from_name: body.from_name ?? '',
          order_id: body.order_id ?? '',
          sound: 'bell',
          route: '/home',
        },
      }),
    })
    return jsonResponse({ ok: res.ok })
  } catch (e) {
    console.error('notify-call: send-notification fetch failed:', String(e))
    return jsonResponse({ ok: false, error: 'send_failed' })
  }
})
