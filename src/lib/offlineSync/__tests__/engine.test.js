import { describe, it, expect, beforeEach, vi } from 'vitest'

// fake-indexeddb could not be installed in this environment (npm registry TLS
// failure), so we mock the thin db.js layer with an in-memory Map. The engine's
// orchestration — capture → ordered queue → idempotent/resumable replay — is the
// behaviour under test; db.js is a trivial IndexedDB wrapper verified on-device.

const store = new Map()
vi.mock('../db.js', () => ({
  putCapture:       vi.fn(async (rec)        => { store.set(rec.id, rec); return rec.id }),
  getCapture:       vi.fn(async (id)         => store.get(id)),
  getAllCaptures:   vi.fn(async ()           => [...store.values()]),
  deleteCapture:    vi.fn(async (id)         => { store.delete(id) }),
  setCaptureStatus: vi.fn(async (id, status) => { const r = store.get(id); if (r) { r.status = status } }),
  _clearAllCaptures: vi.fn(async ()          => store.clear()),
}))

import {
  putDraftAngle, commitCapture, getCapturesByOrder, replayAll, replayCapture, PHOTO_SLOTS,
} from '../engine.js'

const ORDER = 'order-ug-1'
const blob  = () => new Blob(['x'], { type: 'image/jpeg' })

// A stateful fake Supabase server: status advances as transitions are applied,
// so replay's "re-read live status" sees the truth (powering idempotency tests).
function makeServer(initialStatus) {
  const state = { status: initialStatus, cols: {}, uploads: [], transitions: [] }
  const supabase = {
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { status: state.status }, error: null }) }) }),
      update: (patch) => ({ eq: async () => { Object.assign(state.cols, patch); return { error: null } } }),
    }),
    storage: {
      from: () => ({ upload: async (path) => { state.uploads.push(path); return { error: null } } }),
    },
    rpc: async (fn, args) => {
      if (fn === 'transition_order_status') {
        state.transitions.push(args.new_status)
        state.status = args.new_status          // server advances
        // contract: underground replay passes null coords
        expect(args.washer_lat).toBeNull()
        expect(args.washer_lng).toBeNull()
      }
      return { error: null }
    },
  }
  return { supabase, state }
}

async function captureSet(type) {
  for (const slot of PHOTO_SLOTS) await putDraftAngle(ORDER, type, slot, blob(), 1000)
  return commitCapture(ORDER, type, 2000)
}

beforeEach(() => { store.clear() })

describe('offline capture — queueing', () => {
  it('captures 4 angles into an ordered queue with NO network calls', async () => {
    const { supabase, state } = makeServer('en_route')
    await captureSet('arrival')
    await captureSet('completion')

    const recs = await getCapturesByOrder(ORDER)
    expect(recs.map(r => r.type).sort()).toEqual(['arrival', 'completion'])
    for (const r of recs) {
      expect(Object.keys(r.angles).sort()).toEqual([...PHOTO_SLOTS].sort())
      expect(r.status).toBe('queued')
    }
    // Capture must not have touched the server.
    expect(state.uploads).toEqual([])
    expect(state.transitions).toEqual([])
    void supabase
  })

  it('commitCapture refuses to queue a partial set', async () => {
    await putDraftAngle(ORDER, 'arrival', 'front', blob(), 1000)
    await putDraftAngle(ORDER, 'arrival', 'back', blob(), 1000)
    await expect(commitCapture(ORDER, 'arrival', 2000)).rejects.toThrow(/missing/i)
  })
})

describe('offline replay — full flow', () => {
  it('uploads 8 photos and transitions arrived → in_progress → pending_approval in order', async () => {
    const { supabase, state } = makeServer('en_route')
    await captureSet('arrival')
    await captureSet('completion')

    const results = await replayAll(supabase)

    expect(state.transitions).toEqual(['arrived', 'in_progress', 'pending_approval'])
    expect(state.uploads).toHaveLength(8)
    // arrival paths then completion paths, deterministic + idempotent
    expect(state.uploads).toContain(`${ORDER}/arrival/front.jpg`)
    expect(state.uploads).toContain(`${ORDER}/completion/passenger.jpg`)
    // both tasks confirmed → cleared from the queue
    expect(results.every(r => r.outcome === 'done')).toBe(true)
    expect(await getCapturesByOrder(ORDER)).toHaveLength(0)
  })
})

describe('offline replay — idempotent + resumable', () => {
  it('skips an arrival already applied server-side (no re-upload, no re-transition)', async () => {
    const { supabase, state } = makeServer('arrived') // server already advanced
    await captureSet('arrival')

    await replayAll(supabase)

    expect(state.uploads).toEqual([])
    expect(state.transitions).toEqual([])
    expect(await getCapturesByOrder(ORDER)).toHaveLength(0) // cleared as done
  })

  it('re-running replay after success is a no-op (queue already drained)', async () => {
    const { supabase, state } = makeServer('en_route')
    await captureSet('arrival')
    await captureSet('completion')
    await replayAll(supabase)
    const before = [...state.transitions]

    await replayAll(supabase) // second pass
    expect(state.transitions).toEqual(before) // nothing new
  })

  it('replayCapture returns "done" when the order was completed/cancelled elsewhere', async () => {
    const { supabase } = makeServer('completed')
    const outcome = await replayCapture(supabase, { orderId: ORDER, type: 'completion', angles: {} })
    expect(outcome).toBe('done')
  })

  it('leaves a completion queued ("skip") when arrival has not been applied yet', async () => {
    const { supabase, state } = makeServer('en_route') // not yet arrived
    const outcome = await replayCapture(supabase, { orderId: ORDER, type: 'completion', angles: {} })
    expect(outcome).toBe('skip')
    expect(state.transitions).toEqual([]) // didn't force anything
  })
})
