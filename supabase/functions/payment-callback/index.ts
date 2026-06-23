// supabase/functions/payment-callback/index.ts
//
// YaadPay (Hyp) REDIRECT TARGET — set this as the terminal's return URL in the Yaad
// dashboard:  https://<ref>.supabase.co/functions/v1/payment-callback
//
// Why server-side (not the client /checkout/return page): on the native app the
// webview runs at https://localhost, so the hosted page's browser redirect can't
// post the result back into the app (cross-origin). Setting paid_at HERE, server-
// side, works for web AND native — the app just watches the order flip to paid via
// realtime. Security: we trust nothing in the query string; the payment is only
// honored if Yaad's own VERIFY re-confirms it (a forged CCode=0 fails VERIFY).
//
// Deploy WITHOUT JWT verification (Yaad's redirect carries no app JWT):
//   supabase functions deploy payment-callback --no-verify-jwt --project-ref <ref>
//
// Edge secrets: SUPABASE_SERVICE_ROLE_KEY + YAAD_MASOF / YAAD_API_KEY / YAAD_PASSP.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SANDBOX = { masof: '0010131918', key: '7110eda4d09e062aa5e4a390b0a572ac0d2c0220', passp: 'yaad' }
const SIGN_URL = () => Deno.env.get('YAAD_SIGN_URL') ?? 'https://icom.yaad.net/p/'
const yaad = () => ({
  masof: Deno.env.get('YAAD_MASOF') ?? SANDBOX.masof,
  key: Deno.env.get('YAAD_API_KEY') ?? SANDBOX.key,
  passp: Deno.env.get('YAAD_PASSP') ?? SANDBOX.passp,
})
const isApproved = (c: string) => c === '0' || c === '800'

async function yaadVerify(params: Record<string, string>): Promise<boolean> {
  const { masof, key, passp } = yaad()
  const q = new URLSearchParams(params)
  q.set('action', 'APISign'); q.set('What', 'VERIFY'); q.set('KEY', key); q.set('PassP', passp); q.set('Masof', masof)
  try {
    const res = await fetch(`${SIGN_URL()}?${q.toString()}`)
    return new URLSearchParams((await res.text()).trim()).get('CCode') === '0'
  } catch { return false }
}

function expFromTokef(tokef?: string) {
  if (!tokef || tokef.length !== 4) return { month: null as number | null, year: null as number | null }
  const m = Number(tokef.slice(0, 2)), y = Number(tokef.slice(2))
  if (!m || m > 12) return { month: null, year: null }
  return { month: m, year: 2000 + y }
}

function page(title: string, body: string): Response {
  // Minimal RTL page shown inside the iframe; also pings the parent (web only —
  // harmless on native). The app advances via the orders.paid_at realtime watch.
  const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui,'Segoe UI',Arial,sans-serif;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#F6F8F7;color:#0F172A;text-align:center;padding:24px}h1{font-size:18px;font-weight:600;margin:0 0 6px}p{font-size:14px;color:#64748B;margin:0}</style></head>
<body><div><h1>${title}</h1><p>${body}</p></div>
<script>try{window.parent&&window.parent.postMessage({type:'yaad-payment-result',settled:true},'*')}catch(e){}</script>
</body></html>`
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

Deno.serve(async (req) => {
  const params = Object.fromEntries(new URL(req.url).searchParams.entries()) as Record<string, string>
  const orderId = String(params.Order ?? '')

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  if (!orderId) return page('התשלום לא הושלם', 'חסר מזהה הזמנה. חזרו לאפליקציה ונסו שוב.')

  const { data: order } = await admin
    .from('orders').select('id, consumer_id, status, total_price, paid_at').eq('id', orderId).single()
  if (!order) return page('התשלום לא הושלם', 'ההזמנה לא נמצאה.')
  if (order.paid_at) return page('התשלום התקבל', 'אפשר לחזור לאפליקציה.')

  if (!isApproved(String(params.CCode ?? '')) ||
      Math.round(Number(params.Amount)) !== Math.round(Number(order.total_price)) ||
      !(await yaadVerify(params))) {
    return page('התשלום נכשל', 'לא הצלחנו לאמת את התשלום. חזרו לאפליקציה ונסו שוב.')
  }

  let savedCardId: string | null = null
  const token = String(params.Token ?? '')
  if (token) {
    const tokef = String(params.Tokef ?? '')
    const { data: existing } = await admin.from('payment_methods')
      .select('id').eq('user_id', order.consumer_id).eq('provider_token', tokef ? `${token}|${tokef}` : token).maybeSingle()
    if (existing) savedCardId = existing.id
    else {
      const { month, year } = expFromTokef(tokef)
      const { data: ins } = await admin.from('payment_methods').insert({
        user_id: order.consumer_id, provider: 'yaad',
        provider_token: tokef ? `${token}|${tokef}` : token,
        brand: params.Brand ? String(params.Brand) : null,
        last4: params.L4digit ? String(params.L4digit) : null,
        exp_month: month, exp_year: year,
      }).select('id').single()
      savedCardId = ins?.id ?? null
    }
  }

  await admin.from('orders')
    .update({ paid_at: new Date().toISOString(), payment_ref: String(params.Id ?? '') || null, payment_method_id: savedCardId })
    .eq('id', order.id).is('paid_at', null)

  return page('התשלום התקבל!', 'מצאנו לכם שוטף — אפשר לחזור לאפליקציה.')
})
