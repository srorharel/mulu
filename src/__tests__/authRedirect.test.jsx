// Guard: signUp must NOT pass a client-side emailRedirectTo. The confirmation
// link is owned by the Supabase email template (token-hash flow →
// muluwash.com/auth/confirm). The old origin-based redirect was removed because
// it was inert and broke on native (window.location.origin is localhost there,
// so Supabase fell back to site_url = the marketing homepage). This pins that
// removal: no emailRedirectTo, and never a hardcoded localhost/dev host if one
// is ever reintroduced.
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
  it('does not pass a client-side emailRedirectTo (the email template owns the confirm link)', async () => {
    const user = userEvent.setup()
    render(<AuthProvider><Probe /></AuthProvider>)

    await user.click(screen.getByText('go'))

    await waitFor(() => expect(lastSignUpArg).toBeTruthy())
    const redirect = lastSignUpArg.options?.emailRedirectTo
    // No client-side redirect — the Supabase email template (token-hash flow)
    // owns the confirm URL now.
    expect(redirect).toBeUndefined()
    // If one is ever reintroduced, it must never hardcode a localhost / dev host.
    if (redirect) {
      expect(redirect).not.toMatch(/localhost/i)
      expect(redirect).not.toMatch(/127\.0\.0\.1/)
    }
  })
})
