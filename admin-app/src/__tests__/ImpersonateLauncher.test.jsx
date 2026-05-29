import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const rpcCalls = []
vi.mock('../lib/supabase.js', () => ({
  supabase: {
    rpc: (name, args) => {
      rpcCalls.push({ name, args })
      return Promise.resolve({
        data: { token: 'tok-abc', target_user: args.p_target_user_id, expires_at: new Date(Date.now() + 600_000).toISOString() },
        error: null,
      })
    },
  },
}))

import ImpersonateLauncher from '../components/users/ImpersonateLauncher.jsx'

beforeEach(() => { rpcCalls.length = 0 })

describe('ImpersonateLauncher', () => {
  it('issues a token with default 600s TTL when Issue clicked', async () => {
    render(<ImpersonateLauncher userId="u1" onClose={() => {}} />)
    fireEvent.click(screen.getByText('Issue token'))
    await waitFor(() => {
      expect(rpcCalls[0]).toEqual({
        name: 'admin_create_impersonation_token',
        args: { p_target_user_id: 'u1', p_ttl_seconds: 600 },
      })
      expect(screen.getByText(/impersonate_token=tok-abc/)).toBeInTheDocument()
    })
  })
  it('respects custom TTL', async () => {
    render(<ImpersonateLauncher userId="u2" onClose={() => {}} />)
    fireEvent.change(screen.getByDisplayValue('600'), { target: { value: '300' } })
    fireEvent.click(screen.getByText('Issue token'))
    await waitFor(() => {
      expect(rpcCalls[0].args).toEqual({ p_target_user_id: 'u2', p_ttl_seconds: 300 })
    })
  })
})
