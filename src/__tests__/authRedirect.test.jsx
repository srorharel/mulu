// Guard: signUp's email-confirmation redirect must be derived from the LIVE
// origin (window.location.origin), never a hardcoded localhost / fixed domain.
// A hardcoded host breaks the confirm flow across preview/prod and is the second
// classic cause of an auth "404". We prove derivation by stubbing the origin and
// asserting the redirect reflects it.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ── Capture the argument signUp() forwards to supabase ───────────────────────
let lastSignUpArg = null

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signUp: (arg) => { lastSignUpArg = arg; return Promise.resolve({ data: { session: null }, error: null }) },
    },
    from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null }) }) }) }),
  },
}))

vi.mock('../lib/notifications.js', () => ({ unregisterToken: () => Promise.resolve() }))
vi.mock('../lib/impersonate.js', () => ({
  redeemImpersonationFromUrl: () => Promise.resolve(null),
  getImpersonationBanner:     () => null,
  clearImpersonationBanner:   () => {},
}))
vi.mock('../i18n/index.js', () => ({
  default: { language: 'en', changeLanguage: () => {} },
  LOCALE_STORAGE_KEY: 'wash_locale',
}))

import { AuthProvider, useAuth } from '../context/AuthContext.jsx'

function Probe() {
  const { signUp } = useAuth()
  return <button onClick={() => signUp('a@b.com', 'pw1234', { role: 'consumer' })}>go</button>
}

const STUB_ORIGIN = 'https://mulu-prod.vercel.app'

beforeEach(() => {
  lastSignUpArg = null
  // Stub the live origin so we can prove the redirect is DERIVED from it.
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { origin: STUB_ORIGIN, href: `${STUB_ORIGIN}/`, pathname: '/', search: '', assign() {}, replace() {} },
  })
})

describe('signUp email redirect', () => {
  it('uses the live window.location.origin, not a hardcoded host', async () => {
    const user = userEvent.setup()
    render(<AuthProvider><Probe /></AuthProvider>)

    await user.click(screen.getByText('go'))

    await waitFor(() => expect(lastSignUpArg).toBeTruthy())
    const redirect = lastSignUpArg.options.emailRedirectTo
    // Reflects the stubbed origin → proves it is derived, not literal.
    expect(redirect).toBe(`${STUB_ORIGIN}/`)
    // And is definitely not a hardcoded localhost / dev domain.
    expect(redirect).not.toMatch(/localhost/i)
    expect(redirect).not.toMatch(/127\.0\.0\.1/)
  })
})
