import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { useAgentQueue } from '../hooks/useAgentQueue.js'

// ── Mocks ────────────────────────────────────────────────────────────────────

let queueCallback = null

const mockChannel = {
  on: vi.fn(),
  subscribe: vi.fn(),
}

mockChannel.on.mockImplementation((event, filter, cb) => {
  if (event === 'postgres_changes' && table(filter) === 'support_conversations') {
    queueCallback = cb
  }
  return mockChannel
})
mockChannel.subscribe.mockReturnValue(mockChannel)

function table(filter) {
  return typeof filter === 'object' ? filter.table : null
}

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    channel: vi.fn(() => mockChannel),
    removeChannel: vi.fn(),
  },
}))

// fetchConversations returns different data on each call so we can observe changes
const fetchConversationsMock = vi.fn()

vi.mock('../lib/support.js', () => ({
  fetchConversations: (...args) => fetchConversationsMock(...args),
}))

function makeConv(id, assigned = null) {
  return {
    id,
    assigned_agent_id: assigned,
    status:            assigned ? 'assigned' : 'pending_agent',
    opener:            { full_name: `User ${id}`, role: 'consumer' },
    opener_role:       'consumer',
    last_message_at:   null,
    created_at:        new Date().toISOString(),
    subject:           null,
    order_id:          null,
  }
}

// ── Helper wrapper ───────────────────────────────────────────────────────────

function QueueWrapper({ agentId }) {
  const { unassigned, mine } = useAgentQueue(agentId)
  return (
    <div>
      <ul data-testid="unassigned-list">
        {unassigned.map(c => <li key={c.id} data-testid={`unassigned-${c.id}`}>{c.id}</li>)}
      </ul>
      <ul data-testid="mine-list">
        {mine.map(c => <li key={c.id} data-testid={`mine-${c.id}`}>{c.id}</li>)}
      </ul>
    </div>
  )
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useAgentQueue — realtime', () => {
  beforeEach(() => {
    queueCallback = null
    mockChannel.on.mockClear().mockImplementation((event, filter, cb) => {
      if (event === 'postgres_changes' && table(filter) === 'support_conversations') {
        queueCallback = cb
      }
      return mockChannel
    })
    mockChannel.subscribe.mockClear().mockReturnValue(mockChannel)
    fetchConversationsMock.mockClear()
  })

  it('new unassigned conversation appears after realtime event triggers reload', async () => {
    fetchConversationsMock
      .mockResolvedValueOnce({ data: [],                            error: null })
      .mockResolvedValueOnce({ data: [makeConv('conv-new', null)], error: null })

    render(<QueueWrapper agentId="agent-1" />)

    // Wait for initial load to complete (empty)
    await waitFor(() => expect(fetchConversationsMock).toHaveBeenCalledTimes(1))
    expect(screen.queryByTestId('unassigned-conv-new')).not.toBeInTheDocument()

    // Simulate DB change event
    expect(queueCallback).not.toBeNull()
    await act(async () => { queueCallback({}) })

    // The queue re-fetches and the new conversation appears
    await waitFor(() => expect(screen.getByTestId('unassigned-conv-new')).toBeInTheDocument())
  })

  it('conversation moves from unassigned to mine when assigned_agent_id is set to current agent', async () => {
    fetchConversationsMock
      .mockResolvedValueOnce({ data: [makeConv('conv-1', null)],       error: null })
      .mockResolvedValueOnce({ data: [makeConv('conv-1', 'agent-1')],  error: null })

    render(<QueueWrapper agentId="agent-1" />)

    // Initially in unassigned
    await waitFor(() => expect(screen.getByTestId('unassigned-conv-1')).toBeInTheDocument())
    expect(screen.queryByTestId('mine-conv-1')).not.toBeInTheDocument()

    // Simulate claim event
    await act(async () => { queueCallback({}) })

    // Now in mine, not unassigned
    await waitFor(() => expect(screen.getByTestId('mine-conv-1')).toBeInTheDocument())
    expect(screen.queryByTestId('unassigned-conv-1')).not.toBeInTheDocument()
  })

  it('channel is subscribed to support_conversations on any event', async () => {
    fetchConversationsMock.mockResolvedValue({ data: [], error: null })
    render(<QueueWrapper agentId="agent-1" />)

    await waitFor(() => expect(queueCallback).not.toBeNull())

    const { supabase } = await import('../lib/supabase.js')
    expect(supabase.channel).toHaveBeenCalled()
    expect(mockChannel.subscribe).toHaveBeenCalled()
  })
})
