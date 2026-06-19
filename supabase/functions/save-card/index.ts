// supabase/functions/save-card/index.ts
//
// Stores a clearing-company TOKEN (never a card number) as a saved payment method.
// Two entry modes, because processors differ in how they hand back the token:
//
//   1. Client-initiated (Authorization: Bearer <jwt>) — the checkout iframe
//      returned a token to the page, which posts it here over the authenticated
//      channel. The card is bound to the JWT's user; the body supplies only the
//      token + display bits.
//
//   2. Processor webhook (header x-clearing-secret: <CLEARING_WEBHOOK_SECRET>) —
//      the clearing company calls us server-to-server after tokenizing. The user
//      is resolved from the payload by _shared/clearing.ts parseTokenWebhook.
//
// Either way the row is written with the service role. The token is never read
// back to any client (column GRANTs in migration 0128 exclude provider_token).
//
// Edge secrets: SUPABASE_SERVICE_ROLE_KEY (+ CLEARING_WEBHOOK_SECRET for mode 2).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { parseTokenWebhook } from '../_shared/clearing.ts'

const admin = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

async function insertCard(card: {
  userId: string; provider: string; token: string
  brand?: string; last4?: string; expMonth?: number; expYear?: number
}) {
  const svc = admin()
  // Dedupe: if this exact token is already saved for the user, do nothing.
  const { data: existing } = await svc
    .from('payment_methods')
    .select('id')
    .eq('user_id', card.userId)
    .eq('provider_token', card.token)
    .maybeSingle()
  if (existing) return { ok: true, id: existing.id, deduped: true }

  const { data, error } = await svc.from('payment_methods').insert({
    user_id: card.userId,
    provider: card.provider,
    provider_token: card.token,
    brand: card.brand ?? null,
    last4: card.last4 ?? null,
    exp_month: card.expMonth ?? null,
    exp_year: card.expYear ?? null,
  }).select('id').single()
  if (error) return { ok: false, error: error.message }
  return { ok: true, id: data.id }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method_not_allowed' })

  const provider = (Deno.env.get('CLEARING_PROVIDER') ?? 'log').toLowerCase()
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

  // ── Mode 2: processor webhook (no user JWT, shared-secret authenticated) ──
  if (!jwt) {
    const secret = Deno.env.get('CLEARING_WEBHOOK_SECRET') ?? ''
    if (!secret || req.headers.get('x-clearing-secret') !== secret) {
      return jsonResponse({ ok: false, error: 'unauthorized' })
    }
    const parsed = await parseTokenWebhook(req)
    if (!parsed) return jsonResponse({ ok: false, error: 'bad_webhook_payload' })
    const r = await insertCard({ ...parsed, provider })
    return jsonResponse(r)
  }

  // ── Mode 1: client-initiated save (token from the iframe, bound to the JWT) ──
  const { data: userData, error: userErr } = await admin().auth.getUser(jwt)
  if (userErr || !userData?.user) return jsonResponse({ ok: false, error: 'unauthorized' })

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { return jsonResponse({ ok: false, error: 'bad_request' }) }
  const token = String(body.provider_token ?? body.token ?? '')
  if (!token) return jsonResponse({ ok: false, error: 'missing_token' })

  const r = await insertCard({
    userId: userData.user.id,
    provider,
    token,
    brand: body.brand ? String(body.brand) : undefined,
    last4: body.last4 ? String(body.last4) : undefined,
    expMonth: body.exp_month ? Number(body.exp_month) : undefined,
    expYear: body.exp_year ? Number(body.exp_year) : undefined,
  })
  return jsonResponse(r)
})
