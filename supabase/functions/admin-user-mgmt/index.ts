// supabase/functions/admin-user-mgmt/index.ts
//
// Edge Function for admin user-management actions that need the service
// role key (password reset + final auth user deletion). PostgREST cannot
// invoke auth.admin.* so these can't live in a SECURITY DEFINER RPC.
//
// Auth: the caller's Supabase JWT must belong to a super_admin profile. We
// verify by exchanging the bearer token for a user, then checking
// profiles.role.
//
// Inputs (JSON):
//   { action: 'reset_password', user_id }
//   { action: 'delete_user',    user_id, force?: boolean }
//   { action: 'restore_user',   audit_id, email }   // best-effort; see ADR-028

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
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  })
}

function randomPassword(): string {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  // base64 → URL-safe-ish; trim padding. 24 chars.
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Recursively delete every object under a storage prefix. Folders come back with
// id === null; files have a non-null id. (Same helper as delete-account.)
async function removePrefix(bucket: string, prefix: string): Promise<number> {
  const { data: entries, error } = await svc.storage.from(bucket).list(prefix, { limit: 1000 })
  if (error || !entries) return 0
  const files: string[] = []
  let removed = 0
  for (const e of entries) {
    const path = prefix ? `${prefix}/${e.name}` : e.name
    if ((e as { id: string | null }).id === null) removed += await removePrefix(bucket, path)
    else files.push(path)
  }
  if (files.length) { await svc.storage.from(bucket).remove(files); removed += files.length }
  return removed
}

// Consumer PII nulled on the user's orders — financial/status/timestamp columns
// are intentionally absent so they survive (anonymize-vs-delete; ADR-038).
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

// Anonymize + purge a (consumer/washer/agent) user's data the same way the in-app
// delete-account function does, so the subsequent profiles delete doesn't trip an
// ON DELETE RESTRICT FK (support_conversations.opener_id / support_messages.sender_id
// — migrations 0012/0013) or a NO-ACTION order_messages.sender_id FK. WITHOUT this,
// deleting any user who has support-chat history fails with profile_delete_failed.
async function purgeUserData(userId: string): Promise<void> {
  // Caller's consumer-side orders (for storage purge + PII anonymization).
  const { data: consumerOrders } = await svc.from('orders').select('id').eq('consumer_id', userId)
  const orderIds = (consumerOrders ?? []).map((o: { id: string }) => o.id)

  // Storage purge (best-effort).
  await removePrefix('washer-verification', userId)
  await removePrefix('car-photos', userId)
  for (const oid of orderIds) await removePrefix('job-evidence', oid)

  // Anonymize orders + receipts (preserve financial/audit columns).
  if (orderIds.length) await svc.from('orders').update(ORDER_PII_NULLS).eq('consumer_id', userId)
  await svc.from('receipts').update({ consumer_name: null, consumer_email: null }).eq('consumer_id', userId)

  // Delete child rows. order_messages (NO ACTION) + support_messages /
  // support_conversations (RESTRICT) MUST go before the profile delete; the rest
  // CASCADE but are cleared explicitly for completeness.
  await svc.from('order_messages').delete().eq('sender_id', userId)
  await svc.from('support_messages').delete().eq('sender_id', userId)
  await svc.from('support_conversations').delete().eq('opener_id', userId)
  await svc.from('washer_ratings').delete().eq('consumer_id', userId)
  await svc.from('washer_ratings').delete().eq('washer_id', userId)
  await svc.from('vehicles').delete().eq('consumer_id', userId)
  await svc.from('washer_verifications').delete().eq('washer_id', userId)
  await svc.from('user_legal_acknowledgments').delete().eq('user_id', userId)
  await svc.from('device_tokens').delete().eq('user_id', userId)
  await svc.from('notification_preferences').delete().eq('user_id', userId)
  await svc.from('notification_log').delete().eq('user_id', userId)
  await svc.from('content_reports').delete().eq('reporter_id', userId)
  await svc.from('content_blocks').delete().eq('blocker_id', userId)
}

async function authorizeSuperAdmin(req: Request): Promise<{ adminId: string } | Response> {
  const auth = req.headers.get('authorization') ?? ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  if (!m) return json({ error: 'auth_required' }, 401)
  const jwt = m[1]

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  })
  const { data: u, error: ue } = await userClient.auth.getUser()
  if (ue || !u?.user) return json({ error: 'invalid_jwt' }, 401)

  const { data: prof, error: pe } = await svc
    .from('profiles')
    .select('id, role')
    .eq('id', u.user.id)
    .single()
  if (pe || prof?.role !== 'super_admin') return json({ error: 'super_admin_required' }, 403)

  return { adminId: u.user.id }
}

// Scalar profile columns we restore. Deliberately excludes live-location
// (last_lat/lng, current_location, is_online) and suspension columns — those
// are ephemeral/irrelevant to a restored account (ADR-028).
const RESTORABLE_PROFILE_FIELDS = [
  'full_name', 'phone', 'role', 'locale', 'display_preference',
  'current_tier', 'current_rating', 'rated_job_count',
  'agent_display_name', 'agent_is_active',
  'washer_verification_status', 'washer_dealer_number',
]

// Best-effort restore of a previously deleted user (ADR-028). HONEST about its
// limits: a fresh auth user may get a NEW id if the original can't be reused,
// and relational rows (orders, ratings, tokens, chat) that referenced the old
// id are NOT reconnected — they were never in the deletion snapshot.
async function restoreUser(
  body: { audit_id?: string; email?: string },
  adminId: string,
): Promise<Response> {
  const auditId = body.audit_id ?? ''
  if (!auditId) return json({ error: 'audit_id_required' }, 400)
  const typedEmail = (body.email ?? '').trim().toLowerCase()
  if (!typedEmail) return json({ error: 'email_required', detail: 'type the user email to confirm' }, 400)

  // 1. Load the deletion audit row + snapshot.
  const { data: audit, error: auditErr } = await svc
    .from('admin_user_audit')
    .select('id, user_id, action, before_snapshot, created_at')
    .eq('id', auditId)
    .single()
  if (auditErr || !audit) return json({ error: 'audit_not_found' }, 404)
  if (audit.action !== 'delete_user') return json({ error: 'not_a_deletion', detail: audit.action }, 400)

  const snapshot = (audit.before_snapshot ?? {}) as Record<string, unknown>
  const profileSnap = { ...snapshot }
  const authMeta = (snapshot.__auth ?? null) as { email?: string } | null
  delete (profileSnap as Record<string, unknown>).__auth
  const originalEmail = authMeta?.email ? String(authMeta.email).trim().toLowerCase() : null
  const originalId = String(profileSnap.id ?? audit.user_id ?? '')

  // If we captured the original email, the confirm must match it. Otherwise the
  // typed email IS the address the recreated login will use (we have no record
  // of the original once auth.users was deleted).
  if (originalEmail && originalEmail !== typedEmail) {
    return json({ error: 'email_mismatch', detail: `expected ${originalEmail}` }, 409)
  }
  const emailToUse = originalEmail ?? typedEmail

  // 2. Recreate the auth user. Attempt to reuse the original id; fall back to a
  //    fresh id if GoTrue rejects it.
  const password = randomPassword()
  const baseAttrs: Record<string, unknown> = {
    email: emailToUse,
    email_confirm: true,
    password,
    user_metadata: {
      role: profileSnap.role ?? 'consumer',
      full_name: profileSnap.full_name ?? null,
      phone: profileSnap.phone ?? null,
    },
  }

  let idReused = false
  // deno-lint-ignore no-explicit-any
  let created = await svc.auth.admin.createUser({ ...baseAttrs, id: originalId } as any)
  if (created.error) {
    // Retry without the id — some GoTrue versions reject a caller-supplied id.
    // deno-lint-ignore no-explicit-any
    created = await svc.auth.admin.createUser(baseAttrs as any)
  } else {
    idReused = true
  }
  if (created.error || !created.data?.user) {
    return json({ error: 'auth_create_failed', detail: created.error?.message ?? 'unknown' }, 500)
  }
  const newUserId = created.data.user.id

  // 3. Upsert the profile (handle_new_user already auto-created a minimal row).
  const profileRow: Record<string, unknown> = { id: newUserId }
  for (const k of RESTORABLE_PROFILE_FIELDS) {
    if (k in profileSnap && profileSnap[k] !== undefined) profileRow[k] = profileSnap[k]
  }
  const { error: upErr } = await svc.from('profiles').upsert(profileRow, { onConflict: 'id' })
  const profileRestored = !upErr

  // 4. Audit the restore.
  await svc.from('admin_user_audit').insert({
    user_id: newUserId,
    admin_id: adminId,
    action: 'restore_user',
    reason: `best-effort restore of ${emailToUse}${idReused ? ' (original id reused)' : ' (NEW id)'}`,
    before_snapshot: { source_audit_id: auditId, original_user_id: originalId, id_reused: idReused },
    after_snapshot: profileRow,
  })

  // 5. Honest report.
  return json({
    ok: true,
    restored: {
      auth_user: true,
      id_reused: idReused,
      new_user_id: newUserId,
      original_user_id: originalId,
      email: emailToUse,
      original_email_known: !!originalEmail,
      profile: profileRestored,
      temporary_password: password,
    },
    not_reconnected: [
      'orders', 'washer_ratings', 'vehicles', 'device_tokens',
      'order_messages', 'support_messages', 'support_conversations', 'notification_log',
    ],
    warnings: [
      idReused
        ? 'Original id reused — but rows referencing it were deleted/cascaded and are NOT restored.'
        : 'A NEW user id was assigned. All rows that referenced the old id remain orphaned.',
      profileRestored ? null : `Profile upsert failed: ${upErr?.message}`,
    ].filter(Boolean),
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() })
  if (req.method !== 'POST')   return json({ error: 'method_not_allowed' }, 405)

  const authResult = await authorizeSuperAdmin(req)
  if (authResult instanceof Response) return authResult
  const { adminId } = authResult

  let body: { action?: string; user_id?: string; force?: boolean; audit_id?: string; email?: string }
  try { body = await req.json() } catch { return json({ error: 'invalid_json' }, 400) }

  // restore_user is keyed by an audit row, not a user_id — handle it before the
  // user_id guard below (which the other two actions share).
  if (body.action === 'restore_user') {
    return await restoreUser(body, adminId)
  }

  const userId = body.user_id ?? ''
  if (!userId) return json({ error: 'user_id_required' }, 400)

  if (body.action === 'reset_password') {
    // Block resetting another super_admin's password — defensive.
    const { data: target } = await svc.from('profiles').select('role').eq('id', userId).single()
    if (target?.role === 'super_admin') return json({ error: 'cannot_reset_super_admin' }, 403)

    const newPassword = randomPassword()
    const { error } = await svc.auth.admin.updateUserById(userId, { password: newPassword })
    if (error) return json({ error: 'reset_failed', detail: error.message }, 500)

    await svc.from('admin_user_audit').insert({
      user_id: userId, admin_id: adminId,
      action: 'reset_password',
      reason: 'admin reset; one-time password returned to admin UI',
    })
    // Return the temporary password ONCE; the admin UI displays + clears it.
    return json({ ok: true, temporary_password: newPassword })
  }

  if (body.action === 'delete_user') {
    // Block deleting super_admin accounts.
    const { data: target } = await svc.from('profiles').select('role').eq('id', userId).single()
    if (target?.role === 'super_admin') return json({ error: 'cannot_delete_super_admin' }, 403)

    // Block if user has active orders (consumer OR washer side) unless force.
    if (!body.force) {
      const { data: active } = await svc
        .from('orders')
        .select('id', { head: false })
        .or(`consumer_id.eq.${userId},washer_id.eq.${userId}`)
        .in('status', ['pending','accepted','en_route','arrived','in_progress','pending_approval'])
        .limit(1)
      if (active && active.length > 0) {
        return json({ error: 'user_has_active_orders', detail: 'pass force=true to override' }, 409)
      }
    }

    // Snapshot the profile + the auth email for audit before delete. The email
    // lives in auth.users (not profiles); capturing it here is what makes a
    // later best-effort restore able to recreate the login with the same
    // address. Stored under a reserved "__auth" key on the snapshot (ADR-028).
    const { data: snap } = await svc.from('profiles').select('*').eq('id', userId).single()
    let authEmail: string | null = null
    try {
      const { data: authUser } = await svc.auth.admin.getUserById(userId)
      authEmail = authUser?.user?.email ?? null
    } catch { /* email capture is best-effort; deletion still proceeds */ }
    const snapshot = snap ? { ...snap, __auth: { email: authEmail } } : null
    await svc.from('admin_user_audit').insert({
      user_id: userId, admin_id: adminId,
      action: 'delete_user',
      reason: body.force ? 'forced delete (had active orders)' : 'standard delete',
      before_snapshot: snapshot,
    })

    // Anonymize orders + clear the RESTRICT/NO-ACTION child rows (support chat,
    // order chat, ratings, etc.) BEFORE the profile delete. Without this, any user
    // with support-chat history can't be deleted (FK violation → the bug this fixes).
    await purgeUserData(userId)

    // Delete profile (orders/order_events references now NULL via ON DELETE SET
    // NULL; remaining child rows CASCADE); then the auth user.
    const { error: pDel } = await svc.from('profiles').delete().eq('id', userId)
    if (pDel) return json({ error: 'profile_delete_failed', detail: pDel.message }, 500)

    const { error: aDel } = await svc.auth.admin.deleteUser(userId)
    if (aDel) return json({ error: 'auth_delete_failed', detail: aDel.message }, 500)

    return json({ ok: true, deleted: userId })
  }

  return json({ error: 'unknown_action' }, 400)
})
