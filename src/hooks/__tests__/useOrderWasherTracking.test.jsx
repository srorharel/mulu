import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }))

vi.mock('../../lib/supabase.js', () => ({
  supabase: { rpc: (...args) => rpcMock(...args) },
}))

import { useOrderWasherTracking } from '../useOrderWasherTracking.js'

const JOB = { jobLat: 32.05, jobLng: 34.80 }
const row = (over = {}) => ({
  washer_id: 'w1', lat: 32.00, lng: 34.80,
  updated_at: new Date().toISOString(), status: 'en_route', ...over,
})

beforeEach(() => {
  vi.useFakeTimers()
  rpcMock.mockReset()
  rpcMock.mockResolvedValue({ data: [], error: null })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useOrderWasherTracking', () => {
  it('en_route: populates location + etaMin and polls on a 6s interval', async () => {
    rpcMock.mockResolvedValue({ data: [row()], error: null })

    const { result } = renderHook(() =>
      useOrderWasherTracking({ orderId: 'o1', status: 'en_route', ...JOB }))

    // Immediate first poll with the right RPC name + args.
    expect(rpcMock).toHaveBeenCalledWith('get_order_washer_location', { p_order_id: 'o1' })

    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.location).toMatchObject({ lat: 32.00, lng: 34.80 })
    expect(result.current.etaMin).toBeGreaterThan(0)

    const before = rpcMock.mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(6000) })
    expect(rpcMock.mock.calls.length).toBe(before + 1)
  })

  it('pending: never polls and location stays null', async () => {
    const { result } = renderHook(() =>
      useOrderWasherTracking({ orderId: 'o1', status: 'pending', ...JOB }))

    await act(async () => { await vi.advanceTimersByTimeAsync(12000) })
    expect(rpcMock).not.toHaveBeenCalled()
    expect(result.current.location).toBeNull()
    expect(result.current.etaMin).toBeNull()
  })

  it('stops polling once status leaves the active set (en_route -> completed)', async () => {
    rpcMock.mockResolvedValue({ data: [row()], error: null })

    const { rerender } = renderHook(
      (props) => useOrderWasherTracking(props),
      { initialProps: { orderId: 'o1', status: 'en_route', ...JOB } },
    )
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(rpcMock).toHaveBeenCalled()

    rerender({ orderId: 'o1', status: 'completed', ...JOB })
    const after = rpcMock.mock.calls.length
    await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
    expect(rpcMock.mock.calls.length).toBe(after) // no further polls
  })

  it('empty rpc result: location null, no throw', async () => {
    rpcMock.mockResolvedValue({ data: [], error: null })

    const { result } = renderHook(() =>
      useOrderWasherTracking({ orderId: 'o1', status: 'arrived', ...JOB }))

    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(result.current.location).toBeNull()
    expect(result.current.etaMin).toBeNull()
  })
})
