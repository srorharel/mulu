import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    channel: vi.fn(() => ({
      on:           vi.fn().mockReturnThis(),
      subscribe:    vi.fn().mockReturnThis(),
      presenceState: vi.fn().mockReturnValue({}),
    })),
    removeChannel: vi.fn(),
  },
}))
vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { id: 'u1' }, profile: { full_name: 'Test User', role: 'consumer' } }),
}))
vi.mock('../components/ui/Toast.jsx', () => ({ useToast: () => vi.fn() }))
vi.mock('../lib/support.js', () => ({
  sendMessage:            vi.fn().mockResolvedValue({}),
  markRead:               vi.fn().mockResolvedValue({}),
  uploadAttachment:       vi.fn().mockResolvedValue({ data: { path: 'p' }, error: null }),
  getAttachmentSignedUrl: vi.fn().mockResolvedValue(null),
  subscribeToConversation: vi.fn(() => ({})),
}))
vi.mock('../hooks/useSupportConversation.js', () => ({
  useSupportConversation: vi.fn(),
}))

import { useSupportConversation } from '../hooks/useSupportConversation.js'
import SupportChatSheet from '../components/support/SupportChatSheet.jsx'

const i18n = i18next.createInstance()
i18n.use(initReactI18next).init({
  resources: { en: { translation: {
    'support.waitingForAgent':    'Waiting for agent...',
    'support.chattingWith':       'Chatting with {{name}}',
    'support.agentBadge':         'Support',
    'support.typing':             '{{name}} is typing...',
    'support.conversationClosed': 'Conversation closed',
    'support.emptyDesc':          'No messages yet.',
    'support.sendPlaceholder':    'Type a message...',
    'support.send':               'Send',
    'support.attachImage':        'Attach image',
    'support.seen':               'Seen',
  } } },
  lng: 'en', fallbackLng: 'en',
})
const wrapper = ({ children }) => <I18nextProvider i18n={i18n}>{children}</I18nextProvider>

const BASE_CONV = { id: 'c1', order_id: null, agent_last_read_at: null, opener_last_read_at: null }

describe('SupportChatSheet — pre-claim state', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('shows "Waiting for agent..." when no agent is assigned', () => {
    useSupportConversation.mockReturnValue({
      conversation: { ...BASE_CONV, status: 'pending_agent', agent: null },
      messages: [], loading: false,
    })
    render(<SupportChatSheet open convId="c1" onClose={vi.fn()} />, { wrapper })
    expect(screen.getByTestId('support-header-title')).toHaveTextContent('Waiting for agent...')
  })

  it('shows "Waiting for agent..." regardless of last_message_body being set', () => {
    useSupportConversation.mockReturnValue({
      conversation: {
        ...BASE_CONV, status: 'pending_agent',
        last_message_body: 'Hello, I need help',
        agent: null,
      },
      messages: [], loading: false,
    })
    render(<SupportChatSheet open convId="c1" onClose={vi.fn()} />, { wrapper })
    const header = screen.getByTestId('support-header-title')
    expect(header).toHaveTextContent('Waiting for agent...')
    expect(header).not.toHaveTextContent('Hello, I need help')
  })

  it('pre-claim header text is not pulled from subject, messages, or any other field', () => {
    useSupportConversation.mockReturnValue({
      conversation: {
        ...BASE_CONV, status: 'pending_agent',
        subject: 'My vehicle was damaged',
        last_message_body: 'Can someone help?',
        agent: null,
      },
      messages: [
        { id: 'm1', body: 'Can someone help?', sender_id: 'u1', sender_role: 'consumer', created_at: new Date().toISOString() },
      ],
      loading: false,
    })
    render(<SupportChatSheet open convId="c1" onClose={vi.fn()} />, { wrapper })
    const header = screen.getByTestId('support-header-title')
    expect(header).toHaveTextContent('Waiting for agent...')
    expect(header).not.toHaveTextContent('My vehicle was damaged')
    expect(header).not.toHaveTextContent('Can someone help?')
  })

  it('pre-claim: even with null conversation the header does not crash', () => {
    useSupportConversation.mockReturnValue({
      conversation: null,
      messages: [], loading: false,
    })
    render(<SupportChatSheet open convId="c1" onClose={vi.fn()} />, { wrapper })
    // Component must not throw; header shows waiting state
    expect(screen.getByTestId('support-header-title')).toHaveTextContent('Waiting for agent...')
  })
})
