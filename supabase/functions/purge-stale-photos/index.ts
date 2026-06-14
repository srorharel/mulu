// Edge Function: purge-stale-photos
//
// Deletes car photos (consumer 4-angle + washer arrival/completion evidence) from
// Supabase Storage 90 days after an order is marked 'completed', UNLESS the order
// is still under an open dispute. Implements Privacy Policy §8.2 / Amendment 13.
//
// Invoked daily by pg_cron → public.purge_stale_photos_tick() → net.http_post
// (migration 0115). Can also be run manually from the Supabase dashboard.
//
// The dispute-aware candidate list comes from the SECURITY DEFINER RPC
// public.list_purgeable_photos(); this function only performs the Storage
// deletion (which raw SQL can't do reliably) and records the result via
// public.mark_order_photos_purged().
//
// Auth: timing-safe Bearer check against TRIGGER_SECRET (= service_role_key),
// matching fan-out-legal-update / send-receipt.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const REMOVE_CHUNK = 100 // max object paths per storage.remove() call

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const aB = enc.encode(a)
  const bB = enc.encode(b)
  if (aB.length !== bB.length) return false
  let diff = 0
  for (let i = 0; i < aB.length; i++) diff |= aB[i] ^ bB[i]
  return diff === 0
}

interface PurgeRow { order_id: string; bucket: string; path: string }

Deno.serve(async (req) => {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const triggerSecret = Deno.env.get('TRIGGER_SECRET') ?? ''
  const authHeader    = req.headers.get('Authorization') ?? ''
  const bearer        = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!triggerSecret || !timingSafeEqual(bearer, triggerSecret)) {
    return new Response('Unauthorized', { status: 401 })
  }

  // ── Params ──────────────────────────────────────────────────────────────────
  let retentionDays = 90
  try {
    const body = await req.json()
    if (typeof body?.retention_days === 'number' && body.retention_days > 0) {
      retentionDays = Math.floor(body.retention_days)
    }
  } catch { /* empty body → default 90 */ }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabase    = createClient(supabaseUrl, triggerSecret)

  // ── Candidate objects (dispute-aware) ────────────────────────────────────────
  const { data: rows, error } = await supabase.rpc('list_purgeable_photos', {
    p_retention_days: retentionDays,
  })
  if (error) {
    console.error('list_purgeable_photos failed:', error.message)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  const candidates = (rows ?? []) as PurgeRow[]
  if (candidates.length === 0) {
    return new Response(JSON.stringify({ orders: 0, objects: 0, deleted: 0, message: 'nothing to purge' }), { status: 200 })
  }

  // Group object paths per order so we only mark an order purged once ALL of its
  // objects were removed without error (a failed remove leaves the order for the
  // next run rather than orphaning files behind a nulled path column).
  const perOrder = new Map<string, { 'car-photos': string[]; 'job-evidence': string[] }>()
  for (const r of candidates) {
    if (r.bucket !== 'car-photos' && r.bucket !== 'job-evidence') continue
    let entry = perOrder.get(r.order_id)
    if (!entry) { entry = { 'car-photos': [], 'job-evidence': [] }; perOrder.set(r.order_id, entry) }
    entry[r.bucket].push(r.path)
  }

  const purgedOrderIds: string[] = []
  let deletedObjects = 0
  let failedOrders   = 0

  for (const [orderId, buckets] of perOrder) {
    let orderOk = true
    for (const bucket of ['car-photos', 'job-evidence'] as const) {
      const paths = buckets[bucket]
      for (let i = 0; i < paths.length; i += REMOVE_CHUNK) {
        const chunk = paths.slice(i, i + REMOVE_CHUNK)
        const { error: rmErr } = await supabase.storage.from(bucket).remove(chunk)
        if (rmErr) {
          console.error(`remove failed (order ${orderId}, bucket ${bucket}):`, rmErr.message)
          orderOk = false
        } else {
          deletedObjects += chunk.length
        }
      }
    }
    if (orderOk) purgedOrderIds.push(orderId)
    else failedOrders += 1
  }

  // ── Record the purge (null path columns + stamp photos_purged_at) ─────────────
  if (purgedOrderIds.length > 0) {
    const { error: markErr } = await supabase.rpc('mark_order_photos_purged', {
      p_order_ids: purgedOrderIds,
    })
    if (markErr) {
      console.error('mark_order_photos_purged failed:', markErr.message)
      return new Response(JSON.stringify({ error: markErr.message, deletedObjects }), { status: 500 })
    }
  }

  return new Response(JSON.stringify({
    orders:         perOrder.size,
    purgedOrders:   purgedOrderIds.length,
    failedOrders,
    deletedObjects,
    retentionDays,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })
})
