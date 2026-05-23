import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import QueueItem from '../components/QueueItem.jsx'

function makeConv(overrides = {}) {
  return {
    id:                 'conv-1',
    opener:             { full_name: 'Test User', role: 'consumer' },
    agent:              null,
    last_message_at:    null,
    last_message_body:  overrides.last_message_body ?? null,
    agent_last_read_at: null,
    order_id:           null,
    subject:            overrides.subject ?? null,
    assigned_agent_id:  null,
    unread_count:       0,
    urgent:             false,
    ...overrides,
  }
}

const baseProps = { agentId: 'agent-1', isSelected: false, onClick: () => {} }

describe('QueueItem — preview text', () => {
  it('renders preview text under the opener name', () => {
    const conv = makeConv({ last_message_body: 'Hello, my washer hasn\'t arrived' })
    render(<QueueItem conversation={conv} {...baseProps} />)
    expect(screen.getByText("Hello, my washer hasn't arrived")).toBeInTheDocument()
  })

  it('long preview is present in DOM with truncate class on parent', () => {
    const longPreview = 'A'.repeat(200)
    const conv = makeConv({ last_message_body: longPreview })
    render(<QueueItem conversation={conv} {...baseProps} />)
    const el = screen.getByText(longPreview)
    expect(el.closest('p')).toHaveClass('truncate')
  })

  it('shows "No messages yet" fallback when last_message_body is empty string', () => {
    const conv = makeConv({ last_message_body: '' })
    render(<QueueItem conversation={conv} {...baseProps} />)
    expect(screen.getByText('No messages yet')).toBeInTheDocument()
  })

  it('shows "No messages yet" fallback when last_message_body is null and subject is null', () => {
    const conv = makeConv({ last_message_body: null, subject: null })
    render(<QueueItem conversation={conv} {...baseProps} />)
    expect(screen.getByText('No messages yet')).toBeInTheDocument()
  })

  it('uses subject as fallback when last_message_body is null', () => {
    const conv = makeConv({ last_message_body: null, subject: 'Order issue' })
    render(<QueueItem conversation={conv} {...baseProps} />)
    expect(screen.getByText('Order issue')).toBeInTheDocument()
  })
})
