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
const MAYA = { id: 'a1', agent_display_name: 'Maya', full_name: 'Maya Levi' }

describe('SupportChatSheet — realtime header update', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('transitions from "Waiting for agent..." to "Chatting with Maya" after agent claims', () => {
    useSupportConversation.mockReturnValue({
      conversation: { ...BASE_CONV, status: 'pending_agent', agent: null },
      messages: [], loading: false,
    })
    const { rerender } = render(<SupportChatSheet open convId="c1" onClose={vi.fn()} />, { wrapper })
    expect(screen.getByTestId('support-header-title')).toHaveTextContent('Waiting for agent...')

    // Simulate: hook re-fetches after realtime UPDATE → assigned_agent_id now set, message arrived
    useSupportConversation.mockReturnValue({
      conversation: {
        ...BASE_CONV, status: 'assigned',
        last_message_body: 'hi there',
        agent: MAYA,
      },
      messages: [], loading: false,
    })
    rerender(<SupportChatSheet open convId="c1" onClose={vi.fn()} />)

    expect(screen.getByTestId('support-header-title')).toHaveTextContent('Chatting with Maya')
    expect(screen.getByTestId('support-header-title')).not.toHaveTextContent('hi there')
  })

  it('header is NOT "hi there" after agent sends message', () => {
    useSupportConversation.mockReturnValue({
      conversation: { ...BASE_CONV, status: 'assigned', last_message_body: 'hi there', agent: MAYA },
      messages: [], loading: false,
    })
    render(<SupportChatSheet open convId="c1" onClose={vi.fn()} />, { wrapper })
    const header = screen.getByTestId('support-header-title')
    expect(header).toHaveTextContent('Chatting with Maya')
    expect(header).not.toHaveTextContent('hi there')
  })

  it('header stays "Chatting with Maya" after agent sends a second message', () => {
    useSupportConversation.mockReturnValue({
      conversation: { ...BASE_CONV, status: 'assigned', last_message_body: 'first message', agent: MAYA },
      messages: [], loading: false,
    })
    const { rerender } = render(<SupportChatSheet open convId="c1" onClose={vi.fn()} />, { wrapper })
    expect(screen.getByTestId('support-header-title')).toHaveTextContent('Chatting with Maya')

    useSupportConversation.mockReturnValue({
      conversation: { ...BASE_CONV, status: 'assigned', last_message_body: 'second message', agent: MAYA },
      messages: [], loading: false,
    })
    rerender(<SupportChatSheet open convId="c1" onClose={vi.fn()} />)

    expect(screen.getByTestId('support-header-title')).toHaveTextContent('Chatting with Maya')
    expect(screen.getByTestId('support-header-title')).not.toHaveTextContent('second message')
  })

  it('header does NOT contain "hi there" (snapshot assertion across all above scenarios)', () => {
    useSupportConversation.mockReturnValue({
      conversation: { ...BASE_CONV, status: 'assigned', last_message_body: 'hi there', agent: MAYA },
      messages: [], loading: false,
    })
    render(<SupportChatSheet open convId="c1" onClose={vi.fn()} />, { wrapper })
    expect(screen.getByTestId('support-header-title').textContent).not.toContain('hi there')
  })
})
