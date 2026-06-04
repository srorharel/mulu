import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── fan-out-legal-update ──────────────────────────────────────────────────────
//
// Mirrors fan-out-nearby-job / send-broadcast:
//   1. Auth via TRIGGER_SECRET (timing-safe)
//   2. Parse { doc_type, version } posted by the trg_notify_on_legal_publish trigger
//   3. legal_update_audience(doc_type) → user_ids (role-based + opt-in pre-filter)
//   4. Promise.allSettled in chunks → POST send-notification per user with
//      event_type='legal_update'. send-notification re-checks notification
//      preferences (enabled) and writes one notification_log row per user.

const CHUNK = 200 // send-notification calls per batch

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

  let doc_type: string
  let version: number | string | undefined
  try {
    const body = await req.json()
    doc_type = body.doc_type
    version  = body.version
  } catch {
    return new Response('Bad request', { status: 400 })
  }
  if (!doc_type) return new Response('Missing doc_type', { status: 400 })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabase    = createClient(supabaseUrl, triggerSecret)

  // ── 1. Resolve audience (role-based + opt-in) ─────────────────────────────
  const { data: rows, error } = await supabase.rpc('legal_update_audience', { p_doc_type: doc_type })
  if (error) {
    console.error('fan-out-legal-update: audience query failed:', error.message)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
  // setof uuid → array of scalars, or [{ legal_update_audience: uuid }] (mirror send-broadcast)
  const userIds: string[] = (rows ?? []).map((r: string | { legal_update_audience: string }) =>
    typeof r === 'string' ? r : r.legal_update_audience
  )

  if (userIds.length === 0) {
    return new Response(JSON.stringify({ notified: 0, total: 0, doc_type, version }), { status: 200 })
  }

  // ── 2. Fan out to send-notification (chunked) ─────────────────────────────
  const sendUrl = `${supabaseUrl}/functions/v1/send-notification`
  let sent = 0, failed = 0

  for (let i = 0; i < userIds.length; i += CHUNK) {
    const batch = userIds.slice(i, i + CHUNK)
    const results = await Promise.allSettled(
      batch.map((user_id) =>
        fetch(sendUrl, {
          method:  'POST',
          headers: {
            'Authorization': `Bearer ${triggerSecret}`,
            'Content-Type':  'application/json',
          },
          body: JSON.stringify({
            user_id,
            event_type: 'legal_update',
            data: { doc_type, version: String(version ?? '') },
          }),
        })
      )
    )
    for (const r of results) {
      if (r.status === 'fulfilled' && (r.value as Response).ok) sent += 1
      else failed += 1
    }
  }

  console.log(
    `fan-out-legal-update: doc_type=${doc_type} version=${version} ` +
    `total=${userIds.length} sent=${sent} failed=${failed}`
  )

  return new Response(
    JSON.stringify({ sent, failed, total: userIds.length, doc_type, version }),
    { status: 200 }
  )
})
