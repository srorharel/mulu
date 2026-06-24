import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// Mock supabase channel subscription
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
  fetchClosedConversations: vi.fn(() => Promise.resolve({ data: [], error: null })),
}))

import { fetchConversations } from '../lib/support.js'
import { useAgentQueue }      from '../hooks/useAgentQueue.js'

function makeConv(overrides = {}) {
  return {
    id:                'conv-1',
    status:            'pending_agent',
    assigned_agent_id: null,
    last_message_at:   null,
    last_message_body: overrides.last_message_body ?? null,
    opener:            { full_name: 'Test User', role: 'consumer' },
    ...overrides,
  }
}

describe('useAgentQueue — last_message_body (preview)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockChannel.on.mockReturnThis()
    mockChannel.subscribe.mockReturnThis()
  })

  it('exposes last_message_body on returned conversations', async () => {
    fetchConversations.mockResolvedValue({
      data: [makeConv({ last_message_body: 'Hi there!' })],
    })

    const { result } = renderHook(() => useAgentQueue('agent-1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.conversations[0].last_message_body).toBe('Hi there!')
  })

  it('returns null last_message_body for new conversations with no messages', async () => {
    fetchConversations.mockResolvedValue({
      data: [makeConv({ last_message_body: null })],
    })

    const { result } = renderHook(() => useAgentQueue('agent-1'))

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.conversations[0].last_message_body).toBeNull()
  })

  it('reflects updated last_message_body when reload is called', async () => {
    fetchConversations
      .mockResolvedValueOnce({ data: [makeConv({ last_message_body: 'First' })] })
      .mockResolvedValueOnce({ data: [makeConv({ last_message_body: 'Updated preview' })] })

    const { result } = renderHook(() => useAgentQueue('agent-1'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.conversations[0].last_message_body).toBe('First')

    await act(() => result.current.reload())

    expect(result.current.conversations[0].last_message_body).toBe('Updated preview')
  })
})
