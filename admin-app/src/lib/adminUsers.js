// admin-app/src/lib/adminUsers.js
//
// RPC wrappers + Edge Function fetches for the P7 Users tab. Every write is
// audit-logged server-side. The Edge Function calls go through the user's
// own bearer token; the function enforces super_admin server-side.

import { supabase } from './supabase.js'

export const USER_SELECT = `
  id, full_name, phone, role, locale, created_at,
  is_online, last_lat, last_lng, last_location_at,
  current_tier, current_rating, rated_job_count,
  agent_display_name, agent_is_active,
  washer_verification_status, washer_dealer_number,
  display_preference,
  suspended_at, suspended_reason, suspended_by
`.trim()

export const ROLES = ['all','consumer','washer','agent','super_admin']

// ── Read ───────────────────────────────────────────────────────────────────

export async function fetchUsers({ role = 'all', limit = 300 } = {}) {
  let q = supabase
    .from('profiles')
    .select(USER_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (role && role !== 'all') q = q.eq('role', role)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function fetchUserDetail(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select(USER_SELECT)
    .eq('id', userId)
    .single()
  if (error) throw error
  return data
}

export async function fetchUserAuth(userId) {
  const { data, error } = await supabase.rpc('admin_get_user_auth', { p_user_id: userId })
  if (error) throw error
  return data
}

export async function fetchUserActivity(userId, limit = 200) {
  const { data, error } = await supabase.rpc('admin_user_activity', { p_user_id: userId, p_limit: limit })
  if (error) throw error
  return data ?? []
}

export async function fetchAdminUserAudit(userId) {
  const { data, error } = await supabase
    .from('admin_user_audit')
    .select('id, action, reason, before_snapshot, after_snapshot, created_at, admin_id, admin:admin_id(full_name)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) return []
  return data ?? []
}

// ── Role-specific summaries ────────────────────────────────────────────────

export async function fetchConsumerSummary(userId) {
  const [ordersRes, vehiclesRes] = await Promise.all([
    supabase.from('orders')
      .select('id, status, total_price, created_at, car_type')
      .eq('consumer_id', userId)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase.from('vehicles')
      .select('id, plate, nickname, make, model, year, color, category, is_default')
      .eq('consumer_id', userId),
  ])
  return {
    orders:   ordersRes.data ?? [],
    vehicles: vehiclesRes.data ?? [],
  }
}

export async function fetchWasherSummary(userId) {
  const [ordersRes, ratingsRes, verifRes] = await Promise.all([
    supabase.from('orders')
      .select('id, status, payout_amount, completed_at, approved_at, car_type')
      .eq('washer_id', userId)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase.from('washer_ratings')
      .select('id, stars, feedback, created_at, order_id')
      .eq('washer_id', userId)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase.from('washer_verifications')
      .select('id, status, id_document_path, selfie_path, business_license_path, created_at, reason')
      .eq('washer_id', userId)
      .order('created_at', { ascending: false })
      .limit(5),
  ])
  return {
    orders:   ordersRes.data ?? [],
    ratings:  ratingsRes.data ?? [],
    verifications: verifRes.data ?? [],
  }
}

export async function fetchAgentSummary(userId) {
  const [convRes, cannedRes] = await Promise.all([
    supabase.from('support_conversations')
      .select('id, status, opener_id, created_at, last_message_body')
      .eq('agent_id', userId)
      .order('created_at', { ascending: false })
      .limit(30),
    supabase.from('support_canned_responses')
      .select('id, label, body')
      .eq('agent_id', userId)
      .limit(50),
  ])
  return {
    conversations: convRes.data ?? [],
    canned:        cannedRes.data ?? [],
  }
}

// ── Writes — RPCs ──────────────────────────────────────────────────────────

export async function adminUpdateProfile(userId, changes) {
  const { data, error } = await supabase.rpc('admin_update_profile', {
    p_user_id: userId, p_changes: changes,
  })
  if (error) throw error
  return data
}

export async function adminSuspend(userId, reason) {
  const { error } = await supabase.rpc('admin_suspend_user', {
    p_user_id: userId, p_reason: reason,
  })
  if (error) throw error
}

export async function adminUnsuspend(userId) {
  const { error } = await supabase.rpc('admin_unsuspend_user', { p_user_id: userId })
  if (error) throw error
}

export async function adminMergeUsers({ keepUserId, mergeUserId, reason }) {
  const { data, error } = await supabase.rpc('admin_merge_users', {
    p_keep_user_id: keepUserId, p_merge_user_id: mergeUserId, p_reason: reason,
  })
  if (error) throw error
  return data
}

export async function adminCreateImpersonationToken(userId, ttl = 600) {
  const { data, error } = await supabase.rpc('admin_create_impersonation_token', {
    p_target_user_id: userId, p_ttl_seconds: ttl,
  })
  if (error) throw error
  return data  // { token, target_user, expires_at }
}

// ── Writes — Edge Functions (need service role) ────────────────────────────

function edgeUrl(name) {
  const base = (import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '')
  return `${base}/functions/v1/${name}`
}

async function callEdge(name, body) {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(edgeUrl(name), {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${session?.access_token ?? ''}`,
      'apikey':        import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
    },
    body: JSON.stringify(body),
  })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(payload?.error ?? `edge_${res.status}`)
  return payload
}

export async function adminResetPassword(userId) {
  return callEdge('admin-user-mgmt', { action: 'reset_password', user_id: userId })
}
export async function adminDeleteUser(userId, force = false) {
  return callEdge('admin-user-mgmt', { action: 'delete_user', user_id: userId, force })
}

// ── Search ─────────────────────────────────────────────────────────────────

export async function searchUsers(query, limit = 50) {
  let q = supabase.from('profiles').select(USER_SELECT).order('full_name').limit(limit)
  if (query?.trim()) {
    const s = query.trim().replace(/[%_]/g, c => `\\${c}`)
    q = q.or(`full_name.ilike.%${s}%,phone.ilike.%${s.replace(/\s+/g,'')}%,id.eq.${isUuid(s) ? s : '00000000-0000-0000-0000-000000000000'}`)
  }
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

function isUuid(s) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
}

// ── Display helpers ────────────────────────────────────────────────────────

export function roleColor(r) {
  switch (r) {
    case 'consumer':    return 'bg-success/10 text-success border-success/30'
    case 'washer':      return 'bg-admin-soft text-admin-deep border-admin/30'
    case 'agent':       return 'bg-warning/10 text-warning border-warning/30'
    case 'super_admin': return 'bg-danger/10 text-danger border-danger/30'
    default:            return 'bg-surface text-ink-muted border-edge'
  }
}

// Edit profile whitelist — must match the migration 0086 list.
export const EDITABLE_PROFILE_FIELDS = [
  'full_name', 'phone', 'locale', 'role',
  'washer_verification_status', 'agent_display_name', 'agent_is_active',
  'current_tier',
]
