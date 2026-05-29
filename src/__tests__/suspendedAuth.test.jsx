import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, screen } from '@testing-library/react'

// Mocks must run before the AuthProvider import.
let profileRow = null
const signOutCalls = []
const unregCalls   = []

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1' } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: () => { signOutCalls.push(1); return Promise.resolve({ error: null }) },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: profileRow, error: null }),
        }),
      }),
      update: () => ({ eq: () => ({ then: r => Promise.resolve({}).then(r) }) }),
    }),
  },
}))

vi.mock('../lib/notifications.js', () => ({
  unregisterToken: () => { unregCalls.push(1); return Promise.resolve() },
}))

vi.mock('../lib/impersonate.js', () => ({
  redeemImpersonationFromUrl: () => Promise.resolve(null),
  getImpersonationBanner:     () => null,
  clearImpersonationBanner:   () => {},
}))

vi.mock('../i18n/index.js', () => ({
  default: { language: 'en', changeLanguage: () => {} },
  LOCALE_STORAGE_KEY: 'wash-locale',
}))

import { AuthProvider, useAuth } from '../context/AuthContext.jsx'

function Probe() {
  const { suspended, profile } = useAuth()
  return (
    <div>
      <span data-testid="suspended">{suspended ? suspended.reason || 'yes' : 'no'}</span>
      <span data-testid="profile">{profile ? profile.id : 'null'}</span>
    </div>
  )
}

beforeEach(() => {
  signOutCalls.length = 0
  unregCalls.length   = 0
})

describe('AuthContext suspension handling', () => {
  it('signs the user out and exposes a suspended banner when profile.suspended_at is set', async () => {
    profileRow = { id: 'u1', role: 'consumer', suspended_at: '2026-05-29T00:00:00Z', suspended_reason: 'tos violation' }

    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => {
      expect(screen.getByTestId('suspended').textContent).toBe('tos violation')
      expect(screen.getByTestId('profile').textContent).toBe('null')
      expect(signOutCalls.length).toBeGreaterThan(0)
    })
  })

  it('passes through normally when suspended_at is null', async () => {
    profileRow = { id: 'u1', role: 'consumer', suspended_at: null, locale: 'en' }
    render(<AuthProvider><Probe /></AuthProvider>)
    await waitFor(() => {
      expect(screen.getByTestId('suspended').textContent).toBe('no')
      expect(screen.getByTestId('profile').textContent).toBe('u1')
      expect(signOutCalls.length).toBe(0)
    })
  })
})
