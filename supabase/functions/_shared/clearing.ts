// Provider-agnostic card-clearing adapter, used by save-card (tokenize) and
// charge-saved-card (charge by token). The provider is chosen by the
// CLEARING_PROVIDER Edge secret so you can swap clearing companies without
// touching the saved-card logic. Mirrors _shared/sms.ts.
//
//   CLEARING_PROVIDER = 'log'      → DEFAULT. No real network call; logs and
//                                    returns a synthetic success. Safe to deploy
//                                    while the feature is hidden / before a
//                                    processor exists — the scaffold works
//                                    end-to-end (a "charge" succeeds, no money
//                                    moves, no token is stored).
//                     = 'tranzila' | 'cardcom' | 'payplus' | 'generic'
//
// Secrets (set per provider):
//   CLEARING_API_URL       — charge / token endpoint
//   CLEARING_API_KEY       — API token / password
//   CLEARING_API_USER      — terminal / supplier / username
//   CLEARING_WEBHOOK_SECRET — shared secret the processor sends with its
//                             tokenization webhook (validated by save-card)
//
// IMPORTANT: Israeli clearing APIs differ in field names and auth. The provider
// branches below are SCAFFOLDS marked INTEGRATION POINT — verify each against
// the chosen company's current docs and your terminal/account type before going
// live. The 'log' default means an unfinished branch never blocks development.

export interface ChargeResult {
  ok: boolean
  transactionId?: string
  detail: string
}

export interface ParsedToken {
  userId: string
  token: string
  brand?: string
  last4?: string
  expMonth?: number
  expYear?: number
}

const provider = () => (Deno.env.get('CLEARING_PROVIDER') ?? 'log').toLowerCase()

// Charge a stored token. amount is in ILS (major units). idempotencyKey should
// be the order id so a retry never double-charges.
export async function chargeByToken(args: {
  token: string
  amount: number
  orderId: string
  currency?: string
}): Promise<ChargeResult> {
  const { token, amount, orderId } = args
  try {
    switch (provider()) {
      case 'tranzila':
      case 'cardcom':
      case 'payplus':
      case 'generic':
        return await chargeGeneric(args)
      case 'log':
      default:
        // INTEGRATION POINT — replace with the real provider branch.
        console.log(`[clearing:log] charge token=${token.slice(0, 6)}… amount=${amount} order=${orderId}`)
        return { ok: true, transactionId: `log-${orderId}`, detail: 'logged (no processor configured)' }
    }
  } catch (e) {
    return { ok: false, detail: String(e).slice(0, 300) }
  }
}

// INTEGRATION POINT — one generic shape; adapt the body/auth/field names to the
// chosen company (Tranzila TK charge, Cardcom token charge, PayPlus charge, …).
async function chargeGeneric(args: { token: string; amount: number; orderId: string; currency?: string }): Promise<ChargeResult> {
  const url = Deno.env.get('CLEARING_API_URL') ?? ''
  const key = Deno.env.get('CLEARING_API_KEY') ?? ''
  const user = Deno.env.get('CLEARING_API_USER') ?? ''
  if (!url) return { ok: false, detail: 'CLEARING_API_URL not set' }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      terminal: user,
      token: args.token,
      sum: args.amount,
      currency: args.currency ?? 'ILS',
      // Idempotency: most processors accept a unique reference per attempt.
      reference: args.orderId,
    }),
  })
  const text = await res.text()
  // Providers signal success differently (HTTP 200 + a result code in the body).
  // Verify the success predicate against the chosen company's docs.
  return { ok: res.ok, transactionId: undefined, detail: `${provider()}_${res.status}: ${text.slice(0, 200)}` }
}

// Best-effort token revocation (called on card delete / account deletion).
export async function revokeToken(token: string): Promise<{ ok: boolean; detail: string }> {
  if (provider() === 'log') {
    console.log(`[clearing:log] revoke token=${token.slice(0, 6)}…`)
    return { ok: true, detail: 'logged' }
  }
  // INTEGRATION POINT — call the provider's delete-token endpoint if it has one.
  // Not all processors expose token deletion; a no-op is acceptable (the row is
  // gone our side, the token is useless without our terminal credentials).
  return { ok: true, detail: 'no-op (configure if the provider supports it)' }
}

// Parse the processor's tokenization webhook into a normalized token record.
// 'log'/default expects our own simple shape (used for dev + the client-initiated
// save path). Real providers map their callback fields here.
export async function parseTokenWebhook(req: Request): Promise<ParsedToken | null> {
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { return null }
  switch (provider()) {
    case 'tranzila':
    case 'cardcom':
    case 'payplus':
    case 'generic':
    case 'log':
    default: {
      // INTEGRATION POINT — map the provider's field names. Default = our shape.
      const token = String(body.provider_token ?? body.token ?? '')
      const userId = String(body.user_id ?? '')
      if (!token || !userId) return null
      return {
        userId,
        token,
        brand: body.brand ? String(body.brand) : undefined,
        last4: body.last4 ? String(body.last4) : undefined,
        expMonth: body.exp_month ? Number(body.exp_month) : undefined,
        expYear: body.exp_year ? Number(body.exp_year) : undefined,
      }
    }
  }
}
