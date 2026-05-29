import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const verifyCalls = []
vi.mock('../lib/supabase.js', () => ({
  supabase: {
    auth: {
      verifyOtp: (args) => {
        verifyCalls.push(args)
        return Promise.resolve({ data: { user: { id: 'tgt' } }, error: null })
      },
    },
  },
}))

const origFetch = globalThis.fetch
const origLocation = window.location

beforeEach(() => {
  verifyCalls.length = 0
  sessionStorage.clear()
  // jsdom: replace location URL with one that contains the token
  delete window.location
  window.location = new URL('http://localhost/?impersonate_token=PLAIN-TOKEN')
  window.history.replaceState = vi.fn()

  globalThis.fetch = vi.fn(() => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({
      target_user_id: 'tgt',
      target_email:   'tgt@x.com',
      admin_id:       'adm',
      expires_at:     new Date(Date.now() + 600_000).toISOString(),
      hashed_token:   'hashed',
      email_otp:      'OTP-12345',
    }),
  }))
})

afterEach(() => {
  globalThis.fetch = origFetch
  window.location = origLocation
})

import {
  redeemImpersonationFromUrl,
  getImpersonationBanner,
  clearImpersonationBanner,
} from '../lib/impersonate.js'

describe('impersonate', () => {
  it('redeems a URL token, verifies OTP, writes banner, strips URL param', async () => {
    const banner = await redeemImpersonationFromUrl()
    expect(banner).toMatchObject({ target_user_id: 'tgt', admin_id: 'adm' })
    expect(verifyCalls[0]).toEqual({ email: 'tgt@x.com', token: 'OTP-12345', type: 'email' })
    expect(window.history.replaceState).toHaveBeenCalled()
    expect(getImpersonationBanner()).toMatchObject({ target_user_id: 'tgt' })
  })

  it('returns existing banner when no token in URL', async () => {
    window.location = new URL('http://localhost/')
    sessionStorage.setItem('wash-impersonation-banner', JSON.stringify({ target_user_id: 'existing' }))
    const banner = await redeemImpersonationFromUrl()
    expect(banner).toEqual({ target_user_id: 'existing' })
    expect(verifyCalls).toHaveLength(0)
  })

  it('returns null when Edge Function 4xx', async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve({
      ok: false,
      json: () => Promise.resolve({ error: 'invalid_or_used_or_expired' }),
    }))
    const banner = await redeemImpersonationFromUrl()
    expect(banner).toBeNull()
  })

  it('clearImpersonationBanner wipes sessionStorage entry', () => {
    sessionStorage.setItem('wash-impersonation-banner', JSON.stringify({ x: 1 }))
    clearImpersonationBanner()
    expect(getImpersonationBanner()).toBeNull()
  })
})
