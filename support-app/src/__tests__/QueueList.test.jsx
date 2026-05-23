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
    'common.orderLinked': 'Order {{id}}',
    'common.general':   'General',
  } } },
  lng: 'en', fallbackLng: 'en',
})

function makeConv(overrides = {}) {
  return {
    id:                 overrides.id  ?? 'conv-1',
    opener:             { full_name: overrides.name ?? 'Test User', role: overrides.role ?? 'consumer' },
    agent:              overrides.agent ?? null,
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
  others:     [],
  agentId:    'agent-1',
  selectedId: null,
  onSelect:   vi.fn(),
  loading:    false,
}

describe('QueueList — Assigned (Mine, Others)', () => {
  it('renders Assigned, Mine, and Others group headers', () => {
    render(<QueueList {...baseProps} />, { wrapper })
    expect(screen.getByTestId('group-header-assigned')).toBeInTheDocument()
    expect(screen.getByTestId('group-header-mine')).toBeInTheDocument()
    expect(screen.getByTestId('group-header-others')).toBeInTheDocument()
  })

  it('Mine subgroup header appears before Others subgroup header', () => {
    render(<QueueList {...baseProps} />, { wrapper })
    const mineHeader   = screen.getByTestId('group-header-mine')
    const othersHeader = screen.getByTestId('group-header-others')
    expect(mineHeader.compareDocumentPosition(othersHeader) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('shows item count matching the length of each group', () => {
    const mine   = [makeConv({ id: 'c1', name: 'Alice', assigned_agent_id: 'agent-1' })]
    const others = [makeConv({ id: 'c2', name: 'Bob',   assigned_agent_id: 'agent-2' })]
    render(
      <QueueList {...baseProps} mine={mine} others={others} />,
      { wrapper }
    )
    expect(screen.getByTestId('group-header-mine')).toHaveTextContent('1')
    // Others is collapsed by default, count still shows in header
    expect(screen.getByTestId('group-header-others')).toHaveTextContent('1')
    // Assigned header should show total 2
    expect(screen.getByTestId('group-header-assigned')).toHaveTextContent('2')
  })

  it('collapsing Assigned hides Mine items', () => {
    const mine = [makeConv({ id: 'm1', name: 'Alice', assigned_agent_id: 'agent-1' })]
    render(
      <QueueList {...baseProps} mine={mine} />,
      { wrapper }
    )
    // Before collapse: Mine items visible
    expect(screen.getByText('Alice')).toBeInTheDocument()
    // Click Assigned toggle to collapse
    fireEvent.click(screen.getByTestId('group-header-assigned'))
    expect(screen.queryByText('Alice')).not.toBeInTheDocument()
  })

  it('calls onSelect when a Mine queue item is clicked', () => {
    const onSelect = vi.fn()
    const mine     = [makeConv({ id: 'm1', name: 'Dave', assigned_agent_id: 'agent-1' })]
    render(
      <QueueList {...baseProps} mine={mine} onSelect={onSelect} />,
      { wrapper }
    )
    fireEvent.click(screen.getByText('Dave'))
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

  it('filters Mine items by search query', () => {
    const mine = [
      makeConv({ id: 'm1', name: 'Alice Smith',  assigned_agent_id: 'agent-1' }),
      makeConv({ id: 'm2', name: 'Bob Jones',    assigned_agent_id: 'agent-1' }),
    ]
    render(<QueueList {...baseProps} mine={mine} />, { wrapper })
    const searchInput = screen.getByPlaceholderText(/search/i)
    fireEvent.change(searchInput, { target: { value: 'alice' } })
    expect(screen.getByText('Alice Smith')).toBeInTheDocument()
    expect(screen.queryByText('Bob Jones')).not.toBeInTheDocument()
  })

  it('Others group is collapsed by default', () => {
    const others = [makeConv({ id: 'o1', name: 'Charlie', assigned_agent_id: 'agent-2' })]
    render(<QueueList {...baseProps} others={others} />, { wrapper })
    // Charlie should NOT be visible since Others is collapsed by default
    expect(screen.queryByText('Charlie')).not.toBeInTheDocument()
    // Expand others
    fireEvent.click(screen.getByTestId('group-header-others'))
    expect(screen.getByText('Charlie')).toBeInTheDocument()
  })

  it('urgent items in Mine show the Urgent aria-label', () => {
    const mine = [makeConv({ id: 'm1', name: 'Urgent User', urgent: true, assigned_agent_id: 'agent-1' })]
    render(<QueueList {...baseProps} mine={mine} />, { wrapper })
    expect(screen.getByText('Urgent User')).toBeInTheDocument()
    expect(document.querySelector('[aria-label="Urgent"]')).toBeInTheDocument()
  })
})
