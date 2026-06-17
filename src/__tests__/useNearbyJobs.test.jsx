import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

// Regression guard for the 0066 nearby_jobs rewrite:
// the RPC must keep returning lat / lng on each row so WorkerMap.jsx can
// render pending-job pins (it reads job.lat / job.lng directly).
//
// Plus the "appear in place, no refresh flicker" rewrite:
//  - realtime changes merge a single row incrementally (no full RPC refetch),
//  - an identical refetch is a no-op (state reference stays stable).

let lastRpcArgs     = null
let rpcRows         = []
let rpcCallCount    = 0
let realtimeHandler = null

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    rpc: vi.fn((fn, args) => {
      lastRpcArgs = { fn, args }
      rpcCallCount += 1
      return Promise.resolve({ data: rpcRows, error: null })
    }),
    // Capture the postgres_changes callback so tests can emit realtime events.
    channel: () => ({
      on: (_event, _config, cb) => { realtimeHandler = cb; return { subscribe: () => ({}) } },
      subscribe: () => ({}),
    }),
    removeChannel: () => {},
  },
}))

import { useNearbyJobs } from '../hooks/useNearbyJobs.js'

const WASHER = { lat: 32.0, lng: 34.8 }

function pendingRow(id, overrides = {}) {
  return {
    id,
    status: 'pending',
    car_type: 'sedan',
    service_type: 'wash',
    base_price: 50,
    created_at: '2026-06-01T10:00:00.000Z',
    ...overrides,
  }
}

describe('useNearbyJobs', () => {
  beforeEach(() => {
    lastRpcArgs     = null
    rpcRows         = []
    rpcCallCount    = 0
    realtimeHandler = null
  })

  it('calls the nearby_jobs RPC with the washer position', async () => {
    rpcRows = []
    const { result } = renderHook(() => useNearbyJobs(WASHER, true))
    await waitFor(() => expect(lastRpcArgs).not.toBeNull())
    expect(lastRpcArgs.fn).toBe('nearby_jobs')
    expect(lastRpcArgs.args).toEqual({ washer_lat: 32.0, washer_lng: 34.8, radius_km: 15 })
    expect(result.current.jobs).toEqual([])
  })

  it('passes lat and lng from each RPC row through to consumers (WorkerMap pin contract)', async () => {
    rpcRows = [
      { id: 'order-1', status: 'pending', distance_km: 1.2, lat: 32.0853, lng: 34.7818 },
      { id: 'order-2', status: 'pending', distance_km: 3.7, lat: 32.0900, lng: 34.7900 },
    ]
    const { result } = renderHook(() => useNearbyJobs(WASHER, true))
    await waitFor(() => expect(result.current.jobs).toHaveLength(2))

    // The hook must not strip lat/lng — WorkerMap.jsx renders Markers at job.lat/job.lng.
    expect(result.current.jobs[0].lat).toBe(32.0853)
    expect(result.current.jobs[0].lng).toBe(34.7818)
    expect(result.current.jobs[1].lat).toBe(32.0900)
    expect(result.current.jobs[1].lng).toBe(34.7900)
  })

  it('does not call the RPC when disabled', async () => {
    rpcRows = [{ id: 'x', lat: 1, lng: 2 }]
    renderHook(() => useNearbyJobs({ lat: 32, lng: 34 }, false))
    // Give the effect a tick to run if it were going to.
    await new Promise(r => setTimeout(r, 10))
    expect(lastRpcArgs).toBeNull()
  })

  // ── New: incremental realtime merge ─────────────────────────────────────────

  it('INSERT of an in-range pending order adds exactly one job — without a full RPC refetch', async () => {
    rpcRows = [
      pendingRow('order-1', { distance_km: 1.2, lat: 32.0853, lng: 34.7818 }),
      pendingRow('order-2', { distance_km: 3.7, lat: 32.0900, lng: 34.7900 }),
    ]
    const { result } = renderHook(() => useNearbyJobs(WASHER, true))
    await waitFor(() => expect(result.current.jobs).toHaveLength(2))
    expect(rpcCallCount).toBe(1)
    expect(realtimeHandler).toBeTypeOf('function')

    // New pending order arrives ~0 km from the washer.
    act(() => {
      realtimeHandler({
        eventType: 'INSERT',
        new: pendingRow('order-3', { lat: 32.0, lng: 34.8 }),
        old: {},
      })
    })

    await waitFor(() => expect(result.current.jobs).toHaveLength(3))
    // Exactly one added, and crucially: no second RPC call.
    expect(rpcCallCount).toBe(1)
    expect(result.current.jobs.map(j => j.id)).toContain('order-3')
  })

  // ── Regression: realtime row with no usable coords (real-world production) ───
  // In production the `orders.location` PostGIS column arrives over realtime as
  // EWKB hex (not WKT `POINT`), and the generated lat/lng columns are stripped by
  // logical replication — so the raw row can't be placed by coords. The hook must
  // fall back to a silent refetch so a new order still pops in live.

  it('INSERT whose realtime row lacks usable coords silently refetches so the order appears live', async () => {
    rpcRows = [pendingRow('order-1', { distance_km: 1.2, lat: 32.0853, lng: 34.7818 })]
    const { result } = renderHook(() => useNearbyJobs(WASHER, true))
    await waitFor(() => expect(result.current.jobs).toHaveLength(1))
    expect(rpcCallCount).toBe(1)

    // Server now has a second in-range pending order; the next RPC returns both.
    rpcRows = [
      pendingRow('order-1', { distance_km: 1.2, lat: 32.0853, lng: 34.7818 }),
      pendingRow('order-2', { distance_km: 0.5, lat: 32.0, lng: 34.8 }),
    ]

    // Realtime delivers the INSERT the way Postgres actually does: PostGIS EWKB in
    // `location`, and NO lat/lng (generated columns are not replicated).
    act(() => {
      realtimeHandler({
        eventType: 'INSERT',
        new: { id: 'order-2', status: 'pending', location: '0101000020E6100000ABCDEF' },
        old: {},
      })
    })

    // The hook refetched in the background and the new order popped in…
    await waitFor(() => expect(result.current.jobs.map(j => j.id)).toContain('order-2'))
    expect(rpcCallCount).toBe(2)
    // …with no visible "refresh": the list was non-empty, so no spinner toggled.
    expect(result.current.loading).toBe(false)
  })

  it('UPDATE of a still-pending order with no usable coords refetches instead of dropping it', async () => {
    rpcRows = [
      pendingRow('order-1', { distance_km: 1.2, lat: 32.0853, lng: 34.7818 }),
      pendingRow('order-2', { distance_km: 3.7, lat: 32.0900, lng: 34.7900 }),
    ]
    const { result } = renderHook(() => useNearbyJobs(WASHER, true))
    await waitFor(() => expect(result.current.jobs).toHaveLength(2))
    expect(rpcCallCount).toBe(1)

    // order-1 is edited (price change) but stays pending; realtime carries only EWKB.
    act(() => {
      realtimeHandler({
        eventType: 'UPDATE',
        new: { id: 'order-1', status: 'pending', base_price: 60, location: '0101000020E6100000ABCDEF' },
        old: { id: 'order-1', status: 'pending' },
      })
    })

    // Old code wrongly dropped order-1; now the refetch keeps the full list intact.
    await waitFor(() => expect(rpcCallCount).toBe(2))
    expect(result.current.jobs.map(j => j.id)).toEqual(['order-1', 'order-2'])
  })

  it('UPDATE moving an order out of pending removes it from the list (no refetch)', async () => {
    rpcRows = [
      pendingRow('order-1', { distance_km: 1.2, lat: 32.0853, lng: 34.7818 }),
      pendingRow('order-2', { distance_km: 3.7, lat: 32.0900, lng: 34.7900 }),
    ]
    const { result } = renderHook(() => useNearbyJobs(WASHER, true))
    await waitFor(() => expect(result.current.jobs).toHaveLength(2))
    expect(rpcCallCount).toBe(1)

    // order-1 gets accepted → leaves the pending pool.
    act(() => {
      realtimeHandler({
        eventType: 'UPDATE',
        new: { id: 'order-1', status: 'accepted', lat: 32.0853, lng: 34.7818 },
        old: { id: 'order-1', status: 'pending' },
      })
    })

    await waitFor(() => expect(result.current.jobs).toHaveLength(1))
    expect(result.current.jobs.map(j => j.id)).toEqual(['order-2'])
    expect(rpcCallCount).toBe(1)
  })

  it('DELETE removes the order by id', async () => {
    rpcRows = [
      pendingRow('order-1', { distance_km: 1.2, lat: 32.0853, lng: 34.7818 }),
      pendingRow('order-2', { distance_km: 3.7, lat: 32.0900, lng: 34.7900 }),
    ]
    const { result } = renderHook(() => useNearbyJobs(WASHER, true))
    await waitFor(() => expect(result.current.jobs).toHaveLength(2))

    act(() => {
      realtimeHandler({ eventType: 'DELETE', new: {}, old: { id: 'order-2' } })
    })

    await waitFor(() => expect(result.current.jobs.map(j => j.id)).toEqual(['order-1']))
    expect(rpcCallCount).toBe(1)
  })

  // ── New: no-op refetch keeps state identity stable ──────────────────────────

  it('re-emitting an identical fetch result does not change the jobs array reference', async () => {
    rpcRows = [
      pendingRow('order-1', { distance_km: 1.2, lat: 32.0853, lng: 34.7818 }),
      pendingRow('order-2', { distance_km: 3.7, lat: 32.0900, lng: 34.7900 }),
    ]
    const { result } = renderHook(() => useNearbyJobs(WASHER, true))
    await waitFor(() => expect(result.current.jobs).toHaveLength(2))

    const before = result.current.jobs

    // Identical RPC payload re-fetched — nothing rendered changed.
    await act(async () => { await result.current.refresh() })

    const after = result.current.jobs
    expect(rpcCallCount).toBe(2)          // the RPC did run again…
    expect(after).toBe(before)            // …but the no-op setState was skipped (same reference)
    expect(after.map(j => j.id)).toEqual(['order-1', 'order-2'])
  })

  // ── New: deterministic nearest-first ordering after an out-of-order INSERT ───

  it('keeps jobs ordered nearest-first after an out-of-order INSERT', async () => {
    rpcRows = [
      pendingRow('order-1', { distance_km: 1.2, lat: 32.0853, lng: 34.7818 }),
      pendingRow('order-2', { distance_km: 3.7, lat: 32.0900, lng: 34.7900 }),
    ]
    const { result } = renderHook(() => useNearbyJobs(WASHER, true))
    await waitFor(() => expect(result.current.jobs).toHaveLength(2))

    // Inserted order is CLOSER than both existing rows (~1.11 km < 1.2 km), so a
    // naive append would put it last — it must instead sort to the front.
    act(() => {
      realtimeHandler({
        eventType: 'INSERT',
        new: pendingRow('order-near', { lat: 32.01, lng: 34.8 }),
        old: {},
      })
    })

    await waitFor(() => expect(result.current.jobs).toHaveLength(3))

    const distances = result.current.jobs.map(j => j.distance_km)
    const sortedAsc = [...distances].sort((a, b) => a - b)
    expect(distances).toEqual(sortedAsc)            // nearest-first preserved
    expect(result.current.jobs[0].id).toBe('order-near') // closest row leads
  })
})
