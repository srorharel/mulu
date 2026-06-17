// Provider-agnostic SMS sender, used by send-otp to deliver the verification
// code. The provider is chosen by the SMS_PROVIDER Edge secret so you can swap
// aggregators without touching the OTP logic.
//
//   SMS_PROVIDER = 'log'     → DEFAULT. No real SMS; logs the message to the
//                              function logs. Safe to deploy while the feature
//                              is still hidden / before you have a provider.
//                = '019'      → 019 SMS (019sms.co.il)
//                = 'inforu'   → InforU (inforu.co.il)
//                = 'generic'  → simple JSON POST to SMS_API_URL (fill the shape)
//
// Common secrets:
//   SMS_SENDER     — approved alphanumeric sender ID (e.g. "MULU") or source number
//   SMS_API_USER   — provider username/account (019, generic)
//   SMS_API_KEY    — provider API token / password
//   SMS_API_URL    — endpoint for the 'generic' provider
//
// IMPORTANT: Israeli aggregator APIs change and differ in field names. The 019
// and InforU bodies below are best-effort against their documented v2 APIs —
// VERIFY them against your provider's current docs + your account type before
// going live. The 'log' default means a wrong shape never blocks development.

export interface SmsResult {
  ok: boolean
  detail: string
}

// 05X-12345678 / "050 123 4567" / +972... → E.164 (+9725XXXXXXXX). Israeli
// mobile numbers are what the app collects; this normalises the local 0-prefix
// form that most providers expect in international format.
export function toIsraeliE164(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '')
  if (digits.startsWith('972')) return `+${digits}`
  if (digits.startsWith('0')) return `+972${digits.slice(1)}`
  return `+${digits}`
}

export async function sendSms(to: string, body: string): Promise<SmsResult> {
  const provider = (Deno.env.get('SMS_PROVIDER') ?? 'log').toLowerCase()
  const sender = Deno.env.get('SMS_SENDER') ?? 'MULU'

  try {
    switch (provider) {
      case '019':
        return await send019(to, body, sender)
      case 'inforu':
        return await sendInforu(to, body, sender)
      case 'generic':
        return await sendGeneric(to, body, sender)
      case 'log':
      default:
        console.log(`[sms:log] to=${to} sender=${sender} body=${body}`)
        return { ok: true, detail: 'logged (no provider configured)' }
    }
  } catch (e) {
    return { ok: false, detail: String(e).slice(0, 300) }
  }
}

// ── 019 SMS ───────────────────────────────────────────────────────────────────
// Docs: https://019sms.co.il/  (JSON API, Bearer token). Verify field names.
async function send019(to: string, body: string, sender: string): Promise<SmsResult> {
  const token = Deno.env.get('SMS_API_KEY') ?? ''
  const user = Deno.env.get('SMS_API_USER') ?? ''
  const local = to.replace('+972', '0') // 019 expects local 0-prefixed numbers
  const res = await fetch('https://019sms.co.il/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      sms: {
        user: { username: user },
        source: sender,
        destinations: { phone: [{ $: local }] },
        message: body,
      },
    }),
  })
  const text = await res.text()
  return { ok: res.ok, detail: `019_${res.status}: ${text.slice(0, 200)}` }
}

// ── InforU ──────────────────────────────────────────────────────────────────
// Docs: https://www.inforu.co.il/  (REST v2, Basic auth user:token). Verify.
async function sendInforu(to: string, body: string, sender: string): Promise<SmsResult> {
  const user = Deno.env.get('SMS_API_USER') ?? ''
  const token = Deno.env.get('SMS_API_KEY') ?? ''
  const auth = btoa(`${user}:${token}`)
  const res = await fetch('https://capi.inforu.co.il/api/v2/SMS/SendSms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
    body: JSON.stringify({
      Data: {
        Message: body,
        Recipients: [{ Phone: to.replace('+', '') }],
        Settings: { Sender: sender },
      },
    }),
  })
  const text = await res.text()
  return { ok: res.ok, detail: `inforu_${res.status}: ${text.slice(0, 200)}` }
}

// ── Generic JSON POST ─────────────────────────────────────────────────────────
// For any provider with a simple { to, from, text } JSON endpoint. Adjust the
// body to match, set SMS_API_URL + SMS_API_KEY (sent as Bearer).
async function sendGeneric(to: string, body: string, sender: string): Promise<SmsResult> {
  const url = Deno.env.get('SMS_API_URL') ?? ''
  const key = Deno.env.get('SMS_API_KEY') ?? ''
  if (!url) return { ok: false, detail: 'SMS_API_URL not set' }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ to, from: sender, text: body }),
  })
  const text = await res.text()
  return { ok: res.ok, detail: `generic_${res.status}: ${text.slice(0, 200)}` }
}
