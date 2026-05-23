import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

// ── Module-level controls ─────────────────────────────────────────────────────
// capturedOnConvUpdate is set when subscribeToConversation is called by the hook
let capturedOnConvUpdate = null
// convSingleFn controls what supabase returns for support_conversations .single()
const convSingleFn = vi.fn()

// ── Mocks ─────────────────────────────────────────────────────────────────────
vi.mock('../lib/support.js', () => ({
  subscribeToConversation: (_convId, { onConvUpdate }) => {
    capturedOnConvUpdate = onConvUpdate
    return {}
  },
  sendMessage:            vi.fn().mockResolvedValue({}),
  markRead:               vi.fn().mockResolvedValue({}),
  uploadAttachment:       vi.fn().mockResolvedValue({ data: { path: 'p' }, error: null }),
  getAttachmentSignedUrl: vi.fn().mockResolvedValue(null),
}))

// Minimal Supabase mock — discriminates by table name so convSingleFn controls
// the support_conversations fetch/re-fetch while messages always return empty.
vi.mock('../lib/supabase.js', () => ({
  supabase: {
    from: (table) => {
      if (table === 'support_conversations') {
        return { select: () => ({ eq: () => ({ single: (...a) => convSingleFn(...a) }) }) }
      }
      // support_messages, profiles, etc.
      return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }), order: () => Promise.resolve({ data: [], error: null }) }) }) }
    },
    removeChannel: () => {},
    channel: () => {
      const ch = { on: () => ch, subscribe: () => ch, presenceState: () => ({}) }
      return ch
    },
  },
}))

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => ({ user: { id: 'u1' }, profile: { full_name: 'Test User', role: 'consumer' } }),
}))
vi.mock('../components/ui/Toast.jsx', () => ({ useToast: () => vi.fn() }))

// ── i18n + wrapper ────────────────────────────────────────────────────────────
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

// ── Fixtures ──────────────────────────────────────────────────────────────────
const CONV_BASE = {
  id: 'c1', status: 'assigned', order_id: null, subject: null,
  opener_id: 'u1', counterparty_id: null, assigned_agent_id: 'a1',
  opener_last_read_at: null, counterparty_last_read_at: null, agent_last_read_at: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}
const AGENT_EMBED = { id: 'a1', agent_display_name: 'Maya', full_name: 'Maya Levi' }

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('SupportChatSheet — shallow merge regression', () => {
  beforeEach(() => {
    capturedOnConvUpdate = null
    convSingleFn.mockReset()
  })

  it('header keeps agent name after UPDATE — re-fetch provides embed, not shallow merge', async () => {
    convSingleFn
      .mockResolvedValueOnce({ data: { ...CONV_BASE, agent: AGENT_EMBED }, error: null }) // initial
      .mockResolvedValueOnce({ data: { ...CONV_BASE, agent: AGENT_EMBED }, error: null }) // re-fetch

    render(<SupportChatSheet open convId="c1" onClose={vi.fn()} />, { wrapper })

    // Initial load: agent is shown
    await waitFor(() => {
      expect(screen.getByTestId('support-header-title')).toHaveTextContent('Chatting with Maya')
    })

    // Fire a realtime UPDATE — raw payload lacks the `agent` embed
    await act(async () => {
      await capturedOnConvUpdate?.({ ...CONV_BASE, last_message_body: 'hello, how can I help you?' })
    })

    // After the re-fetch, header still shows agent name and never shows message body
    await waitFor(() => {
      expect(screen.getByTestId('support-header-title')).toHaveTextContent('Chatting with Maya')
    })
    expect(screen.getByTestId('support-header-title')).not.toHaveTextContent('hello, how can I help you?')
  })

  it('convSingleFn is called twice: once for initial load, once for re-fetch', async () => {
    convSingleFn
      .mockResolvedValueOnce({ data: { ...CONV_BASE, agent: AGENT_EMBED }, error: null })
      .mockResolvedValueOnce({ data: { ...CONV_BASE, agent: AGENT_EMBED }, error: null })

    render(<SupportChatSheet open convId="c1" onClose={vi.fn()} />, { wrapper })
    await waitFor(() => expect(screen.getByTestId('support-header-title')).toHaveTextContent('Chatting with Maya'))

    // Simulate UPDATE (e.g. last_message_body updated by trigger)
    await act(async () => { await capturedOnConvUpdate?.({}) })

    // Re-fetch was called in addition to the initial fetch
    expect(convSingleFn).toHaveBeenCalledTimes(2)
  })

  it('header does not crash when re-fetch fails; never shows message content', async () => {
    convSingleFn
      .mockResolvedValueOnce({ data: { ...CONV_BASE, agent: AGENT_EMBED }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'Network error' } }) // re-fetch fails

    render(<SupportChatSheet open convId="c1" onClose={vi.fn()} />, { wrapper })
    await waitFor(() => expect(screen.getByTestId('support-header-title')).toHaveTextContent('Chatting with Maya'))

    await act(async () => {
      await capturedOnConvUpdate?.({ last_message_body: 'some message content' })
    })

    // Component must not crash; header must not show message content
    const header = screen.getByTestId('support-header-title')
    expect(header).toBeInTheDocument()
    expect(header.textContent).not.toContain('some message content')
  })
})
