import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'

const rpcCalls = []
const fetchCalls = []

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    rpc(name, args) {
      rpcCalls.push({ name, args })
      const result = {
        get_admin_activity_feed:     [{ ref_id: 'h1' }],
        admin_undo_change:           { ok: true, reverted: 'update' },
        admin_get_deletion_snapshot: { user_id: 'u1', auth_email: 'a@b.c', already_restored: false },
      }[name] ?? null
      return Promise.resolve({ data: result, error: null })
    },
    auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 'fake-jwt' } } }) },
  },
}))

const origFetch = globalThis.fetch
beforeEach(() => {
  rpcCalls.length = 0
  fetchCalls.length = 0
  globalThis.fetch = vi.fn((url, opts) => {
    fetchCalls.push({ url, opts })
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, restored: { new_user_id: 'n1' } }) })
  })
})
afterAll(() => { globalThis.fetch = origFetch })

import {
  HISTORY_FILTERS, fetchActivityFeed, undoChange, fetchDeletionSnapshot, restoreUser,
  actionLabel, extractDisplayValue, categoryColor,
  isUndoable, isUserDeletion, isNotReversible,
} from '../lib/adminHistory.js'

describe('adminHistory — network wrappers', () => {
  it('fetchActivityFeed passes null entityType for "all"', async () => {
    await fetchActivityFeed({ entityType: 'all', limit: 50 })
    expect(rpcCalls[0]).toEqual({
      name: 'get_admin_activity_feed',
      args: { p_limit: 50, p_before: null, p_entity_type: null },
    })
  })
  it('fetchActivityFeed forwards a concrete filter + before cursor', async () => {
    await fetchActivityFeed({ entityType: 'config', limit: 25, before: '2026-05-29T00:00:00Z' })
    expect(rpcCalls[0].args).toEqual({ p_limit: 25, p_before: '2026-05-29T00:00:00Z', p_entity_type: 'config' })
  })
  it('undoChange forwards the history id', async () => {
    const out = await undoChange('hist-1')
    expect(rpcCalls[0]).toEqual({ name: 'admin_undo_change', args: { p_history_id: 'hist-1' } })
    expect(out.ok).toBe(true)
  })
  it('fetchDeletionSnapshot forwards the audit id', async () => {
    await fetchDeletionSnapshot('aud-1')
    expect(rpcCalls[0]).toEqual({ name: 'admin_get_deletion_snapshot', args: { p_audit_id: 'aud-1' } })
  })
  it('restoreUser posts restore_user to admin-user-mgmt with bearer auth', async () => {
    await restoreUser({ auditId: 'aud-1', email: 'a@b.c' })
    expect(fetchCalls).toHaveLength(1)
    expect(fetchCalls[0].url).toMatch(/\/functions\/v1\/admin-user-mgmt$/)
    expect(fetchCalls[0].opts.headers['Authorization']).toBe('Bearer fake-jwt')
    expect(JSON.parse(fetchCalls[0].opts.body)).toEqual({ action: 'restore_user', audit_id: 'aud-1', email: 'a@b.c' })
  })
})

describe('adminHistory — display helpers', () => {
  it('HISTORY_FILTERS starts with "all"', () => {
    expect(HISTORY_FILTERS[0].id).toBe('all')
  })

  const overrideEntry = { source_table: 'admin_change_history', entity_type: 'content_override', action: 'update', undoable: true }
  const orderEntry    = { source_table: 'admin_order_audit', action: 'cancel', undoable: false }
  const deleteEntry   = { source_table: 'admin_user_audit', action: 'delete_user', undoable: false }
  const suspendEntry  = { source_table: 'admin_user_audit', action: 'suspend', undoable: false }
  const broadcastEntry= { source_table: 'broadcast_notifications', action: 'sent', undoable: false }

  it('actionLabel describes each source', () => {
    expect(actionLabel(overrideEntry)).toBe('Changed content string')
    expect(actionLabel(orderEntry)).toBe('Cancelled order')
    expect(actionLabel(deleteEntry)).toBe('Deleted user')
    expect(actionLabel(broadcastEntry)).toBe('Sent broadcast')
  })

  it('isUndoable only for override edits', () => {
    expect(isUndoable(overrideEntry)).toBe(true)
    expect(isUndoable(orderEntry)).toBe(false)
  })
  it('isUserDeletion only for delete_user user-audit rows', () => {
    expect(isUserDeletion(deleteEntry)).toBe(true)
    expect(isUserDeletion(suspendEntry)).toBe(false)
  })
  it('isNotReversible excludes both undoable and user-deletion rows', () => {
    expect(isNotReversible(overrideEntry)).toBe(false)  // undoable
    expect(isNotReversible(deleteEntry)).toBe(false)     // restorable
    expect(isNotReversible(suspendEntry)).toBe(true)     // neither
    expect(isNotReversible(broadcastEntry)).toBe(true)
  })

  it('extractDisplayValue reads the meaningful field per type', () => {
    expect(extractDisplayValue('content_override', { value: 'Hello' })).toBe('Hello')
    expect(extractDisplayValue('branding', { url: 'http://x/logo.png' })).toBe('http://x/logo.png')
    expect(extractDisplayValue('app_config', { value: { value: 100 } })).toBe('100')
    expect(extractDisplayValue('payout_tier_config', { payout: 55 })).toBe('₪55')
    expect(extractDisplayValue('content_override', null)).toBeNull()
  })

  it('categoryColor returns a class string for every filter', () => {
    for (const f of HISTORY_FILTERS) expect(typeof categoryColor(f.id)).toBe('string')
  })
})
