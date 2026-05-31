import { describe, it, expect, beforeEach, vi } from 'vitest'

// Records every Supabase method touched by the module, so we can prove behaviorally
// that the Chats data layer NEVER writes (no insert/update/delete/upsert/rpc).
const ops = []
const selectArgs = []
let rpcCalled = false

const CONV_ROWS = [
  { id: 'c1', status: 'assigned', opener_role: 'consumer', opener_id: 'u1', assigned_agent_id: 'a1',
    last_message_body: 'hi', last_message_at: '2026-05-30T10:00:00Z',
    opener: { id: 'u1', full_name: 'Dana', role: 'consumer' },
    agent:  { id: 'a1', full_name: 'Agent Smith', agent_display_name: 'Smith' } },
]
const MSG_ROWS = [
  { id: 'm1', conversation_id: 'c1', sender_id: 'u1', sender_role: 'consumer', body: 'hi', attachment_path: null,
    created_at: '2026-05-30T10:00:00Z', sender: { id: 'u1', full_name: 'Dana', role: 'consumer' } },
]

vi.mock('../lib/supabase.js', () => {
  function builder(terminalRows) {
    const b = {
      select(s) { ops.push('select'); selectArgs.push(s); return b },
      eq()      { ops.push('eq'); return b },
      order()   { ops.push('order'); return b },
      limit()   { ops.push('limit'); return Promise.resolve({ data: terminalRows, error: null }) },
      single()  { ops.push('single'); return Promise.resolve({ data: terminalRows[0] ?? null, error: null }) },
      then(r)   { return Promise.resolve({ data: terminalRows, error: null }).then(r) },
      // Mutation methods exist on the real builder; if the module ever calls one,
      // it gets recorded and the read-only assertion below fails loudly.
      insert()  { ops.push('insert'); return b },
      update()  { ops.push('update'); return b },
      delete()  { ops.push('delete'); return b },
      upsert()  { ops.push('upsert'); return b },
    }
    return b
  }
  const channel = {
    on() { ops.push('on'); return channel },
    subscribe() { ops.push('subscribe'); return channel },
  }
  return {
    supabase: {
      from(table) {
        ops.push(`from:${table}`)
        if (table === 'support_conversations') return builder(CONV_ROWS)
        if (table === 'support_messages')      return builder(MSG_ROWS)
        return builder([{ id: 'u1', full_name: 'Dana', role: 'consumer' }])
      },
      rpc() { rpcCalled = true; ops.push('rpc'); return Promise.resolve({ data: null, error: null }) },
      channel() { ops.push('channel'); return channel },
      storage: {
        from() {
          return { getPublicUrl: (p) => { ops.push('getPublicUrl'); return { data: { publicUrl: `https://cdn/${p}` } } } }
        },
      },
    },
  }
})

import * as adminChats from '../lib/adminChats.js'

beforeEach(() => { ops.length = 0; selectArgs.length = 0; rpcCalled = false })

describe('adminChats fetch wrappers — shaped reads', () => {
  it('fetchConversations selects the FK embeds, orders by activity, returns rows', async () => {
    const rows = await adminChats.fetchConversations()
    expect(rows).toEqual(CONV_ROWS)
    expect(ops).toContain('from:support_conversations')
    expect(ops).toContain('order')
    const sel = selectArgs.join('\n')
    expect(sel).toMatch(/opener:profiles!opener_id/)
    expect(sel).toMatch(/agent:profiles!assigned_agent_id/)
    expect(sel).toMatch(/last_message_body/)
  })

  it('fetchMessages filters by conversation, resolves sender, returns chronological rows', async () => {
    const rows = await adminChats.fetchMessages('c1')
    expect(rows).toEqual(MSG_ROWS)
    expect(ops).toContain('from:support_messages')
    expect(ops).toContain('eq')
    expect(selectArgs.join('\n')).toMatch(/sender:profiles!sender_id/)
  })

  it('fetchSenderBrief returns a single profile', async () => {
    const s = await adminChats.fetchSenderBrief('u1')
    expect(s).toEqual({ id: 'u1', full_name: 'Dana', role: 'consumer' })
    expect(ops).toContain('single')
  })

  it('attachmentPublicUrl builds a public URL and is null-safe', () => {
    expect(adminChats.attachmentPublicUrl('c1/x.jpg')).toBe('https://cdn/c1/x.jpg')
    expect(adminChats.attachmentPublicUrl(null)).toBeNull()
  })

  it('subscribeConversations / subscribeMessages attach realtime listeners (read-only)', () => {
    adminChats.subscribeConversations(() => {})
    adminChats.subscribeMessages('c1', () => {})
    expect(ops.filter(o => o === 'subscribe')).toHaveLength(2)
  })
})

describe('adminChats display helpers', () => {
  it('conversationStatusClass + roleBadgeClass return strings for every value', () => {
    for (const s of adminChats.CONVERSATION_STATUSES) expect(typeof adminChats.conversationStatusClass(s)).toBe('string')
    for (const r of ['consumer', 'washer', 'agent', 'super_admin', 'weird']) expect(typeof adminChats.roleBadgeClass(r)).toBe('string')
  })
  it('partyOf / agentNameOf resolve names', () => {
    expect(adminChats.partyOf(CONV_ROWS[0])).toEqual({ name: 'Dana', role: 'consumer', id: 'u1' })
    expect(adminChats.agentNameOf(CONV_ROWS[0])).toBe('Smith')
    expect(adminChats.agentNameOf({ assigned_agent_id: null })).toBeNull()
  })
})

// ── The read-only guarantee ───────────────────────────────────────────────────
describe('adminChats is READ-ONLY by construction (ADR-029)', () => {
  it('exposes NO mutation-named export', () => {
    const MUTATION_VERBS = [
      'send', 'insert', 'update', 'delete', 'upsert', 'create', 'remove', 'claim',
      'release', 'resolve', 'close', 'save', 'write', 'post', 'mutate', 'set',
      'reassign', 'override', 'suspend', 'merge', 'drop',
    ]
    const fnNames = Object.entries(adminChats)
      .filter(([, v]) => typeof v === 'function')
      .map(([k]) => k)
    expect(fnNames.length).toBeGreaterThan(0)
    for (const name of fnNames) {
      const lower = name.toLowerCase()
      const offending = MUTATION_VERBS.find(v => lower.startsWith(v))
      expect(offending, `export "${name}" looks like a mutation`).toBeUndefined()
    }
  })

  it('performs NO write op when every read/subscribe export is exercised', async () => {
    await adminChats.fetchConversations()
    await adminChats.fetchMessages('c1')
    await adminChats.fetchSenderBrief('u1')
    adminChats.attachmentPublicUrl('c1/x.jpg')
    adminChats.subscribeConversations(() => {})
    adminChats.subscribeMessages('c1', () => {})
    expect(ops).not.toContain('insert')
    expect(ops).not.toContain('update')
    expect(ops).not.toContain('delete')
    expect(ops).not.toContain('upsert')
    expect(rpcCalled).toBe(false)
  })
})
