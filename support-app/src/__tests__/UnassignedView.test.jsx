import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import UnassignedView from '../components/UnassignedView.jsx'

function makeConv(overrides = {}) {
  return {
    id:                    overrides.id ?? 'conv-1',
    assigned_agent_id:     overrides.assigned_agent_id ?? null,
    opener:                { full_name: overrides.name ?? 'Test User', role: overrides.role ?? 'consumer' },
    last_message_at:       overrides.last_message_at ?? null,
    created_at:            new Date().toISOString(),
    last_message_preview:  overrides.preview ?? null,
    subject:               overrides.subject ?? null,
    ...overrides,
  }
}

describe('UnassignedView', () => {
  it('renders the header with conversation count', () => {
    const convs = [makeConv({ id: 'c1' }), makeConv({ id: 'c2' })]
    render(<UnassignedView conversations={convs} onClaim={vi.fn()} />)
    expect(screen.getByText('Unassigned conversations')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('shows only conversations passed in (does not show assigned ones)', () => {
    const convs = [
      makeConv({ id: 'u1', name: 'Alice' }),
      makeConv({ id: 'u2', name: 'Bob' }),
    ]
    render(<UnassignedView conversations={convs} onClaim={vi.fn()} />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.queryByText('Charlie')).not.toBeInTheDocument()
  })

  it('shows Claim button for each conversation', () => {
    const convs = [makeConv({ id: 'c1' }), makeConv({ id: 'c2' })]
    render(<UnassignedView conversations={convs} onClaim={vi.fn()} />)
    expect(screen.getAllByTestId('claim-button')).toHaveLength(2)
  })

  it('Claim button calls onClaim with the correct conversation', () => {
    const onClaim = vi.fn()
    const conv    = makeConv({ id: 'my-conv', name: 'Alice' })
    render(<UnassignedView conversations={[conv]} onClaim={onClaim} />)
    fireEvent.click(screen.getByTestId('claim-button'))
    expect(onClaim).toHaveBeenCalledOnce()
    expect(onClaim).toHaveBeenCalledWith(expect.objectContaining({ id: 'my-conv' }))
  })

  it('shows empty state when conversations list is empty', () => {
    render(<UnassignedView conversations={[]} onClaim={vi.fn()} />)
    expect(screen.getByText('No unassigned conversations')).toBeInTheDocument()
    expect(screen.queryByTestId('claim-button')).not.toBeInTheDocument()
  })

  it('shows Customer pill for consumer opener', () => {
    const conv = makeConv({ id: 'c1', role: 'consumer' })
    render(<UnassignedView conversations={[conv]} onClaim={vi.fn()} />)
    expect(screen.getByText('Customer')).toBeInTheDocument()
  })

  it('shows Washer pill for washer opener', () => {
    const conv = makeConv({ id: 'c1', role: 'washer', name: 'Eve' })
    render(<UnassignedView conversations={[conv]} onClaim={vi.fn()} />)
    expect(screen.getByText('Washer')).toBeInTheDocument()
  })

  it('shows preview text when available', () => {
    const conv = makeConv({ id: 'c1', preview: 'My car is still dirty!' })
    render(<UnassignedView conversations={[conv]} onClaim={vi.fn()} />)
    expect(screen.getByText('My car is still dirty!')).toBeInTheDocument()
  })
})
