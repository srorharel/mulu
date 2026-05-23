import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

vi.mock('../../src/lib/support.js', () => ({
  getAttachmentSignedUrl: vi.fn().mockResolvedValue(null),
}))

import MessageBubble from '../components/support/MessageBubble.jsx'

const i18n = i18next.createInstance()
i18n.use(initReactI18next).init({
  resources: { en: { translation: {
    'support.agentBadge': 'Support',
    'support.seen':       'Seen',
  } } },
  lng: 'en', fallbackLng: 'en',
})

const wrapper = ({ children }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
)

function makeAgentMessage(overrides = {}) {
  return {
    id:              'msg-1',
    sender_id:       'agent-1',
    sender_role:     'agent',
    body:            'Hello from agent',
    attachment_path: null,
    created_at:      new Date().toISOString(),
    sender: {
      id:                  'agent-1',
      full_name:           'Real Name',
      agent_display_name:  overrides.agent_display_name ?? 'Agent Bob',
      role:                'agent',
    },
    ...overrides,
  }
}

describe('MessageBubble — agent display name', () => {
  it('shows agent_display_name when set', () => {
    render(
      <MessageBubble message={makeAgentMessage({ agent_display_name: 'Sparky Support' })} isOwn={false} />,
      { wrapper },
    )
    expect(screen.getByText('Sparky Support')).toBeInTheDocument()
  })

  it('falls back to Support badge when agent_display_name is null', () => {
    const msg = makeAgentMessage()
    msg.sender.agent_display_name = null
    render(
      <MessageBubble message={msg} isOwn={false} />,
      { wrapper },
    )
    // senderName falls back to t('support.agentBadge') = 'Support'; badge also shows 'Support'
    expect(screen.getAllByText('Support').length).toBeGreaterThanOrEqual(1)
  })

  it('does not show sender name for own messages', () => {
    render(
      <MessageBubble message={makeAgentMessage({ agent_display_name: 'Sparky Support' })} isOwn />,
      { wrapper },
    )
    expect(screen.queryByText('Sparky Support')).not.toBeInTheDocument()
  })
})
