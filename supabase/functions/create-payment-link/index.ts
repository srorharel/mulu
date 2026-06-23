// supabase/functions/create-payment-link/index.ts
//
// Returns a PER-ORDER signed YaadPay (Hyp) hosted-page URL for the checkout iframe.
//
// Why this exists: a static VITE_PAYMENT_IFRAME_URL can't carry THIS order's amount
// or id, and YaadPay's signature covers the amount — so every order must be signed
// server-side. This fn loads the caller's pending+unpaid order, asks YaadPay to sign
// { Masof, Amount = order total, Order = order id, J5 when saving a card, … } via
// APISign(What=SIGN), and returns the hosted-page URL to load in the iframe. The card
// is then entered + 3DS'd + charged entirely inside YaadPay's page (SAQ-A — the PAN
// never reaches us). The result is confirmed by the separate verify-payment fn.
//
// Edge secrets (default to YaadPay's PUBLIC SANDBOX terminal so it works out of the
// box; swap to your terminal with no code change):
//   YAAD_MASOF     terminal number            (sandbox 0010131918)
//   YAAD_API_KEY   APISign KEY                 (sandbox 7110eda4…0d2c0220)
//   YAAD_PASSP     API password               (sandbox 'yaad')
//   YAAD_SIGN_URL  APISign endpoint           (default https://icom.yaad.net/p/)
//   YAAD_PAY_URL   hosted-page base           (default …/cgi-bin/yaadpay/yaadpay3ds.pl)
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

const SANDBOX = {
  masof: '0010131918',
  key: '7110eda4d09e062aa5e4a390b0a572ac0d2c0220',
  passp: 'yaad',
}
const SIGN_URL = () => Deno.env.get('YAAD_SIGN_URL') ?? 'https://icom.yaad.net/p/'
const PAY_URL = () =>
  Deno.env.get('YAAD_PAY_URL') ?? 'https://icom.yaad.net/cgi-bin/yaadpay/yaadpay3ds.pl'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method_not_allowed' })

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!jwt) return jsonResponse({ ok: false, error: 'unauthorized' })

  let orderId = '', save = false
  try {
    const b = await req.json()
    orderId = String(b.order_id ?? '')
    save = b.save === true
  } catch {
    return jsonResponse({ ok: false, error: 'bad_request' })
  }
  if (!orderId) return jsonResponse({ ok: false, error: 'bad_request' })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
  if (userErr || !userData?.user) return jsonResponse({ ok: false, error: 'unauthorized' })
  const userId = userData.user.id

  // Order must be the caller's, pending, and unpaid.
  const { data: order } = await admin
    .from('orders')
    .select('id, consumer_id, status, total_price, paid_at')
    .eq('id', orderId)
    .single()
  if (!order || order.consumer_id !== userId) return jsonResponse({ ok: false, error: 'order_not_found' })
  if (order.paid_at) return jsonResponse({ ok: false, error: 'already_paid' })
  if (order.status !== 'pending') return jsonResponse({ ok: false, error: 'order_not_payable' })

  const amount = Number(order.total_price) || 0
  if (amount <= 0) return jsonResponse({ ok: false, error: 'invalid_amount' })

  // ── Ask YaadPay to sign this order's params (APISign What=SIGN) ───────────────
  // The response is a ready-to-use query string ("action=pay&…&signature=…") with
  // the params alphabetically ordered — we append it verbatim to the hosted page.
  const signParams = new URLSearchParams({
    action: 'APISign',
    What: 'SIGN',
    KEY: Deno.env.get('YAAD_API_KEY') ?? SANDBOX.key,
    PassP: Deno.env.get('YAAD_PASSP') ?? SANDBOX.passp,
    Masof: Deno.env.get('YAAD_MASOF') ?? SANDBOX.masof,
    Amount: String(amount),
    Order: order.id,
    Info: 'MULU',
    Coin: '1',            // ILS
    Tash: '1',            // single payment
    UTF8: 'True',
    UTF8out: 'True',
    MoreData: 'True',
    PageLang: 'HEB',
    sendemail: 'False',   // MULU issues its own receipt (send-receipt)
    tmp: '1',
  })
  // J5 = verify + tokenize: YaadPay returns a reusable Token on success so the card
  // can be saved (card-on-file, ADR-043). Only when the customer opted in.
  if (save) signParams.set('J5', 'True')

  let signed: string
  try {
    const res = await fetch(`${SIGN_URL()}?${signParams.toString()}`)
    signed = (await res.text()).trim()
  } catch (e) {
    return jsonResponse({ ok: false, error: 'sign_failed', detail: String(e).slice(0, 200) })
  }
  // A valid SIGN response carries the signature; anything else is an error/echo.
  if (!signed.includes('signature=')) {
    return jsonResponse({ ok: false, error: 'sign_rejected', detail: signed.slice(0, 200) })
  }

  return jsonResponse({ ok: true, url: `${PAY_URL()}?${signed}` })
})
