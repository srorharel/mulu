import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import QueueList from '../components/QueueList.jsx'

const i18n = i18next.createInstance()
i18n.use(initReactI18next).init({
  resources: { en: { translation: {
    'queue.title':         'Conversations',
    'queue.mine':          'Mine',
    'queue.unassigned':    'Unassigned',
    'queue.all':           'All',
    'queue.conversations': 'Conversations',
    'queue.search':        'Search name or order…',
    'common.orderLinked':  'Order {{id}}',
    'common.general':      'General',
  } } },
  lng: 'en', fallbackLng: 'en',
})

function makeConv(overrides = {}) {
  return {
    id:                 overrides.id  ?? 'conv-1',
    opener:             { full_name: overrides.name ?? 'Test User', role: overrides.role ?? 'consumer' },
    last_message_at:    null,
    agent_last_read_at: null,
    order_id:           null,
    subject:            null,
    status:             overrides.status ?? 'open',
    assigned_agent_id:  overrides.assigned_agent_id ?? null,
    unread_count:       overrides.unread ?? 0,
    urgent:             overrides.urgent ?? false,
    ...overrides,
  }
}

const wrapper = ({ children }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
)

const baseProps = {
  mine:       [],
  unassigned: [],
  all:        [],
  agentId:    'agent-1',
  selectedId: null,
  onSelect:   vi.fn(),
  loading:    false,
}

describe('QueueList', () => {
  it('Unassigned group header appears before Conversations group header in the DOM', () => {
    render(<QueueList {...baseProps} />, { wrapper })
    const unassignedHeader = screen.getByTestId('group-header-unassigned')
    const convsHeader      = screen.getByTestId('group-header-conversations')
    // DOCUMENT_POSITION_FOLLOWING = 4 means convsHeader comes after unassignedHeader
    expect(unassignedHeader.compareDocumentPosition(convsHeader) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('Mine subgroup header appears before All subgroup header', () => {
    render(<QueueList {...baseProps} />, { wrapper })
    const mineHeader = screen.getByTestId('group-header-mine')
    const allHeader  = screen.getByTestId('group-header-all')
    expect(mineHeader.compareDocumentPosition(allHeader) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('renders Unassigned, Mine, and All group headers', () => {
    render(<QueueList {...baseProps} />, { wrapper })
    expect(screen.getByTestId('group-header-unassigned')).toBeInTheDocument()
    expect(screen.getByTestId('group-header-mine')).toBeInTheDocument()
    expect(screen.getByTestId('group-header-all')).toBeInTheDocument()
  })

  it('shows item count matching the length of each group', () => {
    const mine       = [makeConv({ id: 'c1', name: 'Alice', assigned_agent_id: 'agent-1' })]
    const unassigned = [makeConv({ id: 'c2', name: 'Bob' }), makeConv({ id: 'c3', name: 'Carol' })]
    render(
      <QueueList {...baseProps} mine={mine} unassigned={unassigned} all={[...mine, ...unassigned]} />,
      { wrapper }
    )
    const mineBtn = screen.getByTestId('group-header-mine')
    expect(mineBtn).toHaveTextContent('1')
    const unBtn = screen.getByTestId('group-header-unassigned')
    expect(unBtn).toHaveTextContent('2')
  })

  it('collapsing Conversations hides Mine and All items', () => {
    const mine = [makeConv({ id: 'm1', name: 'Alice', assigned_agent_id: 'agent-1' })]
    render(
      <QueueList {...baseProps} mine={mine} all={mine} />,
      { wrapper }
    )
    // Before collapse: Mine items should be visible (Mine is expanded by default)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    // Click the Conversations parent toggle to collapse it
    fireEvent.click(screen.getByTestId('group-header-conversations'))
    // Mine items should now be hidden
    expect(screen.queryByText('Alice')).not.toBeInTheDocument()
  })

  it('calls onSelect when a queue item is clicked', () => {
    const onSelect   = vi.fn()
    const unassigned = [makeConv({ id: 'u1', name: 'Dan' })]
    render(
      <QueueList {...baseProps} unassigned={unassigned} all={unassigned} onSelect={onSelect} />,
      { wrapper }
    )
    fireEvent.click(screen.getByText('Dan'))
    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('shows loading spinner when loading=true', () => {
    render(<QueueList {...baseProps} loading />, { wrapper })
    expect(document.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('renders the Live pill', () => {
    render(<QueueList {...baseProps} />, { wrapper })
    expect(screen.getByText('Live')).toBeInTheDocument()
  })

  it('filters Unassigned items by search query', () => {
    const unassigned = [
      makeConv({ id: 'u1', name: 'Alice Smith' }),
      makeConv({ id: 'u2', name: 'Bob Jones' }),
    ]
    render(<QueueList {...baseProps} unassigned={unassigned} all={unassigned} />, { wrapper })
    const searchInput = screen.getByPlaceholderText(/search/i)
    fireEvent.change(searchInput, { target: { value: 'alice' } })
    expect(screen.getByText('Alice Smith')).toBeInTheDocument()
    expect(screen.queryByText('Bob Jones')).not.toBeInTheDocument()
  })

  it('urgent items are rendered within the Unassigned group', () => {
    const unassigned = [makeConv({ id: 'u1', name: 'Urgent User', urgent: true })]
    render(<QueueList {...baseProps} unassigned={unassigned} all={unassigned} />, { wrapper })
    expect(screen.getByText('Urgent User')).toBeInTheDocument()
    // AlertTriangle icon is present for urgent items
    expect(document.querySelector('[aria-label="Urgent"]')).toBeInTheDocument()
  })
})
