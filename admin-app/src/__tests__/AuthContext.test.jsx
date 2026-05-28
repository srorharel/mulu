import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// Per-test mutable state that the supabase mock reads from.
let mockState = {
  session: null,
  profileRow: null,
  signOutCalls: 0,
}

vi.mock('../lib/supabase.js', () => {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: () => Promise.resolve({ data: mockState.profileRow, error: null }),
  }
  return {
    supabase: {
      from: vi.fn(() => builder),
      auth: {
        getSession: () => Promise.resolve({ data: { session: mockState.session }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
        signOut: () => { mockState.signOutCalls += 1; return Promise.resolve({ error: null }) },
        signInWithPassword: () => Promise.resolve({ error: null }),
      },
    },
  }
})

import { AuthProvider, useAuth } from '../context/AuthContext.jsx'

function Probe() {
  const ctx = useAuth()
  if (!ctx) return <span>nullctx</span>
  if (ctx.loading) return <span>loading</span>
  if (ctx.blocked) return <span>blocked</span>
  if (ctx.profile) return <span>role:{ctx.profile.role}</span>
  return <span>nobody</span>
}

beforeEach(() => {
  mockState = { session: null, profileRow: null, signOutCalls: 0 }
})

describe('AuthContext (admin)', () => {
  it('signs out non-super_admin users on session load', async () => {
    mockState.session = { user: { id: 'aaaaaaaa-0000-0000-0000-000000000001' } }
    mockState.profileRow = { id: 'aaaaaaaa-0000-0000-0000-000000000001', role: 'agent', full_name: 'A' }

    render(<AuthProvider><Probe /></AuthProvider>)

    await waitFor(() => expect(screen.getByText(/blocked/)).toBeTruthy())
    expect(mockState.signOutCalls).toBeGreaterThanOrEqual(1)
  })

  it('admits super_admin users', async () => {
    mockState.session = { user: { id: 'aaaaaaaa-0000-0000-0000-000000000002' } }
    mockState.profileRow = { id: 'aaaaaaaa-0000-0000-0000-000000000002', role: 'super_admin', full_name: 'B' }

    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByText(/role:super_admin/)).toBeTruthy())
    expect(mockState.signOutCalls).toBe(0)
  })

  it('blocks when session loads but no profile row exists', async () => {
    mockState.session = { user: { id: 'aaaaaaaa-0000-0000-0000-000000000003' } }
    mockState.profileRow = null

    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => expect(screen.getByText(/blocked/)).toBeTruthy())
    expect(mockState.signOutCalls).toBeGreaterThanOrEqual(1)
  })
})
