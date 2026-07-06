// supabase/functions/charge-saved-card/index.ts
//
// Charges one of the CALLER's saved cards for one of the CALLER's pending orders,
// server-side, using the stored token (the browser never sees the token). Invoked
// from the checkout page via supabase.functions.invoke('charge-saved-card',
// { body: { order_id, payment_method_id } }).
//
// Guarantees:
//   • the order belongs to the caller and is still `pending` + unpaid,
//   • the payment method belongs to the caller,
//   • idempotent — an already-paid order returns ok without re-charging,
//   • the actual charge goes through _shared/clearing.ts (provider-agnostic;
//     'log' default succeeds without moving money).
//
// Edge secrets: SUPABASE_SERVICE_ROLE_KEY (+ CLEARING_* once a processor is set).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { chargeByToken } from '../_shared/clearing.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method_not_allowed' })

  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!jwt) return jsonResponse({ ok: false, error: 'unauthorized' })

  let orderId = '', methodId = ''
  try {
    const b = await req.json()
    orderId = String(b.order_id ?? '')
    methodId = String(b.payment_method_id ?? '')
  } catch {
    return jsonResponse({ ok: false, error: 'bad_request' })
  }
  if (!orderId || !methodId) return jsonResponse({ ok: false, error: 'bad_request' })

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
  if (userErr || !userData?.user) return jsonResponse({ ok: false, error: 'unauthorized' })
  const userId = userData.user.id

  // Order must be the caller's, pending, and not already paid.
  const { data: order } = await admin
    .from('orders')
    .select('id, consumer_id, status, total_price, paid_at')
    .eq('id', orderId)
    .single()
  if (!order || order.consumer_id !== userId) return jsonResponse({ ok: false, error: 'order_not_found' })
  if (order.paid_at) return jsonResponse({ ok: true, already_paid: true })
  if (order.status !== 'pending') return jsonResponse({ ok: false, error: 'order_not_payable' })

  // Payment method must be the caller's. Service role can read provider_token.
  const { data: pm } = await admin
    .from('payment_methods')
    .select('id, user_id, provider_token')
    .eq('id', methodId)
    .single()
  if (!pm || pm.user_id !== userId) return jsonResponse({ ok: false, error: 'card_not_found' })

  // CLAIM the order atomically BEFORE charging. Two concurrent requests
  // (double-tap, two tabs) both pass the paid_at read above and would both
  // charge; the .is('paid_at', null) guard lets exactly one through. This also
  // surfaces update failures (e.g. 0132's partial unique index) BEFORE any
  // money moves, instead of after.
  const claimStamp = new Date().toISOString()
  const { data: claim, error: claimErr } = await admin.from('orders')
    .update({ paid_at: claimStamp, payment_method_id: pm.id })
    .eq('id', order.id)
    .is('paid_at', null)
    .select('id')
  if (claimErr) {
    console.error(`charge-saved-card: claim failed for order ${order.id} (no charge made):`, claimErr)
    return jsonResponse({ ok: false, error: 'order_not_payable', detail: claimErr.message })
  }
  if (!claim?.length) return jsonResponse({ ok: true, already_paid: true })

  const charge = await chargeByToken({
    token: pm.provider_token,
    amount: Number(order.total_price) || 0,
    orderId: order.id,
  })
  if (!charge.ok) {
    // Release the claim so the user can retry with another card.
    const { error: revertErr } = await admin.from('orders')
      .update({ paid_at: null, payment_method_id: null })
      .eq('id', order.id)
      .eq('paid_at', claimStamp)
    if (revertErr) console.error(`charge-saved-card: DECLINED but claim revert failed — order ${order.id} looks paid without a charge:`, revertErr)
    return jsonResponse({ ok: false, error: 'charge_declined', detail: charge.detail })
  }

  const { error: refErr } = await admin.from('orders')
    .update({ payment_ref: charge.transactionId ?? null })
    .eq('id', order.id)
  if (refErr) console.error(`charge-saved-card: paid but payment_ref not recorded for order ${order.id}:`, refErr)

  return jsonResponse({ ok: true })
})
