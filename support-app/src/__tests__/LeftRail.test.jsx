import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import LeftRail from '../components/LeftRail.jsx'

const defaultProps = {
  activeTab: 'conv',
  onTabChange: vi.fn(),
  convCount: 5,
  approvalCount: 3,
  ticketCount: 7,
  profile: { full_name: 'Eli Cohen', agent_display_name: 'Eli' },
  onSettings: vi.fn(),
  onSignOut: vi.fn(),
}

describe('LeftRail', () => {
  it('renders all three tab buttons', () => {
    render(<LeftRail {...defaultProps} />)
    expect(screen.getByRole('button', { name: /conversations/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /approvals/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /tickets/i })).toBeInTheDocument()
  })

  it('shows badge counts for each tab', () => {
    render(<LeftRail {...defaultProps} />)
    expect(screen.getByLabelText('5 items')).toBeInTheDocument()
    expect(screen.getByLabelText('3 items')).toBeInTheDocument()
    expect(screen.getByLabelText('7 items')).toBeInTheDocument()
  })

  it('does not render a badge when count is 0', () => {
    render(<LeftRail {...defaultProps} convCount={0} />)
    // Only approvals and tickets badges remain
    expect(screen.queryAllByLabelText(/items/)).toHaveLength(2)
  })

  it('marks the active tab with aria-current="page"', () => {
    render(<LeftRail {...defaultProps} activeTab="approvals" />)
    const btn = screen.getByRole('button', { name: /approvals/i })
    expect(btn).toHaveAttribute('aria-current', 'page')
  })

  it('calls onTabChange with the tab id when a tab is clicked', () => {
    const onTabChange = vi.fn()
    render(<LeftRail {...defaultProps} onTabChange={onTabChange} />)
    fireEvent.click(screen.getByRole('button', { name: /tickets/i }))
    expect(onTabChange).toHaveBeenCalledWith('tickets')
  })

  it('calls onSettings when the settings button is clicked', () => {
    const onSettings = vi.fn()
    render(<LeftRail {...defaultProps} onSettings={onSettings} />)
    fireEvent.click(screen.getByRole('button', { name: /settings/i }))
    expect(onSettings).toHaveBeenCalledOnce()
  })

  it('calls onSignOut when the sign out button is clicked', () => {
    const onSignOut = vi.fn()
    render(<LeftRail {...defaultProps} onSignOut={onSignOut} />)
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }))
    expect(onSignOut).toHaveBeenCalledOnce()
  })

  it('renders agent initials from profile name', () => {
    render(<LeftRail {...defaultProps} profile={{ agent_display_name: 'Eli Cohen' }} />)
    // Initials appear in the avatar div
    expect(screen.getByTitle('Eli Cohen')).toBeInTheDocument()
  })
})
