import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

const mockChannel = {
  on:        vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
}
vi.mock('../lib/supabase.js', () => ({
  supabase: {
    channel:       vi.fn(() => mockChannel),
    removeChannel: vi.fn(),
  },
}))

vi.mock('../lib/support.js', () => ({
  fetchConversations: vi.fn(),
}))

import { fetchConversations } from '../lib/support.js'
import { useAgentQueue }      from '../hooks/useAgentQueue.js'

const AGENT_ID  = 'agent-abc'
const OTHER_ID  = 'agent-xyz'

function makeConv(id, assigned_agent_id) {
  return { id, assigned_agent_id, status: 'pending_agent', last_message_at: null, last_message_body: null, opener: { full_name: 'User', role: 'consumer' } }
}

describe('useAgentQueue — conversation visibility buckets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockChannel.on.mockReturnThis()
    mockChannel.subscribe.mockReturnThis()
  })

  it('splits conversations into unassigned, mine, and others buckets correctly', async () => {
    fetchConversations.mockResolvedValue({
      data: [
        makeConv('u1', null),
        makeConv('u2', null),
        makeConv('m1', AGENT_ID),
        makeConv('o1', OTHER_ID),
        makeConv('o2', OTHER_ID),
      ],
    })

    const { result } = renderHook(() => useAgentQueue(AGENT_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.unassigned).toHaveLength(2)
    expect(result.current.mine).toHaveLength(1)
    expect(result.current.others).toHaveLength(2)
    expect(result.current.all).toHaveLength(5)
  })

  it('unassigned bucket contains only conversations with no assigned_agent_id', async () => {
    fetchConversations.mockResolvedValue({
      data: [makeConv('u1', null), makeConv('m1', AGENT_ID)],
    })

    const { result } = renderHook(() => useAgentQueue(AGENT_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.unassigned.map(c => c.id)).toEqual(['u1'])
  })

  it('mine bucket contains only conversations assigned to the current agent', async () => {
    fetchConversations.mockResolvedValue({
      data: [makeConv('m1', AGENT_ID), makeConv('o1', OTHER_ID), makeConv('u1', null)],
    })

    const { result } = renderHook(() => useAgentQueue(AGENT_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.mine.map(c => c.id)).toEqual(['m1'])
  })

  it('returns empty arrays and does not crash when agentId is undefined', () => {
    const { result } = renderHook(() => useAgentQueue(undefined))

    expect(result.current.unassigned).toEqual([])
    expect(result.current.mine).toEqual([])
    expect(result.current.others).toEqual([])
    expect(result.current.loading).toBe(true)
    expect(fetchConversations).not.toHaveBeenCalled()
  })

  it('fetches once agentId becomes defined after initial undefined', async () => {
    fetchConversations.mockResolvedValue({ data: [makeConv('m1', AGENT_ID)] })

    const { result, rerender } = renderHook(({ id }) => useAgentQueue(id), {
      initialProps: { id: undefined },
    })

    expect(fetchConversations).not.toHaveBeenCalled()

    rerender({ id: AGENT_ID })
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(fetchConversations).toHaveBeenCalledOnce()
    expect(result.current.mine).toHaveLength(1)
  })

  it('exposes fetchError when fetchConversations fails', async () => {
    fetchConversations.mockResolvedValue({ data: null, error: { message: 'column does not exist' } })

    const { result } = renderHook(() => useAgentQueue(AGENT_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.fetchError).toBe('column does not exist')
    expect(result.current.conversations).toEqual([])
  })

  it('clears fetchError on successful reload after a prior failure', async () => {
    fetchConversations
      .mockResolvedValueOnce({ data: null, error: { message: 'oops' } })
      .mockResolvedValueOnce({ data: [makeConv('m1', AGENT_ID)], error: null })

    const { result } = renderHook(() => useAgentQueue(AGENT_ID))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.fetchError).toBe('oops')

    await act(() => result.current.reload())
    expect(result.current.fetchError).toBeNull()
    expect(result.current.mine).toHaveLength(1)
  })
})
