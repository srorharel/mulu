import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Timing-safe comparison (same as send-notification) ───────────────────────

function timingSafeEqual(a: string, b: string): boolean {
  const enc    = new TextEncoder()
  const aBytes = enc.encode(a)
  const bBytes = enc.encode(b)
  if (aBytes.length !== bBytes.length) return false
  let diff = 0
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i]
  return diff === 0
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // Auth: same TRIGGER_SECRET used by send-notification
  const triggerSecret = Deno.env.get('TRIGGER_SECRET') ?? ''
  const authHeader    = req.headers.get('Authorization') ?? ''
  const bearerToken   = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

  if (!timingSafeEqual(bearerToken, triggerSecret)) {
    return new Response('Unauthorized', { status: 401 })
  }

  let order_id: string
  try {
    const body = await req.json()
    order_id = body.order_id
  } catch {
    return new Response('Bad request', { status: 400 })
  }
  if (!order_id) return new Response('Missing order_id', { status: 400 })

  // ── Radius config ─────────────────────────────────────────────────────────
  const envRadius = Deno.env.get('NEARBY_JOB_RADIUS_METERS')
  let radiusMeters = 15000
  if (envRadius) {
    const parsed = parseInt(envRadius, 10)
    if (!isNaN(parsed) && parsed > 0) {
      radiusMeters = parsed
    }
  } else {
    console.warn('fan-out-nearby-job: NEARBY_JOB_RADIUS_METERS not set, using default 15000 m')
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabase    = createClient(supabaseUrl, triggerSecret)

  // ── 1. Spatial query: find eligible nearby online washers ─────────────────
  // find_nearby_washers_for_order excludes washers already in order_washer_notifications
  // for this order — built-in re-notification suppression.
  const { data: washers, error: spatialErr } = await supabase.rpc(
    'find_nearby_washers_for_order',
    { p_order_id: order_id, p_radius_m: radiusMeters }
  )

  if (spatialErr) {
    console.error('fan-out-nearby-job: spatial query failed:', spatialErr.message)
    return new Response(JSON.stringify({ error: spatialErr.message }), { status: 500 })
  }

  if (!washers?.length) {
    return new Response(
      JSON.stringify({ notified: 0, order_id, radius_m: radiusMeters }),
      { status: 200 }
    )
  }

  // ── 2. Mark washers as notified (batch) ───────────────────────────────────
  // Insert before sending so a crash mid-send doesn't leave a partially
  // notified state that re-triggers on retry.
  const { error: insertErr } = await supabase
    .from('order_washer_notifications')
    .insert(washers.map((w: { washer_id: string }) => ({
      order_id,
      washer_id: w.washer_id,
    })))

  if (insertErr) {
    // Non-blocking: log and continue. The suppression check will catch true dupes.
    console.error('fan-out-nearby-job: order_washer_notifications insert failed:', insertErr.message)
  }

  // ── 3. Fan out: call send-notification once per washer ────────────────────
  // send-notification URL is constructed from SUPABASE_URL (auto-injected),
  // avoiding the need for a separate Vault secret for this internal URL.
  const sendUrl = `${supabaseUrl}/functions/v1/send-notification`

  const results = await Promise.allSettled(
    washers.map((w: { washer_id: string; dist_m: number }) =>
      fetch(sendUrl, {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${triggerSecret}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          user_id:    w.washer_id,
          event_type: 'new_job_nearby',
          data: {
            order_id,
            distance_m: Math.round(w.dist_m).toString(),
          },
        }),
      })
    )
  )

  // A fulfilled fetch is NOT a delivered push — an HTTP-level failure from
  // send-notification (the documented TRIGGER_SECRET-mismatch 401 class, 5xx)
  // resolves the promise. Counting those as "sent" reports sent=N failed=0
  // while zero washers get the push. Check response.ok like the other fan-outs.
  const sent   = results.filter(r => r.status === 'fulfilled' && r.value.ok).length
  const failed = results.length - sent

  if (failed > 0) {
    const statuses = results
      .map(r => r.status === 'fulfilled' ? String(r.value.status) : `rejected:${String((r as PromiseRejectedResult).reason)}`)
      .filter(s => s !== '200')
    console.error(`fan-out-nearby-job: ${failed} send(s) failed for order=${order_id}: ${statuses.slice(0, 5).join(', ')}`)
  }

  console.log(
    `fan-out-nearby-job: order=${order_id} radius=${radiusMeters}m ` +
    `eligible=${washers.length} sent=${sent} failed=${failed}`
  )

  return new Response(
    JSON.stringify({ notified: sent, total: washers.length, order_id, radius_m: radiusMeters }),
    { status: 200 }
  )
})
