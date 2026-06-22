import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'

// useConsumerActiveOrders keeps the /home live-wash card current:
//  - initial fetch loads the consumer's active orders,
//  - a realtime UPDATE advances an order's status in place (card progresses),
//  - a terminal status (completed/cancelled) drops the row (card disappears).

let rows = []
const handlers = {}

vi.mock('../lib/supabase.js', () => {
  const builder = {
    select: () => builder,
    eq:     () => builder,
    in:     () => builder,
    not:    () => builder,
    order:  () => builder,
    then:   (cb) => Promise.resolve({ data: rows, error: null }).then(cb),
  }
  return {
    supabase: {
      from: () => builder,
      channel: () => {
        const ch = {
          on: (_evt, config, cb) => { handlers[config.event] = cb; return ch },
          subscribe: () => ch,
        }
        return ch
      },
      removeChannel: () => {},
    },
    isSupabaseConfigured: true,
  }
})

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { id: 'u1' } }),
}))
vi.mock('../hooks/useAppForeground.js', () => ({ useAppForeground: () => {} }))

import { useConsumerActiveOrders } from '../hooks/useConsumerActiveOrders.js'

// paid_at defaults to a timestamp — an order only counts as a live wash once paid.
function order(id, status, created_at = '2026-06-01T10:00:00.000Z', paid_at = '2026-06-01T09:00:00.000Z') {
  return { id, status, address_label: 'Sokolov 12', total_price: 100, created_at, paid_at }
}

beforeEach(() => {
  rows = []
  for (const k of Object.keys(handlers)) delete handlers[k]
})

describe('useConsumerActiveOrders — live', () => {
  it('loads the consumer active orders on mount', async () => {
    rows = [order('o1', 'en_route')]
    const { result } = renderHook(() => useConsumerActiveOrders())
    await waitFor(() => expect(result.current.orders).toHaveLength(1))
    expect(result.current.orders[0].status).toBe('en_route')
  })

  it('advances an order status in place on a realtime UPDATE', async () => {
    rows = [order('o1', 'accepted')]
    const { result } = renderHook(() => useConsumerActiveOrders())
    await waitFor(() => expect(result.current.orders).toHaveLength(1))

    act(() => handlers.UPDATE({ new: order('o1', 'in_progress') }))
    expect(result.current.orders[0].status).toBe('in_progress')
    expect(result.current.orders).toHaveLength(1)
  })

  it('drops the order when it reaches a terminal status', async () => {
    rows = [order('o1', 'in_progress')]
    const { result } = renderHook(() => useConsumerActiveOrders())
    await waitFor(() => expect(result.current.orders).toHaveLength(1))

    act(() => handlers.UPDATE({ new: order('o1', 'completed') }))
    expect(result.current.orders).toHaveLength(0)
  })

  it('adds a newly active (paid) order via realtime, newest first', async () => {
    rows = [order('o1', 'en_route', '2026-06-01T10:00:00.000Z')]
    const { result } = renderHook(() => useConsumerActiveOrders())
    await waitFor(() => expect(result.current.orders).toHaveLength(1))

    act(() => handlers.INSERT({ new: order('o2', 'pending', '2026-06-02T10:00:00.000Z') }))
    expect(result.current.orders.map(o => o.id)).toEqual(['o2', 'o1'])
  })

  it('does NOT surface an unpaid pending order (payment not completed)', async () => {
    rows = [order('o1', 'en_route')]
    const { result } = renderHook(() => useConsumerActiveOrders())
    await waitFor(() => expect(result.current.orders).toHaveLength(1))

    // Booked but checkout abandoned → paid_at null → must not show as a live wash.
    act(() => handlers.INSERT({ new: order('o2', 'pending', '2026-06-02T10:00:00.000Z', null) }))
    expect(result.current.orders.map(o => o.id)).toEqual(['o1'])
  })

  it('surfaces the order the moment payment completes (paid_at set)', async () => {
    rows = []
    const { result } = renderHook(() => useConsumerActiveOrders())
    await waitFor(() => expect(result.current.loading).toBe(false))

    // Unpaid booking → hidden.
    act(() => handlers.INSERT({ new: order('o1', 'pending', '2026-06-02T10:00:00.000Z', null) }))
    expect(result.current.orders).toHaveLength(0)

    // Payment passes → paid_at set on the same row → card appears.
    act(() => handlers.UPDATE({ new: order('o1', 'pending', '2026-06-02T10:00:00.000Z', '2026-06-02T10:05:00.000Z') }))
    expect(result.current.orders.map(o => o.id)).toEqual(['o1'])
  })
})
