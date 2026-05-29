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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() })
  if (req.method !== 'POST')   return json({ error: 'method_not_allowed' }, 405)

  const authResult = await authorizeSuperAdmin(req)
  if (authResult instanceof Response) return authResult
  const { adminId } = authResult

  let body: { action?: string; user_id?: string; force?: boolean }
  try { body = await req.json() } catch { return json({ error: 'invalid_json' }, 400) }

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

    // Snapshot the profile + linked records for audit before delete.
    const { data: snap } = await svc.from('profiles').select('*').eq('id', userId).single()
    await svc.from('admin_user_audit').insert({
      user_id: userId, admin_id: adminId,
      action: 'delete_user',
      reason: body.force ? 'forced delete (had active orders)' : 'standard delete',
      before_snapshot: snap ?? null,
    })

    // Delete profile first so dependent rows ON DELETE CASCADE; then auth user.
    const { error: pDel } = await svc.from('profiles').delete().eq('id', userId)
    if (pDel) return json({ error: 'profile_delete_failed', detail: pDel.message }, 500)

    const { error: aDel } = await svc.auth.admin.deleteUser(userId)
    if (aDel) return json({ error: 'auth_delete_failed', detail: aDel.message }, 500)

    return json({ ok: true, deleted: userId })
  }

  return json({ error: 'unknown_action' }, 400)
})
