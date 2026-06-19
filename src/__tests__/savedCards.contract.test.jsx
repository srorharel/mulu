import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

// Safety contract for card-on-file (ADR-043). The browser must NEVER read the
// stored token, charges must go through the server-side Edge Function, and the
// hook must be inert while VITE_ENABLE_PAYMENTS is off.

const { selectSpy, invokeSpy, rpcSpy, fromSpy } = vi.hoisted(() => ({
  selectSpy: vi.fn(), invokeSpy: vi.fn(), rpcSpy: vi.fn(), fromSpy: vi.fn(),
}))

vi.mock('../lib/supabase.js', () => {
  const builder = {
    select: (cols) => { selectSpy(cols); return builder },
    order: () => builder,
    delete: () => builder,
    eq: () => Promise.resolve({ data: [], error: null }),
    then: (cb) => Promise.resolve({ data: [], error: null }).then(cb),
  }
  return {
    supabase: {
      from: (t) => { fromSpy(t); return builder },
      rpc: (...a) => { rpcSpy(...a); return Promise.resolve({ data: null, error: null }) },
      functions: { invoke: (...a) => { invokeSpy(...a); return Promise.resolve({ data: { ok: true }, error: null }) } },
    },
  }
})

// Flag OFF — the hook must not touch the DB.
vi.mock('../lib/featureFlags.js', () => ({ FEATURES: { payments: false } }))

import { listSavedCards, chargeSavedCard, setDefaultCard, cardLabel } from '../lib/payments.js'
import { useSavedCards } from '../hooks/useSavedCards.js'

beforeEach(() => { selectSpy.mockClear(); invokeSpy.mockClear(); rpcSpy.mockClear(); fromSpy.mockClear() })

describe('saved cards — safety contract', () => {
  it('never selects the provider_token column', async () => {
    await listSavedCards()
    const cols = selectSpy.mock.calls[0][0]
    expect(cols).not.toMatch(/provider_token/)
    expect(cols).toMatch(/last4/)
  })

  it('charges a saved card server-side via the Edge Function (token stays server-side)', async () => {
    await chargeSavedCard('o1', 'm1')
    expect(invokeSpy).toHaveBeenCalledWith('charge-saved-card', { body: { order_id: 'o1', payment_method_id: 'm1' } })
  })

  it('sets the default card via the ownership-checked RPC', async () => {
    await setDefaultCard('m1')
    expect(rpcSpy).toHaveBeenCalledWith('set_default_payment_method', { p_id: 'm1' })
  })

  it('formats a masked label, never a full number', () => {
    expect(cardLabel({ last4: '4242', brand: 'visa' })).toBe('•••• 4242 · Visa')
  })

  it('useSavedCards is inert (no DB query, empty list) when payments are off', async () => {
    const { result } = renderHook(() => useSavedCards())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.cards).toEqual([])
    expect(fromSpy).not.toHaveBeenCalled()
  })
})
