import { describe, it, expect, vi, beforeEach } from 'vitest'

const rpcCalls = []
const fromCalls = []
const fetchCalls = []

vi.mock('../lib/supabase.js', () => {
  function chain(table) {
    const ctx = { table, ops: [] }
    fromCalls.push(ctx)
    const obj = {
      select(s) { ctx.ops.push(['select', s]); return obj },
      eq(c, v) { ctx.ops.push(['eq', c, v]); return obj },
      or(s)    { ctx.ops.push(['or', s]); return obj },
      order(c, o = {}) { ctx.ops.push(['order', c, o]); return obj },
      limit(n) { ctx.ops.push(['limit', n]); return obj },
      single() { return Promise.resolve({ data: ctx._row ?? { id: 'x' }, error: null }) },
      then(r) { return Promise.resolve({ data: ctx._rows ?? [], error: null }).then(r) },
    }
    return obj
  }
  return {
    supabase: {
      from(table) { return chain(table) },
      rpc(name, args) {
        rpcCalls.push({ name, args })
        const result = {
          admin_get_user_auth:               { email: 'x@y.z' },
          admin_user_activity:               [],
          admin_create_impersonation_token:  { token: 'plain-token', expires_at: new Date().toISOString() },
          admin_merge_users:                 { keep: 'k', merged: 'm' },
          admin_update_profile:              { id: 'u1' },
        }[name] ?? null
        return Promise.resolve({ data: result, error: null })
      },
      auth: {
        getSession: () => Promise.resolve({ data: { session: { access_token: 'fake-jwt' } } }),
      },
    },
  }
})

const origFetch = globalThis.fetch
beforeEach(() => {
  rpcCalls.length = 0
  fromCalls.length = 0
  fetchCalls.length = 0
  globalThis.fetch = vi.fn((url, opts) => {
    fetchCalls.push({ url, opts })
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ ok: true, temporary_password: 'temp-123' }),
    })
  })
})

import {
  fetchUsers, adminUpdateProfile, adminSuspend, adminUnsuspend,
  adminMergeUsers, adminCreateImpersonationToken,
  adminResetPassword, adminDeleteUser,
  ROLES, roleColor, EDITABLE_PROFILE_FIELDS,
} from '../lib/adminUsers.js'

describe('adminUsers RPC wrappers', () => {
  it('adminUpdateProfile forwards changes', async () => {
    await adminUpdateProfile('u1', { full_name: 'New Name', role: 'agent' })
    expect(rpcCalls[0]).toEqual({
      name: 'admin_update_profile',
      args: { p_user_id: 'u1', p_changes: { full_name: 'New Name', role: 'agent' } },
    })
  })
  it('adminSuspend requires reason', async () => {
    await adminSuspend('u1', 'bad behavior')
    expect(rpcCalls[0].args).toEqual({ p_user_id: 'u1', p_reason: 'bad behavior' })
  })
  it('adminUnsuspend has no body', async () => {
    await adminUnsuspend('u1')
    expect(rpcCalls[0]).toEqual({ name: 'admin_unsuspend_user', args: { p_user_id: 'u1' } })
  })
  it('adminMergeUsers maps fields', async () => {
    const out = await adminMergeUsers({ keepUserId: 'k', mergeUserId: 'm', reason: 'dup' })
    expect(rpcCalls[0].args).toEqual({ p_keep_user_id: 'k', p_merge_user_id: 'm', p_reason: 'dup' })
    expect(out).toEqual({ keep: 'k', merged: 'm' })
  })
  it('adminCreateImpersonationToken returns plain token', async () => {
    const out = await adminCreateImpersonationToken('u1', 300)
    expect(rpcCalls[0].args).toEqual({ p_target_user_id: 'u1', p_ttl_seconds: 300 })
    expect(out.token).toBe('plain-token')
  })
})

describe('adminUsers Edge Function callers', () => {
  it('adminResetPassword posts to admin-user-mgmt with bearer auth', async () => {
    const res = await adminResetPassword('u1')
    expect(fetchCalls).toHaveLength(1)
    expect(fetchCalls[0].url).toMatch(/\/functions\/v1\/admin-user-mgmt$/)
    expect(fetchCalls[0].opts.headers['Authorization']).toBe('Bearer fake-jwt')
    expect(JSON.parse(fetchCalls[0].opts.body)).toEqual({ action: 'reset_password', user_id: 'u1' })
    expect(res.temporary_password).toBe('temp-123')
  })
  it('adminDeleteUser forwards force flag', async () => {
    await adminDeleteUser('u1', true)
    expect(JSON.parse(fetchCalls[0].opts.body)).toEqual({ action: 'delete_user', user_id: 'u1', force: true })
  })
  it('adminDeleteUser defaults force to false', async () => {
    await adminDeleteUser('u1')
    expect(JSON.parse(fetchCalls[0].opts.body)).toEqual({ action: 'delete_user', user_id: 'u1', force: false })
  })
})

describe('adminUsers helpers', () => {
  it('ROLES starts with "all"', () => {
    expect(ROLES[0]).toBe('all')
  })
  it('roleColor returns a string for every role', () => {
    for (const r of ROLES) expect(typeof roleColor(r)).toBe('string')
  })
  it('EDITABLE_PROFILE_FIELDS matches migration 0086 whitelist', () => {
    expect(EDITABLE_PROFILE_FIELDS).toEqual([
      'full_name','phone','locale','role',
      'washer_verification_status','agent_display_name','agent_is_active',
      'current_tier',
    ])
  })
  it('fetchUsers omits role filter when role=all', async () => {
    await fetchUsers({ role: 'all' })
    const eqs = fromCalls[0].ops.filter(o => o[0] === 'eq')
    expect(eqs).toHaveLength(0)
  })
  it('fetchUsers adds role filter for concrete role', async () => {
    await fetchUsers({ role: 'washer' })
    const eq = fromCalls[0].ops.find(o => o[0] === 'eq')
    expect(eq).toEqual(['eq', 'role', 'washer'])
  })
})

afterAll?.(() => { globalThis.fetch = origFetch })

// Vitest "afterAll" optional hook reset for safety in case other suites run.
import { afterAll } from 'vitest'
afterAll(() => { globalThis.fetch = origFetch })
