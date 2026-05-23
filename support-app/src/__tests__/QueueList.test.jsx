import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import QueueList from '../components/QueueList.jsx'

// Minimal i18n setup for tests
const i18n = i18next.createInstance()
i18n.use(initReactI18next).init({
  resources: { en: { translation: {
    'queue.title': 'Conversations',
    'queue.mine': 'Mine',
    'queue.unassigned': 'Unassigned',
    'queue.all': 'All',
    'queue.search': 'Search name or order…',
    'common.orderLinked': 'Order {{id}}',
    'common.general': 'General',
  } } },
  lng: 'en', fallbackLng: 'en',
})

function makeConv(overrides = {}) {
  return {
    id: overrides.id ?? 'conv-1',
    opener: { full_name: overrides.name ?? 'Test User', role: overrides.role ?? 'consumer' },
    last_message_at: null,
    agent_last_read_at: null,
    order_id: null,
    subject: null,
    status: overrides.status ?? 'open',
    assigned_agent_id: overrides.assigned_agent_id ?? null,
    unread_count: overrides.unread ?? 0,
    ...overrides,
  }
}

const wrapper = ({ children }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
)

const baseProps = {
  mine: [],
  unassigned: [],
  all: [],
  agentId: 'agent-1',
  selectedId: null,
  onSelect: vi.fn(),
  loading: false,
}

describe('QueueList', () => {
  it('renders Mine, Unassigned, and All group headers', () => {
    render(<QueueList {...baseProps} />, { wrapper })
    expect(screen.getByText(/mine/i)).toBeInTheDocument()
    expect(screen.getByText(/unassigned/i)).toBeInTheDocument()
    expect(screen.getByText(/all/i)).toBeInTheDocument()
  })

  it('shows item count per group in the group header', () => {
    const mine = [makeConv({ id: 'c1', name: 'Alice', assigned_agent_id: 'agent-1' })]
    const unassigned = [makeConv({ id: 'c2', name: 'Bob' }), makeConv({ id: 'c3', name: 'Carol' })]
    render(<QueueList {...baseProps} mine={mine} unassigned={unassigned} all={[...mine, ...unassigned]} />, { wrapper })
    // Group counts are rendered as text digits next to the group label
    const mineBtn = screen.getByRole('button', { name: /mine/i })
    expect(mineBtn).toHaveTextContent('1')
    const unBtn = screen.getByRole('button', { name: /unassigned/i })
    expect(unBtn).toHaveTextContent('2')
  })

  it('calls onSelect when a queue item is clicked', () => {
    const onSelect = vi.fn()
    const unassigned = [makeConv({ id: 'u1', name: 'Dan' })]
    render(
      <QueueList {...baseProps} unassigned={unassigned} all={unassigned} onSelect={onSelect} />,
      { wrapper }
    )
    // Unassigned is expanded by default; click the item
    fireEvent.click(screen.getByText('Dan'))
    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('shows loading spinner when loading=true', () => {
    render(<QueueList {...baseProps} loading />, { wrapper })
    // Spinner is a div with animate-spin class
    expect(document.querySelector('.animate-spin')).toBeInTheDocument()
  })

  it('renders the Live pill', () => {
    render(<QueueList {...baseProps} />, { wrapper })
    expect(screen.getByText('Live')).toBeInTheDocument()
  })

  it('filters items by search query', () => {
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
})
