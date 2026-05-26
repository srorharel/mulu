import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

vi.mock('../hooks/useConversationStream.js', () => ({
  useConversationStream: () => ({ messages: [], loading: false }),
}))
vi.mock('../hooks/useTypingPresence.js', () => ({
  useTypingPresence: () => ({ typingLabel: null, trackTyping: vi.fn() }),
}))
vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => ({
    profile: { id: 'agent-1', full_name: 'Test Agent', agent_display_name: 'TA' },
  }),
}))
vi.mock('../lib/support.js', () => ({
  sendAgentMessage:    vi.fn(),
  claimConversation:   vi.fn(),
  releaseConversation: vi.fn(),
  resolveConversation: vi.fn(),
  markAgentRead:       vi.fn().mockResolvedValue({}),
  uploadAttachment:    vi.fn(),
}))

import ChatPane from '../components/ChatPane.jsx'

const i18n = i18next.createInstance()
i18n.use(initReactI18next).init({
  resources: { en: { translation: {
    'chat.empty':          'No conversation selected',
    'chat.resolve':        'Resolve',
    'chat.release':        'Release to queue',
    'chat.waitingForAgent': 'Waiting for agent',
    'chat.claimedBy':      'Claimed by {{name}}',
    'chat.closed':         'Closed',
    'chat.back':           'Back',
    'chat.info':           'Info',
    'chat.orderChip':      'Order #{{id}}',
    'chat.cannedHint':     'canned',
    'common.error':        'Error',
    'common.orderLinked':  'Order #{{id}}',
    'role.consumer':       'Customer',
    'role.washer':         'Washer',
  } } },
  lng: 'en', fallbackLng: 'en',
})

const wrapper = ({ children }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
)

const ORDER_ID = '12345678-abcd-efgh-ijkl-000000000000'

function makeConv(overrides = {}) {
  return {
    id:                  'conv-1',
    status:              'assigned',
    assigned_agent_id:   'agent-1',
    order_id:            ORDER_ID,
    opener:              { full_name: 'Test User', role: 'consumer' },
    opener_role:         'consumer',
    agent:               { full_name: 'Test Agent', agent_display_name: 'TA' },
    opener_last_read_at: null,
    agent_last_read_at:  null,
    last_message_at:     null,
    ...overrides,
  }
}

describe('ChatPane header — order chip', () => {
  it('order chip is rendered as a button', () => {
    render(
      <ChatPane conversation={makeConv()} onConvUpdate={vi.fn()} onOrderChipClick={vi.fn()} />,
      { wrapper },
    )
    expect(screen.getByTestId('order-chip').tagName).toBe('BUTTON')
  })

  it('order chip shows short ID with leading #', () => {
    render(
      <ChatPane conversation={makeConv()} onConvUpdate={vi.fn()} onOrderChipClick={vi.fn()} />,
      { wrapper },
    )
    expect(screen.getByTestId('order-chip')).toHaveTextContent('#12345678')
  })

  it('clicking order chip calls onOrderChipClick', () => {
    const onChipClick = vi.fn()
    render(
      <ChatPane conversation={makeConv()} onConvUpdate={vi.fn()} onOrderChipClick={onChipClick} />,
      { wrapper },
    )
    fireEvent.click(screen.getByTestId('order-chip'))
    expect(onChipClick).toHaveBeenCalledOnce()
  })

  it('no order chip when conversation has no order_id', () => {
    render(
      <ChatPane conversation={makeConv({ order_id: null })} onConvUpdate={vi.fn()} onOrderChipClick={vi.fn()} />,
      { wrapper },
    )
    expect(screen.queryByTestId('order-chip')).not.toBeInTheDocument()
  })

  it('role pill shows Customer for consumer opener', () => {
    render(
      <ChatPane conversation={makeConv()} onConvUpdate={vi.fn()} onOrderChipClick={vi.fn()} />,
      { wrapper },
    )
    expect(screen.getByText('Customer')).toBeInTheDocument()
  })

  it('role pill shows Washer for washer opener', () => {
    render(
      <ChatPane
        conversation={makeConv({ opener: { full_name: 'John', role: 'washer' }, opener_role: 'washer' })}
        onConvUpdate={vi.fn()}
        onOrderChipClick={vi.fn()}
      />,
      { wrapper },
    )
    expect(screen.getByText('Washer')).toBeInTheDocument()
  })
})
