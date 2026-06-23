import { describe, it, expect, vi, beforeEach } from 'vitest'

// Contract for the new-card YaadPay (Hyp) flow (ADR-042/043 follow-through):
//   • the iframe URL is signed PER ORDER server-side (create-payment-link) — never
//     a static client URL, because YaadPay's signature covers the amount,
//   • the result is finalized server-side (verify-payment) — the client never sets
//     paid_at; it only forwards the YaadPay return params for re-verification.

const { invokeSpy } = vi.hoisted(() => ({ invokeSpy: vi.fn() }))

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    functions: {
      invoke: (...a) => { invokeSpy(...a); return Promise.resolve({ data: { ok: true, url: 'https://icom.yaad.net/x?signature=abc' }, error: null }) },
    },
  },
}))

import { createPaymentLink, verifyPayment } from '../lib/payments.js'

beforeEach(() => invokeSpy.mockClear())

describe('YaadPay new-card flow — contract', () => {
  it('createPaymentLink asks the server to sign THIS order (with the save/J5 flag)', async () => {
    const res = await createPaymentLink('order-1', true)
    expect(invokeSpy).toHaveBeenCalledWith('create-payment-link', { body: { order_id: 'order-1', save: true } })
    expect(res.ok).toBe(true)
    expect(res.url).toMatch(/signature=/)
  })

  it('createPaymentLink defaults save to false', async () => {
    await createPaymentLink('order-2')
    expect(invokeSpy).toHaveBeenCalledWith('create-payment-link', { body: { order_id: 'order-2', save: false } })
  })

  it('verifyPayment forwards the YaadPay return params for server-side re-verification', async () => {
    const params = { CCode: '0', Id: '99', Order: 'order-1', Amount: '50' }
    await verifyPayment('order-1', params)
    expect(invokeSpy).toHaveBeenCalledWith('verify-payment', { body: { order_id: 'order-1', params } })
  })
})
