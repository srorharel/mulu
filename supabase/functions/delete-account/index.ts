// supabase/functions/delete-account/index.ts
//
// In-app account deletion for the CALLER (consumer or washer only). Authenticates
// the caller's JWT, then uses the service role to:
//   1. purge per-user storage (washer-verification/{uid}, car-photos/{uid},
//      job-evidence for the caller's own orders),
//   2. ANONYMIZE the caller's orders — null the PII columns (car_*, photo paths,
//      access notes, submitted coords) while PRESERVING financial/audit columns
//      (base_price, platform_fee, total_price, payout_amount, status, timestamps)
//      and order_events,
//   3. delete the caller's child rows (messages, support, ratings, vehicles,
//      verifications, tokens, prefs, logs, legal acks),
//   4. delete the profiles row — orders.consumer_id / washer_id and
//      order_events.actor_id become NULL via ON DELETE SET NULL (migration 0109),
//   5. delete the auth user (revokes sessions).
//
// RETAINED (deliberately, for legal/financial retention ~7 yrs): the order rows
// with their prices/payout/status/timestamps and the order_events audit trail —
// stripped of any link to the deleted user and of consumer PII.
//
// Edge Function secrets required: SUPABASE_SERVICE_ROLE_KEY (same one
// admin-user-mgmt uses). SUPABASE_URL / SUPABASE_ANON_KEY are auto-injected.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL         = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY    = Deno.env.get('SUPABASE_ANON_KEY')!

const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }
}
function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } })
}

async function authenticateUser(req: Request): Promise<{ userId: string } | Response> {
  const auth = req.headers.get('authorization') ?? ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  if (!m) return json({ error: 'auth_required' }, 401)
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${m[1]}` } },
  })
  const { data: u, error } = await userClient.auth.getUser()
  if (error || !u?.user) return json({ error: 'invalid_jwt' }, 401)
  return { userId: u.user.id }
}

// Recursively delete every object under a storage prefix. Supabase storage
// returns folders with id === null; files have a non-null id.
async function removePrefix(bucket: string, prefix: string): Promise<number> {
  const { data: entries, error } = await svc.storage.from(bucket).list(prefix, { limit: 1000 })
  if (error || !entries) return 0
  const files: string[] = []
  let removed = 0
  for (const e of entries) {
    const path = prefix ? `${prefix}/${e.name}` : e.name
    if ((e as { id: string | null }).id === null) {
      removed += await removePrefix(bucket, path) // recurse into sub-folder
    } else {
      files.push(path)
    }
  }
  if (files.length) {
    await svc.storage.from(bucket).remove(files)
    removed += files.length
  }
  return removed
}

// Columns nulled on the caller's orders. Consumer PII only — financial/status/
// timestamp columns are intentionally absent so they survive.
const ORDER_PII_NULLS = {
  car_make: null, car_model: null, car_year: null, car_color: null, car_plate: null,
  car_photo_1_path: null, car_photo_2_path: null,
  car_photo_front: null, car_photo_back: null, car_photo_driver: null, car_photo_passenger: null,
  arrival_photo_front: null, arrival_photo_back: null, arrival_photo_driver: null, arrival_photo_passenger: null,
  completion_photo_front: null, completion_photo_back: null, completion_photo_driver: null, completion_photo_passenger: null,
  evidence_before_path: null, evidence_after_path: null,
  evidence_wash_path: null, evidence_wiper_fluid_path: null, evidence_tire_pressure_path: null,
  access_notes: null,
  submitted_lat: null, submitted_lng: null, submitted_location_at: null,
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() })
  if (req.method !== 'POST')   return json({ error: 'method_not_allowed' }, 405)

  const authResult = await authenticateUser(req)
  if (authResult instanceof Response) return authResult
  const { userId } = authResult

  // Only consumers/washers self-delete here. Staff (agent/super_admin) are
  // referenced by NO-ACTION audit FKs and must not be deleted via this path.
  const { data: prof } = await svc.from('profiles').select('role').eq('id', userId).single()
  if (!prof) return json({ error: 'profile_not_found' }, 404)
  if (prof.role !== 'consumer' && prof.role !== 'washer') {
    return json({ error: 'unsupported_role', detail: prof.role }, 403)
  }

  // 1. The caller's consumer-side orders (for storage purge + anonymization).
  const { data: consumerOrders } = await svc.from('orders').select('id').eq('consumer_id', userId)
  const orderIds = (consumerOrders ?? []).map((o: { id: string }) => o.id)

  // 2. Storage purge.
  await removePrefix('washer-verification', userId)
  await removePrefix('car-photos', userId)
  for (const oid of orderIds) {
    await removePrefix('job-evidence', oid) // evidence for the caller's own orders
  }

  // 3. Anonymize the caller's orders (preserve financial/audit columns).
  if (orderIds.length) {
    await svc.from('orders').update(ORDER_PII_NULLS).eq('consumer_id', userId)
  }

  // 3b. Anonymize receipts the same way (0113): keep the financial record
  //     (number, amounts, business snapshot) but strip the consumer snapshot.
  //     consumer_id itself goes NULL via ON DELETE SET NULL at step 5.
  await svc.from('receipts')
    .update({ consumer_name: null, consumer_email: null })
    .eq('consumer_id', userId)

  // 4. Delete child rows. order_messages / support_messages / support_conversations
  //    have RESTRICT/NO-ACTION FKs that would otherwise block the profile delete;
  //    the rest CASCADE but are removed explicitly for completeness.
  await svc.from('order_messages').delete().eq('sender_id', userId)
  await svc.from('support_messages').delete().eq('sender_id', userId)
  await svc.from('support_conversations').delete().eq('opener_id', userId)
  await svc.from('washer_ratings').delete().eq('consumer_id', userId)
  await svc.from('vehicles').delete().eq('consumer_id', userId)
  await svc.from('washer_verifications').delete().eq('washer_id', userId)
  await svc.from('user_legal_acknowledgments').delete().eq('user_id', userId)
  await svc.from('device_tokens').delete().eq('user_id', userId)
  await svc.from('notification_preferences').delete().eq('user_id', userId)
  await svc.from('notification_log').delete().eq('user_id', userId)
  await svc.from('content_reports').delete().eq('reporter_id', userId)
  await svc.from('content_blocks').delete().eq('blocker_id', userId)

  // 5. Delete the profile (SET NULL nulls orders/order_events references; CASCADE
  //    clears any remaining child rows).
  const { error: pErr } = await svc.from('profiles').delete().eq('id', userId)
  if (pErr) return json({ error: 'profile_delete_failed', detail: pErr.message }, 500)

  // 6. Delete the auth user (revokes all sessions).
  const { error: aErr } = await svc.auth.admin.deleteUser(userId)
  if (aErr) return json({ error: 'auth_delete_failed', detail: aErr.message }, 500)

  return json({
    ok: true,
    deleted: userId,
    anonymized_orders: orderIds.length,
    retained: 'order rows (prices, payout, status, timestamps) + order_events audit trail, with user link + consumer PII removed',
  })
})
