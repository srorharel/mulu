import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Contract test for the phone-verification gate (Feature 1). Pins the load-
// bearing behaviour: the gate is INVISIBLE unless the feature flag is on AND the
// user is an unverified consumer/washer, it auto-sends a code on appearance, and
// a correct code calls verify-otp + refreshProfile. Supabase / auth / flag mocked.

// vi.mock factories are hoisted above module init, so shared mutable state must
// live in vi.hoisted() to be referenceable inside them.
const mocks = vi.hoisted(() => ({
  flags: { phoneVerification: false, inAppCalls: false },
  state: { authValue: null, invokeImpl: () => ({ data: {}, error: null }) },
  invokeCalls: [],
  refreshProfile: vi.fn(),
}))

vi.mock('../lib/featureFlags.js', () => ({ FEATURES: mocks.flags, default: mocks.flags }))

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    functions: {
      invoke: (name, opts) => {
        mocks.invokeCalls.push({ name, body: opts?.body })
        return Promise.resolve(mocks.state.invokeImpl(name, opts))
      },
    },
  },
}))

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => ({ ...mocks.state.authValue, refreshProfile: mocks.refreshProfile }),
}))
vi.mock('../components/ui/Toast.jsx', () => ({ useToast: () => () => {} }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k, opts) => (opts && opts.count != null ? `${k}:${opts.count}` : k),
    i18n: { language: 'he' },
  }),
}))

import PhoneVerifyModal from '../components/account/PhoneVerifyModal.jsx'

beforeEach(() => {
  mocks.flags.phoneVerification = false
  mocks.state.authValue = { user: { id: 'u1' }, profile: { role: 'consumer', phone: '0501234567', phone_verified_at: null } }
  mocks.state.invokeImpl = () => ({ data: { ok: true, sent: true }, error: null })
  mocks.invokeCalls.length = 0
  mocks.refreshProfile.mockClear()
})

describe('PhoneVerifyModal (feature gate)', () => {
  it('renders nothing and sends nothing when the flag is OFF', async () => {
    mocks.flags.phoneVerification = false
    render(<PhoneVerifyModal />)
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mocks.invokeCalls).toHaveLength(0)
  })

  it('shows the gate and auto-sends a code for an unverified consumer when ON', async () => {
    mocks.flags.phoneVerification = true
    render(<PhoneVerifyModal />)
    await screen.findByRole('dialog')
    await waitFor(() => expect(mocks.invokeCalls.some((c) => c.name === 'send-otp')).toBe(true))
  })

  it('stays hidden for an already-verified user even when ON', async () => {
    mocks.flags.phoneVerification = true
    mocks.state.authValue.profile.phone_verified_at = '2026-06-18T00:00:00Z'
    render(<PhoneVerifyModal />)
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mocks.invokeCalls).toHaveLength(0)
  })

  it('never gates an agent', async () => {
    mocks.flags.phoneVerification = true
    mocks.state.authValue.profile.role = 'agent'
    render(<PhoneVerifyModal />)
    await new Promise((r) => setTimeout(r, 20))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('verifies a correct code via verify-otp and refreshes the profile', async () => {
    mocks.flags.phoneVerification = true
    mocks.state.invokeImpl = (name) =>
      name === 'verify-otp'
        ? { data: { verified: true }, error: null }
        : { data: { ok: true, sent: true }, error: null }

    render(<PhoneVerifyModal />)
    await screen.findByRole('dialog')

    await userEvent.type(screen.getByLabelText('phoneVerify.codeLabel'), '123456')
    await userEvent.click(screen.getByText('phoneVerify.verify'))

    await waitFor(() => {
      const verify = mocks.invokeCalls.find((c) => c.name === 'verify-otp')
      expect(verify?.body).toEqual({ code: '123456' })
      expect(mocks.refreshProfile).toHaveBeenCalled()
    })
  })
})
