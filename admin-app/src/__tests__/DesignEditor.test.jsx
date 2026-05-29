import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
    from: () => ({
      select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }),
    }),
    rpc: () => Promise.resolve({ data: 0, error: null }),
  },
}))

import DesignEditor from '../pages/DesignEditor.jsx'

beforeEach(() => {
  try { sessionStorage.clear() } catch { /* noop */ }
})

describe('DesignEditor passphrase gate', () => {
  it('shows the passphrase prompt on first render', () => {
    render(<DesignEditor />)
    expect(screen.getByText('Design Editor')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Passphrase')).toBeInTheDocument()
  })
  it('rejects an empty submission (button disabled)', () => {
    render(<DesignEditor />)
    expect(screen.getByText('Unlock')).toBeDisabled()
  })
  it('rejects a wrong passphrase with an error message', async () => {
    render(<DesignEditor />)
    fireEvent.change(screen.getByPlaceholderText('Passphrase'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByText('Unlock'))
    await waitFor(() => expect(screen.getByText('Wrong passphrase')).toBeInTheDocument())
    // Still gated; editor UI not rendered.
    expect(screen.queryByText('Active overrides')).toBeNull()
  })
  it('unlocks on the correct passphrase 121212', async () => {
    render(<DesignEditor />)
    fireEvent.change(screen.getByPlaceholderText('Passphrase'), { target: { value: '121212' } })
    fireEvent.click(screen.getByText('Unlock'))
    await waitFor(() => expect(screen.getByText('Active overrides')).toBeInTheDocument())
  })
  it('re-locks after a "reload" — passphrase prompt returns on a fresh mount', () => {
    const { unmount } = render(<DesignEditor />)
    fireEvent.change(screen.getByPlaceholderText('Passphrase'), { target: { value: '121212' } })
    fireEvent.click(screen.getByText('Unlock'))
    unmount()
    render(<DesignEditor />)
    // Fresh mount = locked again (state isn't persisted in localStorage).
    expect(screen.getByPlaceholderText('Passphrase')).toBeInTheDocument()
  })
})
