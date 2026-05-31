import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k) => k, i18n: { language: 'en' } }),
}))

// supabase is only touched for removeChannel cleanup here.
vi.mock('../lib/supabase.js', () => ({ supabase: { removeChannel: vi.fn() } }))

const CONVERSATIONS = [
  { id: 'c1', status: 'assigned', opener_role: 'consumer', assigned_agent_id: 'a1',
    last_message_body: 'my car is still dirty', last_message_at: '2026-05-30T10:00:00Z', order_id: null,
    opener: { id: 'u1', full_name: 'Dana Consumer', role: 'consumer' },
    agent:  { id: 'a1', full_name: 'Agent Smith', agent_display_name: 'Smith' } },
  { id: 'c2', status: 'open', opener_role: 'washer', assigned_agent_id: null,
    last_message_body: 'payout question', last_message_at: '2026-05-29T09:00:00Z', order_id: null,
    opener: { id: 'u2', full_name: 'Moshe Washer', role: 'washer' }, agent: null },
]
const MESSAGES = {
  c1: [
    { id: 'm1', conversation_id: 'c1', sender_id: 'u1', sender_role: 'consumer', body: 'my car is still dirty',
      attachment_path: null, created_at: '2026-05-30T10:00:00Z', sender: { full_name: 'Dana Consumer', role: 'consumer' } },
    { id: 'm2', conversation_id: 'c1', sender_id: 'a1', sender_role: 'agent', body: 'sorry to hear that, let me check',
      attachment_path: null, created_at: '2026-05-30T10:05:00Z', sender: { full_name: 'Agent Smith', agent_display_name: 'Smith', role: 'agent' } },
  ],
}

vi.mock('../lib/adminChats.js', () => ({
  CONVERSATION_STATUSES: ['open', 'pending_agent', 'assigned', 'resolved', 'closed'],
  fetchConversations: vi.fn(() => Promise.resolve(CONVERSATIONS)),
  fetchMessages: vi.fn((id) => Promise.resolve(MESSAGES[id] ?? [])),
  fetchSenderBrief: vi.fn(() => Promise.resolve(null)),
  subscribeConversations: vi.fn(() => ({})),
  subscribeMessages: vi.fn(() => ({})),
  attachmentPublicUrl: vi.fn((p) => `https://cdn/${p}`),
  conversationStatusClass: () => '',
  roleBadgeClass: () => '',
  partyOf: (c) => ({ name: c?.opener?.full_name || '—', role: c?.opener_role || c?.opener?.role || null, id: c?.opener_id }),
  agentNameOf: (c) => (c?.assigned_agent_id ? (c?.agent?.agent_display_name || c?.agent?.full_name) : null),
}))

import Chats from '../pages/Chats.jsx'

// Assert there is no compose affordance anywhere in the rendered tree.
function assertNoComposeAffordance(container) {
  // No multiline composer, no text input (the only input is the search box, type=search).
  expect(container.querySelector('textarea')).toBeNull()
  expect(container.querySelector('input[type="text"]')).toBeNull()
  expect(screen.queryByRole('textbox')).toBeNull()
  // No send / reply button. (Note: "resolved"/"closed" appear only as read-only
  // STATUS FILTER pills in the list — those are not write affordances.)
  const buttons = screen.queryAllByRole('button')
  for (const b of buttons) {
    expect(b.textContent || '').not.toMatch(/send|reply/i)
  }
}

describe('admin Chats — read-only conversation viewer', () => {
  it('renders the conversation list', async () => {
    render(<Chats />)
    expect(await screen.findByText('Dana Consumer')).toBeInTheDocument()
    expect(screen.getByText('Moshe Washer')).toBeInTheDocument()
    expect(screen.getByText('my car is still dirty')).toBeInTheDocument()
  })

  it('shows the selected conversation\'s messages when a row is clicked', async () => {
    render(<Chats />)
    const row = await screen.findByRole('button', { name: /Dana Consumer/ })
    fireEvent.click(row)
    // The agent reply from c1's history now appears in the thread pane.
    expect(await screen.findByText('sorry to hear that, let me check')).toBeInTheDocument()
    // Read-only banner is present.
    expect(screen.getByText(/Read-only view/i)).toBeInTheDocument()
  })

  it('has NO send button / text input / compose box anywhere (read-only guarantee)', async () => {
    const { container } = render(<Chats />)
    // Before selection…
    assertNoComposeAffordance(container)
    // …and after opening a conversation thread.
    const row = await screen.findByRole('button', { name: /Dana Consumer/ })
    fireEvent.click(row)
    await screen.findByText('sorry to hear that, let me check')
    assertNoComposeAffordance(container)
  })

  it('renders an attachment as a link (never inline-editable), not a compose box', async () => {
    // Swap in a message that carries an attachment.
    const { fetchMessages } = await import('../lib/adminChats.js')
    fetchMessages.mockImplementationOnce(() => Promise.resolve([
      { id: 'm3', conversation_id: 'c1', sender_id: 'u1', sender_role: 'consumer', body: null,
        attachment_path: 'c1/photo.jpg', created_at: '2026-05-30T11:00:00Z', sender: { full_name: 'Dana Consumer', role: 'consumer' } },
    ]))
    render(<Chats />)
    const row = await screen.findByRole('button', { name: /Dana Consumer/ })
    fireEvent.click(row)
    const link = await screen.findByRole('link', { name: /attachment/i })
    expect(link).toHaveAttribute('href', 'https://cdn/c1/photo.jpg')
  })
})
