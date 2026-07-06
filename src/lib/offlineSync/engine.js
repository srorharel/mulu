// Underground offline-capture replay engine (ADR-035).
//
// Engaged ONLY for orders with is_underground_parking === true. The washer
// captures 4 arrival + 4 completion photos with no network (blobs land in
// IndexedDB via db.js), the UI advances optimistically, and this engine replays
// the queued captures to the server when connectivity returns (and on app init,
// in case the app was killed underground).
//
// Replay is RESUMABLE + IDEMPOTENT: before each step it re-reads the live order
// status and skips anything the server already applied; storage uploads are
// upserts to deterministic paths; a capture's blobs are cleared only after the
// server confirms the transition. Nothing here writes to the server outside
// replay, so a failed optimistic step never silently diverges from the server.

import {
  putCapture, getCapture, getAllCaptures, deleteCapture, setCaptureStatus,
} from './db.js'

export const PHOTO_SLOTS = ['front', 'back', 'driver', 'passenger']
const TYPE_ORDER  = { arrival: 0, completion: 1 }
const REPLAYABLE  = new Set(['queued', 'syncing', 'error'])

const captureId = (orderId, type) => `${orderId}:${type}`

// ── Capture (called by the washer UI while capturing) ───────────────────────

// Persist one angle's blob into the (draft) capture for this order+type. The
// record is created on first angle. `now` is passed in so callers control the
// timestamp (and tests stay deterministic).
export async function putDraftAngle(orderId, type, slot, blob, now) {
  const id  = captureId(orderId, type)
  const rec = (await getCapture(id)) || { id, orderId, type, angles: {}, capturedAt: now, status: 'draft' }
  rec.angles    = { ...rec.angles, [slot]: blob }
  rec.status    = 'draft'
  rec.capturedAt = now
  await putCapture(rec)
  return rec
}

// Mark a fully-captured set ready for replay. Throws if any of the 4 angles is
// missing — the UI must not let the washer advance before all 4 are captured.
export async function commitCapture(orderId, type, now) {
  const id  = captureId(orderId, type)
  const rec = await getCapture(id)
  if (!rec) throw new Error('No capture to commit')
  const missing = PHOTO_SLOTS.filter(s => !rec.angles?.[s])
  if (missing.length) throw new Error(`Missing photos: ${missing.join(', ')}`)
  rec.status     = 'queued'
  rec.capturedAt = now
  await putCapture(rec)
  return rec
}

export async function getCapturesByOrder(orderId) {
  const all = await getAllCaptures()
  return all.filter(r => r.orderId === orderId)
}

// Purge every capture (and its photo blobs) for an order. Called when the
// washer releases the job — the server clears arrival photos on release, so a
// queued capture is obsolete, and the customer's car/plate blobs must not
// linger on the device (same legal constraint that mandates InAppCamera).
export async function deleteCapturesByOrder(orderId) {
  const recs = await getCapturesByOrder(orderId)
  await Promise.all(recs.map(r => deleteCapture(r.id)))
}

// ── Replay (called by the sync engine on reconnect / app init) ──────────────

// maybeSingle: an order hidden by RLS (another washer accepted it after a
// release) yields data:null WITHOUT an error — .single() would throw here and
// wedge the capture in 'error' state forever.
async function fetchOrderStatus(supabase, orderId) {
  const { data, error } = await supabase
    .from('orders').select('status').eq('id', orderId).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? data.status : null
}

async function uploadAngles(supabase, orderId, type, angles) {
  for (const slot of PHOTO_SLOTS) {
    const blob = angles ? angles[slot] : null
    if (!blob) continue // tolerate partial — commit guarantees all 4, re-upload is idempotent
    const path = `${orderId}/${type}/${slot}.jpg`
    const { error: upErr } = await supabase.storage
      .from('job-evidence')
      .upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
    if (upErr) throw new Error(upErr.message)
    const { error: colErr } = await supabase
      .from('orders').update({ [`${type}_photo_${slot}`]: path }).eq('id', orderId)
    if (colErr) throw new Error(colErr.message)
  }
}

async function transitionTo(supabase, orderId, newStatus) {
  const { error } = await supabase.rpc('transition_order_status', {
    order_id: orderId, new_status: newStatus, washer_lat: null, washer_lng: null,
  })
  if (error) throw new Error(error.message)
}

// Replay a single capture. Returns 'done' (server confirmed → safe to clear),
// 'skip' (not applicable yet — leave queued), or throws on a transient error.
export async function replayCapture(supabase, record) {
  const { orderId, type, angles } = record
  const status = await fetchOrderStatus(supabase, orderId)
  // null = the order is no longer visible to this washer (deleted, or released
  // and re-accepted by someone else — RLS hides it). The capture can never
  // apply; keeping it would retain customer photo blobs on the device forever.
  if (status === null) return 'done'
  // Order already resolved elsewhere (agent/consumer/admin) → drop the queue.
  if (status === 'cancelled' || status === 'completed') return 'done'
  // Released back to the pool: the server cleared arrival photos on release,
  // so this washer's queued captures are obsolete → drop them.
  if (status === 'pending') return 'done'

  if (type === 'arrival') {
    // Already at/past arrived → the arrival transition was applied; clear blobs.
    if (status === 'arrived' || status === 'in_progress' || status === 'pending_approval') return 'done'
    if (status !== 'en_route') return 'skip' // not ready (still accepted)
    await uploadAngles(supabase, orderId, 'arrival', angles)
    await transitionTo(supabase, orderId, 'arrived')
    return 'done'
  }

  if (type === 'completion') {
    if (status === 'pending_approval') return 'done'
    let cur = status
    // The arrived→in_progress hop has no photos; fold it into completion replay.
    if (cur === 'arrived') { await transitionTo(supabase, orderId, 'in_progress'); cur = 'in_progress' }
    if (cur !== 'in_progress') return 'skip' // arrival not applied yet — retry later
    await uploadAngles(supabase, orderId, 'completion', angles)
    await transitionTo(supabase, orderId, 'pending_approval')
    return 'done'
  }

  return 'skip'
}

// Coalesce concurrent replay calls (the dashboard + the active-job panel may
// both trigger one). A single in-flight pass is shared by all callers.
let replayLock = null

export function replayAll(supabase) {
  if (replayLock) return replayLock
  replayLock = _replayAll(supabase).finally(() => { replayLock = null })
  return replayLock
}

async function _replayAll(supabase) {
  const all        = await getAllCaptures()
  const replayable = all.filter(r => REPLAYABLE.has(r.status))

  // Group by order; within an order replay arrival before completion (completion
  // depends on the order having reached at least 'arrived').
  const byOrder = new Map()
  for (const r of replayable) {
    if (!byOrder.has(r.orderId)) byOrder.set(r.orderId, [])
    byOrder.get(r.orderId).push(r)
  }

  const results = []
  for (const recs of byOrder.values()) {
    recs.sort((a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9))
    for (const rec of recs) {
      try {
        await setCaptureStatus(rec.id, 'syncing')
        const outcome = await replayCapture(supabase, rec)
        if (outcome === 'done') {
          await deleteCapture(rec.id) // clears blobs only after server confirmed
          results.push({ id: rec.id, outcome })
        } else {
          await setCaptureStatus(rec.id, 'queued')
          results.push({ id: rec.id, outcome })
          break // 'skip' on the earlier task means later tasks can't apply yet
        }
      } catch (e) {
        await setCaptureStatus(rec.id, 'error')
        results.push({ id: rec.id, outcome: 'error', error: e.message })
        break // stop this order's chain; a later trigger retries from here
      }
    }
  }
  return results
}
