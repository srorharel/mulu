// supabase/functions/verify-payment/index.ts
//
// Finalizes a NEW-CARD payment. The checkout iframe (YaadPay hosted page) charges
// the card and redirects to our return page with the result params; the page hands
// them here. We DO NOT trust the client: we re-verify the params with YaadPay
// (APISign What=VERIFY → CCode=0) server-side, cross-check the order id + amount,
// and only then set orders.paid_at — exactly like charge-saved-card does for tokens.
// If the customer opted to save the card, the J5 Token is persisted (card-on-file).
//
// Body: { order_id, params }  where params = every query param YaadPay returned.
// Returns { ok } / { ok, already_paid } / { ok:false, error }.
//
// Edge secrets: SUPABASE_SERVICE_ROLE_KEY + YAAD_* (same as create-payment-link).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

const SANDBOX = { masof: '0010131918', key: '7110eda4d09e062aa5e4a390b0a572ac0d2c0220', passp: 'yaad' }
const SIGN_URL = () => Deno.env.get('YAAD_SIGN_URL') ?? 'https://icom.yaad.net/p/'
const yaad = () => ({
  masof: Deno.env.get('YAAD_MASOF') ?? SANDBOX.masof,
  key: Deno.env.get('YAAD_API_KEY') ?? SANDBOX.key,
  passp: Deno.env.get('YAAD_PASSP') ?? SANDBOX.passp,
})

// YaadPay success: CCode 0 (approved) or 800 (approved, postponed capture).
const isApproved = (ccode: string) => ccode === '0' || ccode === '800'

// Re-verify the returned params with YaadPay. Returns true only when YaadPay itself
// re-confirms the transaction is authentic (its own VERIFY returns CCode=0).
async function yaadVerify(params: Record<string, string>): Promise<boolean> {
  const { masof, key, passp } = yaad()
  const q = new URLSearchParams(params)
  q.set('action', 'APISign')
  q.set('What', 'VERIFY')
  q.set('KEY', key)
  q.set('PassP', passp)
  q.set('Masof', masof)
  try {
    const res = await fetch(`${SIGN_URL()}?${q.toString()}`)
    const text = (await res.text()).trim()
    const ccode = new URLSearchParams(text).get('CCode')
    return ccode === '0'
  } catch {
    return false
  }
}

function expFromTokef(tokef?: string): { month: number | null; year: number | null } {
  // YaadPay Tokef is MMYY (e.g. "1228" = 12/2028).
  if (!tokef || tokef.length !== 4) return { month: null, year: null }
  const m = Number(tokef.slice(0, 2)), y = Number(tokef.slice(2))
  if (!m || m > 12) return { month: null, year: null }
  return { month: m, year: 2000 + y }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method_not_allowed' })

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!jwt) return jsonResponse({ ok: false, error: 'unauthorized' })

  let orderId = '', params: Record<string, string> = {}
  try {
    const b = await req.json()
    orderId = String(b.order_id ?? '')
    params = (b.params && typeof b.params === 'object') ? b.params : {}
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

  const { data: order } = await admin
    .from('orders')
    .select('id, consumer_id, status, total_price, paid_at')
    .eq('id', orderId)
    .single()
  if (!order || order.consumer_id !== userId) return jsonResponse({ ok: false, error: 'order_not_found' })
  if (order.paid_at) return jsonResponse({ ok: true, already_paid: true })
  if (order.status !== 'pending') return jsonResponse({ ok: false, error: 'order_not_payable' })

  // ── Trust nothing from the client ────────────────────────────────────────────
  // 1) the result must say approved, 2) it must be THIS order, 3) the amount must
  // match, 4) YaadPay must re-confirm the params are authentic (signature check).
  if (!isApproved(String(params.CCode ?? ''))) {
    return jsonResponse({ ok: false, error: 'not_approved', detail: String(params.CCode ?? '') })
  }
  if (String(params.Order ?? '') !== order.id) {
    return jsonResponse({ ok: false, error: 'order_mismatch' })
  }
  if (Math.round(Number(params.Amount)) !== Math.round(Number(order.total_price))) {
    return jsonResponse({ ok: false, error: 'amount_mismatch' })
  }
  if (!(await yaadVerify(params))) {
    return jsonResponse({ ok: false, error: 'verify_failed' })
  }

  // Optionally persist the saved-card token (J5). Best-effort — a save failure must
  // not block marking the order paid.
  let savedCardId: string | null = null
  const token = String(params.Token ?? '')
  if (token) {
    const { month, year } = expFromTokef(String(params.Tokef ?? ''))
    const { data: existing } = await admin
      .from('payment_methods')
      .select('id').eq('user_id', userId).eq('provider_token', token).maybeSingle()
    if (existing) {
      savedCardId = existing.id
    } else {
      // YaadPay needs BOTH the Token and its Tokef (expiry) to re-charge later, so
      // store them together as "<Token>|<Tokef>" (chargeYaadToken splits on '|').
      const tokef = String(params.Tokef ?? '')
      const { data: ins } = await admin.from('payment_methods').insert({
        user_id: userId,
        provider: 'yaad',
        provider_token: tokef ? `${token}|${tokef}` : token,
        brand: params.Brand ? String(params.Brand) : null,
        last4: params.L4digit ? String(params.L4digit) : null,
        exp_month: month,
        exp_year: year,
      }).select('id').single()
      savedCardId = ins?.id ?? null
    }
  }

  await admin.from('orders')
    .update({
      paid_at: new Date().toISOString(),
      payment_ref: String(params.Id ?? '') || null,
      payment_method_id: savedCardId,
    })
    .eq('id', order.id)
    .is('paid_at', null)   // idempotency guard against a double finalize

  return jsonResponse({ ok: true })
})
