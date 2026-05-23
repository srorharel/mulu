import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import QueueList from '../components/QueueList.jsx'

const i18n = i18next.createInstance()
i18n.use(initReactI18next).init({
  resources: { en: { translation: {
    'queue.title':      'Conversations',
    'queue.mine':       'Mine',
    'queue.others':     'Others',
    'queue.assigned':   'Assigned',
    'queue.search':     'Search name or order…',
  } } },
  lng: 'en', fallbackLng: 'en',
})

function makeConv(overrides = {}) {
  return {
    id:                overrides.id ?? 'conv-1',
    opener:            { full_name: overrides.name ?? 'Test User', role: overrides.role ?? 'consumer' },
    agent:             overrides.agent ?? null,
    last_message_at:   null,
    agent_last_read_at: null,
    order_id:          null,
    subject:           null,
    status:            overrides.status ?? 'open',
    assigned_agent_id: overrides.assigned_agent_id ?? null,
    unread_count:      0,
    urgent:            false,
    ...overrides,
  }
}

const wrapper = ({ children }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
)

const baseProps = {
  mine:       [],
  others:     [],
  agentId:    'agent-1',
  selectedId: null,
  onSelect:   vi.fn(),
  loading:    false,
}

describe('QueueList — Assigned(Mine, Others) group ordering', () => {
  it('Mine sub-header appears before Others sub-header in DOM', () => {
    const mine = [makeConv({ id: 'm1', name: 'Alice', assigned_agent_id: 'agent-1' })]
    render(<QueueList {...baseProps} mine={mine} />, { wrapper })
    const mineEl   = screen.getByTestId('group-header-mine')
    const othersEl = screen.getByTestId('group-header-others')
    expect(mineEl.compareDocumentPosition(othersEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('Others rows show assigned agent display name (expand group first)', () => {
    const others = [
      makeConv({
        id:                'o1',
        name:              'Eve',
        assigned_agent_id: 'agent-2',
        agent:             { full_name: 'Agent Robert', agent_display_name: 'Bob' },
      }),
    ]
    render(<QueueList {...baseProps} others={others} />, { wrapper })
    // Others group is collapsed by default — expand it first
    fireEvent.click(screen.getByTestId('group-header-others'))
    expect(screen.getByText('Eve')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('collapses Assigned group hiding Mine items', () => {
    const mine = [makeConv({ id: 'm1', name: 'Alice', assigned_agent_id: 'agent-1' })]
    render(<QueueList {...baseProps} mine={mine} />, { wrapper })
    expect(screen.getByText('Alice')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('group-header-assigned'))
    expect(screen.queryByText('Alice')).not.toBeInTheDocument()
  })

  it('Assigned header count sums Mine + Others', () => {
    const mine   = [makeConv({ id: 'm1', name: 'Alice', assigned_agent_id: 'agent-1' })]
    const others = [
      makeConv({ id: 'o1', name: 'Dave', assigned_agent_id: 'agent-2' }),
      makeConv({ id: 'o2', name: 'Eve',  assigned_agent_id: 'agent-2' }),
    ]
    render(<QueueList {...baseProps} mine={mine} others={others} />, { wrapper })
    expect(screen.getByTestId('group-header-assigned')).toHaveTextContent('3')
  })

  it('expanding Others group shows other-agent rows', () => {
    const others = [makeConv({ id: 'o1', name: 'Frank', assigned_agent_id: 'agent-2' })]
    render(<QueueList {...baseProps} others={others} />, { wrapper })
    // Initially collapsed
    expect(screen.queryByText('Frank')).not.toBeInTheDocument()
    // Expand
    fireEvent.click(screen.getByTestId('group-header-others'))
    expect(screen.getByText('Frank')).toBeInTheDocument()
  })
})
