import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// Supabase — channels must not crash but never need real data
const mockChannel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }
vi.mock('../lib/supabase.js', () => ({
  supabase: {
    channel:       vi.fn(() => mockChannel),
    removeChannel: vi.fn(),
    from:          vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockResolvedValue({ count: 0 }),
    })),
  },
}))

vi.mock('../lib/approvals.js', () => ({
  fetchPendingApprovals: vi.fn().mockResolvedValue({ data: [], error: null }),
}))
vi.mock('../lib/support.js', () => ({
  claimConversation:  vi.fn(),
  fetchConversations: vi.fn(),
}))

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => ({
    profile:  { id: 'agent-1', role: 'agent', agent_display_name: 'Test Agent' },
    signOut:  vi.fn(),
  }),
}))

vi.mock('../hooks/useAgentQueue.js', () => ({
  useAgentQueue: vi.fn(() => ({
    conversations: [],
    unassigned:    [],
    mine:          [],
    others:        [],
    all:           [],
    loading:       false,
    fetchError:    null,
    reload:        vi.fn(),
  })),
}))

import Dashboard from '../pages/Dashboard.jsx'

function renderDashboard(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/"                              element={<Dashboard />} />
        <Route path="/conversations/:conversationId" element={<Dashboard />} />
        <Route path="/unassigned"                    element={<Dashboard />} />
        <Route path="/settings"                      element={<div>Settings</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('Dashboard — empty queue column', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders the explicit empty state when mine and others are both empty', () => {
    renderDashboard()
    expect(screen.getByTestId('queue-empty')).toBeInTheDocument()
    expect(screen.getByText(/No conversations/)).toBeInTheDocument()
  })

  it('shows the helper subtitle in the empty state', () => {
    renderDashboard()
    expect(screen.getByText('Assigned conversations will appear here')).toBeInTheDocument()
  })

  it('does not render a loading spinner when loading is false', () => {
    renderDashboard()
    expect(screen.queryByTestId('queue-loading')).not.toBeInTheDocument()
  })

  it('does not render the error state when fetchError is null', () => {
    renderDashboard()
    expect(screen.queryByTestId('queue-error')).not.toBeInTheDocument()
  })
})

// Test QueueList error rendering directly (avoids re-mocking useAgentQueue mid-suite)
import { fireEvent } from '@testing-library/react'
import QueueList from '../components/QueueList.jsx'

describe('QueueList — error state', () => {
  it('shows error message and Retry button when fetchError is set', () => {
    const onRetry = vi.fn()
    render(
      <QueueList
        mine={[]} others={[]} agentId="agent-1" selectedId={null}
        onSelect={vi.fn()} loading={false} fetchError="column does not exist" onRetry={onRetry}
      />
    )
    expect(screen.getByTestId('queue-error')).toBeInTheDocument()
    expect(screen.getByText('Failed to load conversations')).toBeInTheDocument()
    expect(screen.getByText('column does not exist')).toBeInTheDocument()
  })

  it('calls onRetry when Retry button is clicked', () => {
    const onRetry = vi.fn()
    render(
      <QueueList
        mine={[]} others={[]} agentId="agent-1" selectedId={null}
        onSelect={vi.fn()} loading={false} fetchError="boom" onRetry={onRetry}
      />
    )
    fireEvent.click(screen.getByText('Retry'))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('shows loading spinner when loading is true', () => {
    render(
      <QueueList
        mine={[]} others={[]} agentId="agent-1" selectedId={null}
        onSelect={vi.fn()} loading={true} fetchError={null} onRetry={vi.fn()}
      />
    )
    expect(screen.getByTestId('queue-loading')).toBeInTheDocument()
  })
})
