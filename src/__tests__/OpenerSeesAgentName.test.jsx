import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

// Mock supabase (presence channel used by typing indicator)
vi.mock('../lib/supabase.js', () => ({
  supabase: {
    channel: vi.fn(() => ({
      on:           vi.fn().mockReturnThis(),
      subscribe:    vi.fn().mockReturnThis(),
      track:        vi.fn(),
      presenceState: vi.fn().mockReturnValue({}),
    })),
    removeChannel: vi.fn(),
  },
}))

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => ({
    user:    { id: 'user-1' },
    profile: { full_name: 'Test User', role: 'consumer' },
  }),
}))

vi.mock('../components/ui/Toast.jsx', () => ({
  useToast: () => vi.fn(),
}))

vi.mock('../lib/support.js', () => ({
  sendMessage:         vi.fn().mockResolvedValue({}),
  markRead:            vi.fn().mockResolvedValue({}),
  uploadAttachment:    vi.fn().mockResolvedValue({ data: { path: 'p' }, error: null }),
  getAttachmentSignedUrl: vi.fn().mockResolvedValue(null),
  subscribeToConversation: vi.fn(() => ({ on: vi.fn(), subscribe: vi.fn() })),
}))

// Controllable mock for useSupportConversation
vi.mock('../hooks/useSupportConversation.js', () => ({
  useSupportConversation: vi.fn(),
}))

import { useSupportConversation } from '../hooks/useSupportConversation.js'
import SupportChatSheet from '../components/support/SupportChatSheet.jsx'

const i18n = i18next.createInstance()
i18n.use(initReactI18next).init({
  resources: { en: { translation: {
    'support.waitingForAgent': 'Waiting for agent...',
    'support.chattingWith':    'Chatting with {{name}}',
    'support.agentBadge':      'Support',
    'support.seen':            'Seen',
    'support.typing':          '{{name}} is typing...',
    'support.conversationClosed': 'This conversation is closed',
    'support.emptyDesc':       'Need help? Start a new conversation.',
    'support.sendPlaceholder': 'Type a message...',
    'support.send':            'Send',
    'support.attachImage':     'Attach image',
  } } },
  lng: 'en', fallbackLng: 'en',
})

const wrapper = ({ children }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
)

function setupMock(overrides = {}) {
  useSupportConversation.mockReturnValue({
    conversation: overrides.conversation ?? null,
    messages:     overrides.messages ?? [],
    loading:      overrides.loading ?? false,
  })
}

describe('SupportChatSheet — opener sees agent name', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows "Waiting for agent..." when assigned_agent_id is null', () => {
    setupMock({ conversation: { id: 'c1', status: 'pending_agent', agent: null, order_id: null, agent_last_read_at: null, opener_last_read_at: null } })
    render(<SupportChatSheet open convId="c1" onClose={vi.fn()} />, { wrapper })
    expect(screen.getByTestId('support-header-title')).toHaveTextContent('Waiting for agent...')
  })

  it('shows "Chatting with Maya from Wash" when agent has agent_display_name', () => {
    setupMock({
      conversation: {
        id: 'c1', status: 'assigned', order_id: null,
        agent_last_read_at: null, opener_last_read_at: null,
        agent: { id: 'a1', agent_display_name: 'Maya from Wash', full_name: 'Maya Levi' },
      },
    })
    render(<SupportChatSheet open convId="c1" onClose={vi.fn()} />, { wrapper })
    expect(screen.getByTestId('support-header-title')).toHaveTextContent('Chatting with Maya from Wash')
  })

  it('falls back to full_name when agent_display_name is null', () => {
    setupMock({
      conversation: {
        id: 'c1', status: 'assigned', order_id: null,
        agent_last_read_at: null, opener_last_read_at: null,
        agent: { id: 'a1', agent_display_name: null, full_name: 'Maya Levi' },
      },
    })
    render(<SupportChatSheet open convId="c1" onClose={vi.fn()} />, { wrapper })
    expect(screen.getByTestId('support-header-title')).toHaveTextContent('Chatting with Maya Levi')
  })

  it('reverts to "Waiting for agent..." when agent is removed', () => {
    setupMock({
      conversation: {
        id: 'c1', status: 'pending_agent', order_id: null,
        agent_last_read_at: null, opener_last_read_at: null,
        agent: null,
      },
    })
    render(<SupportChatSheet open convId="c1" onClose={vi.fn()} />, { wrapper })
    expect(screen.getByTestId('support-header-title')).toHaveTextContent('Waiting for agent...')
  })

  it('renders agent avatar initials when agent is assigned', () => {
    setupMock({
      conversation: {
        id: 'c1', status: 'assigned', order_id: null,
        agent_last_read_at: null, opener_last_read_at: null,
        agent: { id: 'a1', agent_display_name: 'Maya from Wash', full_name: 'Maya Levi' },
      },
    })
    render(<SupportChatSheet open convId="c1" onClose={vi.fn()} />, { wrapper })
    // Avatar shows first letters: "MF" (Maya from Wash → M + F)
    expect(document.querySelector('.ring-emerald-500')).toBeInTheDocument()
  })
})
