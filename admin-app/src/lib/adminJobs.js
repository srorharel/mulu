// admin-app/src/lib/adminJobs.js
//
// RPC wrappers + selectors for the P6 Live Jobs admin tab. Every write is
// audit-logged server-side by the RPC; the client never calls these without
// passing a reason where the function requires one. Signed URL fetches use
// short TTLs (600 s) consistent with the rest of the app.

import { supabase } from './supabase.js'

// ── Read selectors ─────────────────────────────────────────────────────────

export const JOB_SELECT = `
  id, status, created_at, accepted_at, completed_at, approved_at, cancelled_by,
  consumer_id, washer_id, created_by_admin,
  car_type, service_type, address_label,
  base_price, platform_fee, total_price, payout_amount,
  car_plate, car_make, car_model, car_color, car_year,
  site_has_water, site_has_power, access_notes,
  decline_count, decline_reason, declined_by, declined_at,
  car_photo_front, car_photo_back, car_photo_driver, car_photo_passenger,
  arrival_photo_front, arrival_photo_back, arrival_photo_driver, arrival_photo_passenger,
  completion_photo_front, completion_photo_back, completion_photo_driver, completion_photo_passenger,
  submitted_lat, submitted_lng, submitted_location_at,
  location
`.trim()

// The list resolves the consumer + washer display names in the same round-trip
// — the bare consumer_id / washer_id UUIDs are useless in a scannable list.
// (Detail view keeps the lean JOB_SELECT and fetches full party profiles via
// fetchProfileBrief, so this embed is intentionally list-only.)
export const JOB_LIST_SELECT = `
  ${JOB_SELECT},
  consumer:consumer_id ( full_name, phone ),
  washer:washer_id ( full_name )
`.trim()

export async function fetchJobs({ status, limit = 200 } = {}) {
  let q = supabase
    .from('orders')
    .select(JOB_LIST_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (status && status !== 'all') q = q.eq('status', status)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function fetchJobDetail(orderId) {
  const { data, error } = await supabase
    .from('orders')
    .select(JOB_SELECT)
    .eq('id', orderId)
    .single()
  if (error) throw error
  return data
}

export async function fetchProfileBrief(userId) {
  if (!userId) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, phone, role, current_tier, current_rating, washer_verification_status, is_online, current_location, last_lat, last_lng, last_location_at')
    .eq('id', userId)
    .single()
  if (error) return null
  return data
}

export async function fetchOrderEvents(orderId) {
  const { data, error } = await supabase
    .from('order_events')
    .select('id, from_status, to_status, actor_id, created_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function fetchOrderMessages(orderId) {
  const { data, error } = await supabase
    .from('order_messages')
    .select('id, sender_id, sender_role, body, created_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })
  if (error) return []
  return data ?? []
}

export async function fetchAdminAudit(orderId) {
  const { data, error } = await supabase
    .from('admin_order_audit')
    .select('id, action, reason, payload, created_at, admin_id, admin:admin_id(full_name)')
    .eq('order_id', orderId)
    .order('created_at', { ascending: false })
  if (error) return []
  return data ?? []
}

// ── Consumer picker — paginated search across consumers for "Create order" ─

export async function searchConsumers(query, limit = 25) {
  let q = supabase
    .from('profiles')
    .select('id, full_name, phone')
    .eq('role', 'consumer')
    .order('full_name', { ascending: true })
    .limit(limit)
  if (query && query.trim()) {
    const s = query.trim()
    // ilike on either column; phone search wants no spaces.
    q = q.or(`full_name.ilike.%${s}%,phone.ilike.%${s.replace(/\s+/g, '')}%`)
  }
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function fetchAvailableWashers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, phone, current_tier, current_rating, washer_verification_status, is_online')
    .eq('role', 'washer')
    .eq('washer_verification_status', 'approved')
    .order('current_tier', { ascending: false, nullsFirst: false })
    .limit(200)
  if (error) throw error
  return data ?? []
}

// ── Storage helpers ────────────────────────────────────────────────────────

export async function signedUrlFor(bucket, path, ttl = 600) {
  if (!path) return null
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, ttl)
  if (error) return null
  return data?.signedUrl ?? null
}

export async function uploadReplacement({ bucket, path, file }) {
  // Upsert: storage delete is not required; upload with `upsert: true` replaces
  // the object at the same path. Keeps the orders.* column path stable so no
  // DB update is needed unless the path itself changes.
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '0',
    upsert: true,
    contentType: file.type || 'image/jpeg',
  })
  if (error) throw error
  return path
}

export async function logPhotoReplacement({ orderId, field, newPath, reason }) {
  const { error } = await supabase.rpc('admin_log_photo_replacement', {
    p_order_id: orderId,
    p_field:    field,
    p_new_path: newPath,
    p_reason:   reason || null,
  })
  if (error) throw error
}

// ── RPCs ──────────────────────────────────────────────────────────────────

export async function adminTransitionStatus({ orderId, newStatus, washerLat = null, washerLng = null }) {
  const { error } = await supabase.rpc('transition_order_status', {
    order_id:         orderId,
    new_status:       newStatus,
    washer_lat:       washerLat,
    washer_lng:       washerLng,
    p_admin_override: true,
  })
  if (error) throw error
}

// Force an order to ANY status (forward, backward, or skipping). Reason is
// mandatory — enforced here client-side AND again server-side by the RPC.
// Writes a single admin_order_audit row (action='force_stage', reason in the
// reason column + payload) via the GUC-tagged transition_order_status path.
export async function forceOrderStage(orderId, toStatus, reason) {
  const clean = (reason ?? '').trim()
  if (!clean) throw new Error('reason_required')
  const { error } = await supabase.rpc('admin_force_order_stage', {
    p_order_id:  orderId,
    p_to_status: toStatus,
    p_reason:    clean,
  })
  if (error) throw error
}

export async function adminReassignWasher({ orderId, newWasherId, reason }) {
  const { error } = await supabase.rpc('admin_reassign_washer', {
    p_order_id:      orderId,
    p_new_washer_id: newWasherId,
    p_reason:        reason,
  })
  if (error) throw error
}

export async function adminOverridePrice({ orderId, newConsumerPrice, newPayout, reason }) {
  const { error } = await supabase.rpc('admin_override_order_price', {
    p_order_id:           orderId,
    p_new_consumer_price: newConsumerPrice,
    p_new_payout:         newPayout,
    p_reason:             reason,
  })
  if (error) throw error
}

export async function adminCreateOrderForConsumer(payload) {
  const { data, error } = await supabase.rpc('admin_create_order_for_consumer', {
    p_consumer_id:  payload.consumerId,
    p_lat:          payload.lat,
    p_lng:          payload.lng,
    p_category:     payload.category,
    p_car_details:  payload.carDetails  ?? {},
    p_site_flags:   payload.siteFlags   ?? {},
    p_access_notes: payload.accessNotes ?? null,
    p_skip_payment: !!payload.skipPayment,
  })
  if (error) throw error
  return data
}

// ── Display helpers ────────────────────────────────────────────────────────

export const STATUSES = [
  'all','pending','accepted','en_route','arrived','in_progress','pending_approval','completed','cancelled',
]

// ── Force-stage stage model + side-effect warnings ──────────────────────────
// The linear lifecycle. `cancelled` is OFF-sequence (a terminal divergence), so
// it is not part of forward/backward distance math.
export const STAGE_SEQUENCE = [
  'pending','accepted','en_route','arrived','in_progress','pending_approval','completed',
]
// What the Force-stage picker offers — every concrete status (8).
export const FORCE_STAGES = [...STAGE_SEQUENCE, 'cancelled']

export function isBackwardForce(current, target) {
  const c = STAGE_SEQUENCE.indexOf(current)
  const t = STAGE_SEQUENCE.indexOf(target)
  return c >= 0 && t >= 0 && t < c
}

export function isForwardSkip(current, target) {
  const c = STAGE_SEQUENCE.indexOf(current)
  const t = STAGE_SEQUENCE.indexOf(target)
  return c >= 0 && t >= 0 && t > c + 1
}

// Returns the contextual consequences of a forced move as [{ tone, text }].
// tone: 'warn' (amber, irreversible side-effect) | 'note' (informational).
export function forceStageWarnings(current, target) {
  if (!target || target === current) return []
  const out = []
  const c = STAGE_SEQUENCE.indexOf(current)
  const acceptedIdx = STAGE_SEQUENCE.indexOf('accepted')
  const backward = isBackwardForce(current, target)

  if (current === 'completed' && target !== 'completed') {
    out.push({ tone: 'warn', text: 'This order was completed. Payout may already be recorded and a rating may have been requested. Forcing it back does NOT reverse payout or un-send notifications already delivered.' })
  }
  if (current === 'pending_approval' && backward) {
    out.push({ tone: 'warn', text: 'Submitted photos remain; the approval state will reset.' })
  }
  if (target === 'pending' && c >= acceptedIdx && current !== 'pending') {
    out.push({ tone: 'warn', text: 'This may orphan the assigned washer. The washer is NOT automatically unassigned or re-notified.' })
  }
  if (backward && out.length === 0) {
    out.push({ tone: 'warn', text: 'Forcing to an earlier stage does not undo side-effects (notifications, payouts, photos) already produced by later stages.' })
  }
  if (isForwardSkip(current, target)) {
    out.push({ tone: 'note', text: "Skipping intermediate stages — intermediate events won't be recorded." })
  }
  if (target === 'cancelled') {
    out.push({ tone: 'note', text: 'Cancels the order (admin override); cancelled_by is recorded as agent. Already-delivered notifications are not recalled.' })
  }
  if (current === 'cancelled' && STAGE_SEQUENCE.includes(target)) {
    out.push({ tone: 'warn', text: 'This order was cancelled. Forcing it active again does not re-notify the consumer or washer, or restore prior state.' })
  }
  return out
}

export function statusColor(s) {
  switch (s) {
    case 'pending':          return 'bg-warning/10 text-warning border-warning/30'
    case 'accepted':         return 'bg-admin-soft text-admin-deep border-admin/30'
    case 'en_route':         return 'bg-admin-soft text-admin-deep border-admin/30'
    case 'arrived':          return 'bg-admin-soft text-admin-deep border-admin/30'
    case 'in_progress':      return 'bg-admin-soft text-admin-deep border-admin/30'
    case 'pending_approval': return 'bg-warning/10 text-warning border-warning/30'
    case 'completed':        return 'bg-success/10 text-success border-success/30'
    case 'cancelled':        return 'bg-danger/10  text-danger  border-danger/30'
    default:                  return 'bg-surface text-ink-muted border-edge'
  }
}

export const PHOTO_FIELDS = {
  car: ['car_photo_front','car_photo_back','car_photo_driver','car_photo_passenger'],
  arrival: ['arrival_photo_front','arrival_photo_back','arrival_photo_driver','arrival_photo_passenger'],
  completion: ['completion_photo_front','completion_photo_back','completion_photo_driver','completion_photo_passenger'],
}

export function bucketForField(field) {
  return field.startsWith('car_photo') ? 'car-photos' : 'job-evidence'
}
