import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

const replayAll          = vi.fn().mockResolvedValue([{ id: 'x', outcome: 'done' }])
const getCapturesByOrder = vi.fn().mockResolvedValue([])
let onlineCb = null

vi.mock('../../lib/offlineSync/engine.js', () => ({
  replayAll:          (...a) => replayAll(...a),
  getCapturesByOrder: (...a) => getCapturesByOrder(...a),
}))
vi.mock('../../lib/offlineSync/connectivity.js', () => ({
  isOnlineSync: () => true,
  subscribeOnline: (cb) => { onlineCb = cb; return () => { onlineCb = null } },
}))
vi.mock('../../lib/supabase.js', () => ({ supabase: {}, isSupabaseConfigured: true }))

import { useOfflineSync } from '../useOfflineSync.js'

beforeEach(() => {
  replayAll.mockClear()
  getCapturesByOrder.mockClear()
  onlineCb = null
})

describe('useOfflineSync', () => {
  it('replays the queue on mount (app-init — may have been killed underground)', async () => {
    renderHook(() => useOfflineSync('order-1', { enabled: true }))
    await waitFor(() => expect(replayAll).toHaveBeenCalled())
  })

  it('does NOT engage when disabled (non-underground orders are untouched)', async () => {
    renderHook(() => useOfflineSync('order-1', { enabled: false }))
    // give effects a tick
    await act(async () => { await Promise.resolve() })
    expect(replayAll).not.toHaveBeenCalled()
    expect(getCapturesByOrder).not.toHaveBeenCalled()
  })

  it('replays again when connectivity is restored', async () => {
    renderHook(() => useOfflineSync('order-1', { enabled: true }))
    await waitFor(() => expect(replayAll).toHaveBeenCalledTimes(1))
    await act(async () => { onlineCb && onlineCb(true) })
    await waitFor(() => expect(replayAll).toHaveBeenCalledTimes(2))
  })
})
