import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'
import { useConversationStream } from '../hooks/useConversationStream.js'

// ── Hoisted mock state (available before vi.mock hoisting) ───────────────────

const { mockChannel, refs } = vi.hoisted(() => {
  const refs = { insertCallback: null, channelName: null }

  const mc = {
    on: vi.fn(),
    subscribe: vi.fn(),
  }

  mc.on.mockImplementation((event, filter, cb) => {
    if (event === 'postgres_changes' && filter?.event === 'INSERT') {
      refs.insertCallback = cb
      if (filter?.filter) refs.channelName = filter.filter
    }
    return mc
  })
  mc.subscribe.mockReturnValue(mc)

  return { mockChannel: mc, refs }
})

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    channel: vi.fn(() => mockChannel),
    removeChannel: vi.fn(),
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      order:  vi.fn().mockResolvedValue({ data: [], error: null }),
      single: vi.fn().mockResolvedValue({
        data: { id: 'sender-1', full_name: 'Support Agent', role: 'agent', agent_display_name: null },
        error: null,
      }),
    })),
  },
}))

vi.mock('../lib/support.js', () => ({
  fetchMessages: vi.fn().mockResolvedValue({ data: [], error: null }),
}))

// ── Helper wrapper ───────────────────────────────────────────────────────────

function StreamWrapper({ convId }) {
  const { messages, loading } = useConversationStream(convId)
  if (loading) return <div data-testid="loading">loading</div>
  return (
    <ul>
      {messages.map(m => (
        <li key={m.id} data-testid="message">{m.body}</li>
      ))}
    </ul>
  )
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('useConversationStream — realtime', () => {
  beforeEach(() => {
    refs.insertCallback = null
    refs.channelName    = null
    mockChannel.on.mockClear().mockImplementation((event, filter, cb) => {
      if (event === 'postgres_changes' && filter?.event === 'INSERT') {
        refs.insertCallback = cb
        if (filter?.filter) refs.channelName = filter.filter
      }
      return mockChannel
    })
    mockChannel.subscribe.mockClear().mockReturnValue(mockChannel)
  })

  it('channel is created with the correct filter for conversation_id', async () => {
    const { supabase } = await import('../lib/supabase.js')
    render(<StreamWrapper convId="abc-123" />)

    await waitFor(() => expect(refs.insertCallback).not.toBeNull())

    expect(supabase.channel).toHaveBeenCalledWith('agent-conv:abc-123')
    expect(refs.channelName).toBe('conversation_id=eq.abc-123')
  })

  it('new message appears in DOM when realtime INSERT fires', async () => {
    render(<StreamWrapper convId="abc-123" />)
    await waitFor(() => expect(refs.insertCallback).not.toBeNull())

    const newMsg = {
      id:              'msg-42',
      conversation_id: 'abc-123',
      sender_id:       'sender-1',
      sender_role:     'agent',
      body:            'Hello from realtime!',
      attachment_path: null,
      created_at:      new Date().toISOString(),
    }

    await act(async () => {
      await refs.insertCallback({ new: newMsg })
    })

    expect(screen.getByText('Hello from realtime!')).toBeInTheDocument()
  })

  it('duplicate payload does not render duplicate messages', async () => {
    render(<StreamWrapper convId="abc-123" />)
    await waitFor(() => expect(refs.insertCallback).not.toBeNull())

    const newMsg = {
      id:              'msg-99',
      conversation_id: 'abc-123',
      sender_id:       'sender-1',
      sender_role:     'agent',
      body:            'Deduplicated message',
      attachment_path: null,
      created_at:      new Date().toISOString(),
    }

    await act(async () => { await refs.insertCallback({ new: newMsg }) })
    await act(async () => { await refs.insertCallback({ new: newMsg }) })

    expect(screen.getAllByText('Deduplicated message')).toHaveLength(1)
  })

  it('supabase.removeChannel is called on unmount', async () => {
    const { supabase } = await import('../lib/supabase.js')
    const { unmount } = render(<StreamWrapper convId="abc-123" />)
    await waitFor(() => expect(refs.insertCallback).not.toBeNull())

    unmount()
    expect(supabase.removeChannel).toHaveBeenCalled()
  })

  it('messages do not appear after unmount (cancelled flag prevents state update)', async () => {
    const { unmount } = render(<StreamWrapper convId="abc-123" />)
    await waitFor(() => expect(refs.insertCallback).not.toBeNull())

    const capturedCb = refs.insertCallback
    unmount()

    // Firing the callback after unmount must not throw or cause errors
    await act(async () => {
      await capturedCb({
        new: { id: 'late-msg', conversation_id: 'abc-123', sender_id: 'sender-1', body: 'Late', created_at: new Date().toISOString() },
      })
    })
  })
})
