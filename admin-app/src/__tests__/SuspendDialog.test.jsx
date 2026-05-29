import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const rpcCalls = []
vi.mock('../lib/supabase.js', () => ({
  supabase: {
    rpc: (name, args) => {
      rpcCalls.push({ name, args })
      return Promise.resolve({ data: null, error: null })
    },
  },
}))

import SuspendDialog from '../components/users/SuspendDialog.jsx'

beforeEach(() => { rpcCalls.length = 0 })

describe('SuspendDialog', () => {
  it('disables Suspend until reason is ≥3 chars', async () => {
    render(<SuspendDialog userId="u1" onClose={() => {}} onDone={() => {}} />)
    const btn = screen.getByText('Suspend')
    expect(btn).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText(/Reason/), { target: { value: 'sp' } })
    expect(btn).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText(/Reason/), { target: { value: 'spam' } })
    expect(btn).not.toBeDisabled()
  })
  it('calls admin_suspend_user RPC and onDone on success', async () => {
    const onDone = vi.fn()
    render(<SuspendDialog userId="u1" onClose={() => {}} onDone={onDone} />)
    fireEvent.change(screen.getByPlaceholderText(/Reason/), { target: { value: 'tos violation' } })
    fireEvent.click(screen.getByText('Suspend'))
    await waitFor(() => {
      expect(rpcCalls[0]).toEqual({
        name: 'admin_suspend_user',
        args: { p_user_id: 'u1', p_reason: 'tos violation' },
      })
      expect(onDone).toHaveBeenCalled()
    })
  })
})
