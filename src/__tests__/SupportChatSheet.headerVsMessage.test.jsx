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

const BASE_CONV = {
  id: 'c1', order_id: null, agent_last_read_at: null, opener_last_read_at: null,
}

function setup(convOverrides = {}) {
  useSupportConversation.mockReturnValue({
    conversation: { ...BASE_CONV, status: 'assigned', ...convOverrides },
    messages:     [],
    loading:      false,
  })
}

describe('SupportChatSheet — header vs message body', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('shows "Chatting with Maya" not last_message_body when agent is assigned', () => {
    setup({
      last_message_body: 'hello world',
      agent: { id: 'a1', agent_display_name: 'Maya', full_name: 'Maya Levi' },
    })
    render(<SupportChatSheet open convId="c1" onClose={vi.fn()} />, { wrapper })
    const header = screen.getByTestId('support-header-title')
    expect(header).toHaveTextContent('Chatting with Maya')
    expect(header).not.toHaveTextContent('hello world')
  })

  it('header text content does not equal last_message_body', () => {
    const msgBody = 'how can I help you today?'
    setup({
      last_message_body: msgBody,
      agent: { id: 'a1', agent_display_name: 'Agent Roni', full_name: 'Roni Cohen' },
    })
    render(<SupportChatSheet open convId="c1" onClose={vi.fn()} />, { wrapper })
    const headerText = screen.getByTestId('support-header-title').textContent
    expect(headerText).not.toBe(msgBody)
    expect(headerText).not.toContain(msgBody)
  })

  it('shows "Waiting for agent..." even when last_message_body is present', () => {
    setup({
      status:            'pending_agent',
      last_message_body: 'hello, can someone help me?',
      agent:             null,
    })
    render(<SupportChatSheet open convId="c1" onClose={vi.fn()} />, { wrapper })
    const header = screen.getByTestId('support-header-title')
    expect(header).toHaveTextContent('Waiting for agent...')
    expect(header).not.toHaveTextContent('hello, can someone help me?')
  })

  it('header never contains message body for any non-null message', () => {
    const msgBody = 'unique-body-99xyz'
    setup({
      last_message_body: msgBody,
      agent: { id: 'a1', agent_display_name: 'TestAgent', full_name: 'Test' },
    })
    render(<SupportChatSheet open convId="c1" onClose={vi.fn()} />, { wrapper })
    expect(screen.getByTestId('support-header-title').textContent).not.toContain(msgBody)
  })
})
