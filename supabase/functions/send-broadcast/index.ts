import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── send-broadcast ────────────────────────────────────────────────────────────
//
// Mirrors fan-out-nearby-job:
//   1. Auth via TRIGGER_SECRET
//   2. Load broadcast row; reject if already sent (idempotency)
//   3. Rate-limit: reject if another broadcast was sent in the last 10 min
//   4. resolve_broadcast_segment(id) → user_ids
//   5. Promise.allSettled → POST send-notification per user with
//      event_type='admin_broadcast' and title/body/route in data
//   6. Update sent_count / failed_count / sent_at on the broadcast row

const RATE_LIMIT_MS = 10 * 60 * 1000 // 10 min between broadcasts

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const aBytes = enc.encode(a)
  const bBytes = enc.encode(b)
  if (aBytes.length !== bBytes.length) return false
  let diff = 0
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i]
  return diff === 0
}

Deno.serve(async (req) => {
  const triggerSecret = Deno.env.get('TRIGGER_SECRET') ?? ''
  const authHeader    = req.headers.get('Authorization') ?? ''
  const bearerToken   = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

  if (!timingSafeEqual(bearerToken, triggerSecret)) {
    return new Response('Unauthorized', { status: 401 })
  }

  let broadcast_id: string
  try {
    const body = await req.json()
    broadcast_id = body.broadcast_id
  } catch {
    return new Response('Bad request', { status: 400 })
  }
  if (!broadcast_id) return new Response('Missing broadcast_id', { status: 400 })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabase    = createClient(supabaseUrl, triggerSecret)

  // ── 1. Load broadcast row ────────────────────────────────────────────────
  const { data: broadcast, error: loadErr } = await supabase
    .from('broadcast_notifications')
    .select('id, title_en, title_he, body_en, body_he, deep_link_route, sent_at')
    .eq('id', broadcast_id)
    .single()
  if (loadErr || !broadcast) {
    return new Response(JSON.stringify({ error: 'broadcast not found' }), { status: 404 })
  }
  if (broadcast.sent_at) {
    return new Response(JSON.stringify({ error: 'already_sent' }), { status: 409 })
  }

  // ── 2. Rate-limit ────────────────────────────────────────────────────────
  const tenMinAgo = new Date(Date.now() - RATE_LIMIT_MS).toISOString()
  const { data: recent } = await supabase
    .from('broadcast_notifications')
    .select('id, sent_at')
    .gte('sent_at', tenMinAgo)
    .limit(1)
  if (recent && recent.length > 0) {
    return new Response(
      JSON.stringify({ error: 'rate_limited', message: 'A broadcast was sent in the last 10 minutes.' }),
      { status: 429 }
    )
  }

  // ── 3. Resolve segment → user_ids ────────────────────────────────────────
  const { data: segmentRows, error: segErr } = await supabase
    .rpc('resolve_broadcast_segment', { p_broadcast_id: broadcast_id })
  if (segErr) {
    return new Response(JSON.stringify({ error: segErr.message }), { status: 500 })
  }
  const userIds: string[] = (segmentRows ?? []).map((r: string | { resolve_broadcast_segment: string }) =>
    typeof r === 'string' ? r : r.resolve_broadcast_segment
  )

  if (userIds.length === 0) {
    await supabase
      .from('broadcast_notifications')
      .update({ sent_at: new Date().toISOString(), sent_count: 0, failed_count: 0 })
      .eq('id', broadcast_id)
    return new Response(JSON.stringify({ sent: 0, total: 0 }), { status: 200 })
  }

  // ── 4. Fan out to send-notification ──────────────────────────────────────
  const sendUrl = `${supabaseUrl}/functions/v1/send-notification`
  const route   = broadcast.deep_link_route || '/home'

  const results = await Promise.allSettled(
    userIds.map((user_id: string) =>
      fetch(sendUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${triggerSecret}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          user_id,
          event_type: 'admin_broadcast',
          data: {
            broadcast_id,
            route,
            title_en: broadcast.title_en,
            title_he: broadcast.title_he,
            body_en:  broadcast.body_en,
            body_he:  broadcast.body_he,
          },
        }),
      })
    )
  )

  let sent = 0, failed = 0
  for (const r of results) {
    if (r.status === 'fulfilled' && (r.value as Response).ok) sent += 1
    else failed += 1
  }

  // ── 5. Update broadcast row ─────────────────────────────────────────────
  await supabase
    .from('broadcast_notifications')
    .update({
      sent_at: new Date().toISOString(),
      sent_count: sent,
      failed_count: failed,
    })
    .eq('id', broadcast_id)

  console.log(
    `send-broadcast: id=${broadcast_id} target=${userIds.length} sent=${sent} failed=${failed}`
  )

  return new Response(
    JSON.stringify({ sent, failed, total: userIds.length, broadcast_id }),
    { status: 200 }
  )
})
