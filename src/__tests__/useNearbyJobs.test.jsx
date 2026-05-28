import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// Regression guard for the 0066 nearby_jobs rewrite:
// the RPC must keep returning lat / lng on each row so WorkerMap.jsx can
// render pending-job pins (it reads job.lat / job.lng directly).

let lastRpcArgs = null
let rpcRows     = []

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    rpc: vi.fn((fn, args) => {
      lastRpcArgs = { fn, args }
      return Promise.resolve({ data: rpcRows, error: null })
    }),
    channel: () => ({
      on:        () => ({ subscribe: () => ({}) }),
      subscribe: () => ({}),
    }),
    removeChannel: () => {},
  },
}))

import { useNearbyJobs } from '../hooks/useNearbyJobs.js'

describe('useNearbyJobs', () => {
  beforeEach(() => {
    lastRpcArgs = null
    rpcRows = []
  })

  it('calls the nearby_jobs RPC with the washer position', async () => {
    rpcRows = []
    const { result } = renderHook(() => useNearbyJobs({ lat: 32.0, lng: 34.8 }, true))
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
    const { result } = renderHook(() => useNearbyJobs({ lat: 32.0, lng: 34.8 }, true))
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
})
