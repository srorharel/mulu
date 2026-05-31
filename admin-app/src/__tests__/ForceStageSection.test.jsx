import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

// supabase is imported transitively (adminJobs.js + AdminAuditTimeline.jsx) when
// we import JobDetail.jsx; stub it so no real client is created. ForceStageSection
// itself never touches supabase.
vi.mock('../lib/supabase.js', () => ({ supabase: {} }))

// Keep the REAL pure helpers (FORCE_STAGES, forceStageWarnings, isBackwardForce)
// and spy only on the RPC wrapper. vi.hoisted so the spy exists before the
// hoisted vi.mock factory runs.
const { forceSpy } = vi.hoisted(() => ({ forceSpy: vi.fn(() => Promise.resolve()) }))
vi.mock('../lib/adminJobs.js', async (orig) => {
  const actual = await orig()
  return { ...actual, forceOrderStage: forceSpy }
})

import { ForceStageSection } from '../components/jobs/JobDetail.jsx'

beforeEach(() => { forceSpy.mockClear() })

function setup(status = 'in_progress') {
  const onDone = vi.fn()
  render(<ForceStageSection order={{ id: 'o1', status }} onDone={onDone} onCancel={() => {}} />)
  return { onDone }
}

describe('ForceStageSection', () => {
  it('disables the apply button until a target AND a reason are set', () => {
    setup('in_progress')
    const apply = screen.getByRole('button', { name: 'Force stage' })
    expect(apply).toBeDisabled()                                   // nothing picked

    fireEvent.click(screen.getByRole('button', { name: /accepted/i }))
    expect(apply).toBeDisabled()                                   // target only, no reason

    fireEvent.change(screen.getByPlaceholderText(/reason/i), { target: { value: 'fix it' } })
    expect(apply).not.toBeDisabled()                               // now valid
  })

  it('shows a backward side-effect warning when the target is earlier', () => {
    setup('in_progress')
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /accepted/i }))
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(/does not undo/i)
  })

  it('surfaces the completed→back payout warning specifically', () => {
    setup('completed')
    fireEvent.click(screen.getByRole('button', { name: /in_progress/i }))
    expect(screen.getByText(/payout may already be recorded/i)).toBeInTheDocument()
  })

  it('confirming a valid force calls forceOrderStage(orderId, target, reason) and onDone', async () => {
    const { onDone } = setup('in_progress')
    fireEvent.click(screen.getByRole('button', { name: /accepted/i }))
    fireEvent.change(screen.getByPlaceholderText(/reason/i), { target: { value: 'real-world arrived early' } })
    fireEvent.click(screen.getByRole('button', { name: 'Force stage' }))   // opens confirm dialog

    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Force stage' }))

    await waitFor(() => expect(forceSpy).toHaveBeenCalledTimes(1))
    expect(forceSpy).toHaveBeenCalledWith('o1', 'accepted', 'real-world arrived early')
    await waitFor(() => expect(onDone).toHaveBeenCalled())
  })
})
