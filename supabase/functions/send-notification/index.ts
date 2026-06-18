import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Types ─────────────────────────────────────────────────────────────────────

type EventType =
  | 'order_accepted'
  | 'washer_on_way'
  | 'washer_arrived'
  | 'wash_completed'
  | 'wash_pending_review'
  | 'wash_complete_consumer'
  | 'wash_declined'
  | 'order_approved'
  | 'order_cancelled'
  | 'new_chat_message'
  | 'new_job_nearby'
  | 'customer_cancelled'
  | 'support_message'
  | 'support_resolved'
  | 'tier_changed'
  | 'admin_broadcast'
  | 'legal_update'
  | 'incoming_call'

interface SendPayload {
  user_id: string
  event_type: EventType
  data: Record<string, string>
}

interface SendResult {
  token: string
  ok: boolean
  deadToken: boolean  // UNREGISTERED or INVALID_ARGUMENT — safe to delete
  error: string | null
}

// ── Module-level FCM token cache ──────────────────────────────────────────────
// FCM access tokens are valid for 1 hour. We cache for 50 minutes so a warm
// Edge Function instance re-uses the same token across many requests, avoiding
// a full RSA sign + OAuth2 round-trip on every invocation.

interface TokenCache { token: string; expiresAt: number }
let fcmTokenCache: TokenCache | null = null

// ── Server-side i18n strings ───────────────────────────────────────────────────
// Small map duplicated here; acceptable for v1.

type BodyResolver = string | ((d: Record<string, string>) => string)
type TitleResolver = string | ((d: Record<string, string>) => string)
interface CopyEntry { title: TitleResolver; body: BodyResolver }

const COPY: Record<EventType, Record<string, CopyEntry>> = {
  order_accepted: {
    en: { title: 'Washer on the way',   body: 'Your washer accepted your order and is heading to you.' },
    he: { title: 'השוטף בדרך',          body: 'השוטף קיבל את ההזמנה שלך ובדרך אליך.' },
  },
  washer_on_way: {
    en: { title: 'Washer on the way',   body: 'Your washer is heading to your car.' },
    he: { title: 'השוטף בדרך',          body: 'השוטף בדרך לרכב שלך.' },
  },
  washer_arrived: {
    en: { title: 'Washer has arrived',  body: 'Your washer has arrived at your car.' },
    he: { title: 'השוטף הגיע',           body: 'השוטף הגיע לרכב שלך.' },
  },
  wash_completed: {
    en: { title: 'Wash submitted',      body: 'Your wash is done — tap to rate.' },
    he: { title: 'הרחיצה הושלמה',       body: 'הרחיצה בוצעה — הקש לדרג.' },
  },
  wash_pending_review: {
    en: { title: 'Awaiting approval',   body: 'Submitted. Support is reviewing your wash.' },
    he: { title: 'ממתין לאישור',        body: 'השליחה התקבלה. צוות התמיכה יבדוק את הוואש.' },
  },
  wash_complete_consumer: {
    en: { title: 'Wash complete',       body: 'Your wash is ready — tap to rate.' },
    he: { title: 'הוואש הושלם',         body: 'הוואש שלך מוכן — הקש לדירוג.' },
  },
  wash_declined: {
    en: { title: 'Wash needs fixes',    body: (d) => `Support requested changes. Reason: ${d.reason || 'See details'}` },
    he: { title: 'הוואש לא אושר',       body: (d) => `צוות התמיכה ביקש לתקן. סיבה: ${d.reason || 'ראה פרטים'}` },
  },
  order_approved: {
    en: { title: 'Job approved',        body: 'Your wash was approved. Great work!' },
    he: { title: 'עבודה אושרה',         body: 'הרחיצה אושרה. כל הכבוד!' },
  },
  order_cancelled: {
    en: {
      title: 'Order cancelled',
      body: (d) => d.cancelled_by === 'washer'
        ? 'Your washer cancelled the order.'
        : 'Your order was cancelled by support.',
    },
    he: {
      title: 'הזמנה בוטלה',
      body: (d) => d.cancelled_by === 'washer'
        ? 'השוטף ביטל את ההזמנה.'
        : 'ההזמנה בוטלה על ידי התמיכה.',
    },
  },
  customer_cancelled: {
    en: { title: 'Job cancelled',       body: 'The customer cancelled the order.' },
    he: { title: 'עבודה בוטלה',         body: 'הלקוח ביטל את ההזמנה.' },
  },
  new_chat_message: {
    en: { title: 'New message',         body: (d) => d.preview ?? 'You have a new message.' },
    he: { title: 'הודעה חדשה',           body: (d) => d.preview ?? 'יש לך הודעה חדשה.' },
  },
  new_job_nearby: {
    en: { title: 'New job nearby',      body: 'A new wash job is available near you.' },
    he: { title: 'עבודה חדשה בקרבתך',   body: 'יש עבודת רחיצה חדשה בקרבתך.' },
  },
  support_message: {
    en: { title: 'Support replied',     body: (d) => d.preview ?? 'You have a new message from support.' },
    he: { title: 'תמיכה ענתה',          body: (d) => d.preview ?? 'יש לך הודעה חדשה מהתמיכה.' },
  },
  tier_changed: {
    en: {
      title: 'Tier update',
      body: (d) => d.direction === 'promoted'
        ? `Great news — you now earn ₪${d.payout_amount} per wash! Tap to see your tier.`
        : `Your earnings are now ₪${d.payout_amount} per wash. Tap to see your tier.`,
    },
    he: {
      title: 'עדכון דרגה',
      body: (d) => d.direction === 'promoted'
        ? `מעולה — אתה מרוויח כעת ₪${d.payout_amount} לשטיפה! הקש לצפייה בדרגתך.`
        : `ההכנסה שלך כעת היא ₪${d.payout_amount} לשטיפה. הקש לצפייה בדרגתך.`,
    },
  },
  support_resolved: {
    en: {
      title: 'Support update',
      body: (d) => d.final_status === 'resolved'
        ? 'Your support request has been resolved. Tap to view.'
        : 'Your support conversation was closed. Tap to view.',
    },
    he: {
      title: 'עדכון תמיכה',
      body: (d) => d.final_status === 'resolved'
        ? 'פנייתך לתמיכה טופלה. הקש לצפייה.'
        : 'שיחת התמיכה שלך נסגרה. הקש לצפייה.',
    },
  },
  admin_broadcast: {
    // Title + body come from the broadcast row itself (data.title_en/he,
    // data.body_en/he) so the owner controls copy per-locale per-broadcast.
    en: {
      title: (d) => d.title_en ?? d.title ?? 'MULU',
      body:  (d) => d.body_en  ?? d.body  ?? '',
    },
    he: {
      title: (d) => d.title_he ?? d.title ?? 'MULU',
      body:  (d) => d.body_he  ?? d.body  ?? '',
    },
  },
  legal_update: {
    // doc_type drives the document name; title is constant. Phase 3 mounts the
    // in-app acknowledgment modal, so the push just nudges the user to open it.
    en: {
      title: 'Legal document updated',
      body: (d) => {
        const name = d.doc_type === 'consumer_terms' ? 'Terms of Service'
          : d.doc_type === 'privacy_policy'           ? 'Privacy Policy'
          : d.doc_type === 'washer_terms'             ? 'Washer Terms'
          : 'legal document'
        return `Our ${name} was updated. Tap to review and accept.`
      },
    },
    he: {
      title: 'עודכן מסמך משפטי',
      body: (d) => {
        const name = d.doc_type === 'consumer_terms' ? 'תנאי השימוש'
          : d.doc_type === 'privacy_policy'           ? 'מדיניות הפרטיות'
          : d.doc_type === 'washer_terms'             ? 'תנאי השוטפים'
          : 'מסמך משפטי'
        return `עודכן מסמך: ${name}. יש לעיין ולאשר.`
      },
    },
  },
  incoming_call: {
    // Backgrounded-ring nudge for an in-app voice call (Feature 2). The actual
    // call rings in-app over Realtime when the app is foreground; this push is
    // the fallback when it isn't.
    en: { title: 'Incoming call', body: (d) => `${d.from_name || 'Someone'} is calling you` },
    he: { title: 'שיחה נכנסת',     body: (d) => `${d.from_name || 'מישהו'} מתקשר אליך` },
  },
}

// ── Route map (server-side fallback; trigger pre-computes data.route) ─────────

function routeFor(event_type: EventType, data: Record<string, string>): string {
  switch (event_type) {
    case 'order_accepted':
    case 'washer_on_way':
    case 'washer_arrived':
    case 'wash_completed':
    case 'wash_complete_consumer':
    case 'order_cancelled':
    case 'new_chat_message':
      return data.order_id ? `/order/${data.order_id}` : '/home'
    case 'order_approved':
    case 'wash_pending_review':
    case 'wash_declined':
      return data.order_id ? `/washer/job/${data.order_id}` : '/washer'
    case 'customer_cancelled':
    case 'new_job_nearby':
      return '/washer'
    case 'support_message':
    case 'support_resolved':
      return '/support'
    case 'tier_changed':
      return '/washer/earnings'
    case 'admin_broadcast':
      return data.route ?? '/home'
    case 'legal_update':
      return data.doc_type === 'consumer_terms' ? '/legal/terms'
           : data.doc_type === 'washer_terms'   ? '/legal/washer-terms'
           : '/legal/privacy'
    case 'incoming_call':
      return data.route ?? '/home'
    default:
      return '/home'
  }
}

function resolveBody(template: BodyResolver, data: Record<string, string>): string {
  return typeof template === 'function' ? template(data) : template
}

function resolveTitle(template: TitleResolver, data: Record<string, string>): string {
  return typeof template === 'function' ? template(data) : template
}

// ── Timing-safe string comparison ────────────────────────────────────────────
// Constant-time XOR loop prevents timing oracle on the service role key.
// Length check first leaks that the lengths differ, which is acceptable for
// fixed-length JWT tokens — the key length is not a meaningful secret.

function timingSafeEqual(a: string, b: string): boolean {
  const enc    = new TextEncoder()
  const aBytes = enc.encode(a)
  const bBytes = enc.encode(b)
  if (aBytes.length !== bBytes.length) return false
  let diff = 0
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i]
  }
  return diff === 0
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // TRIGGER_SECRET is set explicitly as an Edge Function secret.
  // It holds the same value stored in vault.secrets('service_role_key'),
  // so pg_net trigger calls (which send that Vault value as a Bearer token)
  // are accepted, and all other callers are rejected.
  const triggerSecret = Deno.env.get('TRIGGER_SECRET') ?? ''
  const authHeader    = req.headers.get('Authorization') ?? ''
  const bearerToken   = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''

  if (!timingSafeEqual(bearerToken, triggerSecret)) {
    return new Response('Unauthorized', { status: 401 })
  }

  let payload: SendPayload
  try {
    payload = await req.json()
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  const { user_id, event_type, data } = payload
  if (!user_id || !event_type) {
    return new Response('Missing user_id or event_type', { status: 400 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    triggerSecret,  // same value as service_role_key; used for DB access
  )

  // ── 1. Check user notification preferences ───────────────────────────────
  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('enabled, sound, promos_enabled')
    .eq('user_id', user_id)
    .single()

  if (!prefs?.enabled) {
    await supabase.from('notification_log').insert({
      user_id, event_type, payload: data, delivered: false, error: 'user_disabled',
    })
    return new Response(JSON.stringify({ skipped: 'user_disabled' }), { status: 200 })
  }

  // Promotional broadcasts use a separate opt-in so users can silence them
  // without losing transactional alerts.
  if (event_type === 'admin_broadcast' && prefs.promos_enabled === false) {
    await supabase.from('notification_log').insert({
      user_id, event_type, payload: data, delivered: false, error: 'user_promos_disabled',
    })
    return new Response(JSON.stringify({ skipped: 'user_promos_disabled' }), { status: 200 })
  }

  // ── 2. Fetch device tokens ────────────────────────────────────────────────
  const { data: tokens } = await supabase
    .from('device_tokens')
    .select('token, platform')
    .eq('user_id', user_id)

  if (!tokens?.length) {
    await supabase.from('notification_log').insert({
      user_id, event_type, payload: data, delivered: false, error: 'no_tokens',
    })
    return new Response(JSON.stringify({ skipped: 'no_tokens' }), { status: 200 })
  }

  // ── 3. Resolve locale and copy ────────────────────────────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('locale')
    .eq('id', user_id)
    .single()

  const locale = (profile?.locale === 'he') ? 'he' : 'en'
  const copy   = COPY[event_type]?.[locale]

  if (!copy) {
    await supabase.from('notification_log').insert({
      user_id, event_type, payload: data, delivered: false, error: 'unknown_event_type',
    })
    return new Response(JSON.stringify({ skipped: 'unknown_event_type' }), { status: 200 })
  }

  const title = resolveTitle(copy.title, data)
  const body  = resolveBody(copy.body, data)
  const route = data.route ?? routeFor(event_type, data)
  const sound = prefs.sound ?? 'chirp'

  // ── 4. Get cached FCM access token ────────────────────────────────────────
  const fcmProjectId = Deno.env.get('FCM_PROJECT_ID')!
  const fcmSaJson    = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON')!
  const accessToken  = await getFcmAccessToken(fcmSaJson)

  // ── 5. Send to each token — failures on one don't abort the rest ──────────
  const results = await Promise.allSettled(
    tokens.map(({ token, platform }) =>
      sendFcmMessage({ token, platform, title, body, route, event_type, sound, data, fcmProjectId, accessToken })
    )
  )

  // ── 6. Delete dead tokens (UNREGISTERED / INVALID_ARGUMENT) ──────────────
  const deadTokens: string[] = []
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.deadToken) {
      deadTokens.push(result.value.token)
    }
  }
  if (deadTokens.length > 0) {
    await supabase
      .from('device_tokens')
      .delete()
      .in('token', deadTokens)
      // Dead tokens are user-scoped; deleting by token value is safe across users
      // because tokens are globally unique per FCM project.
  }

  // ── 7. Log every attempt — one row per token ─────────────────────────────
  const logRows = results.map((result) => {
    const fulfilled = result.status === 'fulfilled'
    const val       = fulfilled ? result.value : null
    return {
      user_id,
      event_type,
      payload: { ...data, route, sound, locale },
      delivered: fulfilled && val!.ok,
      error: fulfilled
        ? (val!.ok ? null : val!.error)
        : String((result as PromiseRejectedResult).reason),
    }
  })

  await supabase.from('notification_log').insert(logRows)

  const delivered = logRows.filter(r => r.delivered).length
  return new Response(
    JSON.stringify({ sent: delivered, total: tokens.length, dead_removed: deadTokens.length }),
    { status: 200 },
  )
})

// ── FCM: cached OAuth2 access token ──────────────────────────────────────────

async function getFcmAccessToken(serviceAccountJson: string): Promise<string> {
  const now = Date.now()

  // Return cached token if it has more than 60 s of life left.
  if (fcmTokenCache && fcmTokenCache.expiresAt > now + 60_000) {
    return fcmTokenCache.token
  }

  const sa        = JSON.parse(serviceAccountJson)
  const nowSec    = Math.floor(now / 1000)
  const header    = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims    = base64url(JSON.stringify({
    iss:   sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   nowSec,
    exp:   nowSec + 3600,
  }))

  const signingInput = `${header}.${claims}`
  const key          = await importRsaPrivateKey(sa.private_key)
  const sigBytes     = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    new TextEncoder().encode(signingInput),
  )
  const sig = base64url(sigBytes)
  const jwt = `${signingInput}.${sig}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  })
  const { access_token } = await res.json()

  // Cache for 50 minutes (tokens last 60 min; leave 10 min safety margin).
  fcmTokenCache = { token: access_token, expiresAt: now + 50 * 60 * 1000 }
  return access_token
}

// base64url encoding (JWT requires + → -, / → _, no padding)
function base64url(input: string | ArrayBuffer): string {
  const bytes = typeof input === 'string'
    ? new TextEncoder().encode(input)
    : new Uint8Array(input)
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

async function importRsaPrivateKey(pem: string): Promise<CryptoKey> {
  const pemBody = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')
  const der     = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0))
  return crypto.subtle.importKey(
    'pkcs8', der.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign'],
  )
}

// ── FCM HTTP v1 send ──────────────────────────────────────────────────────────

async function sendFcmMessage(opts: {
  token: string
  platform: string
  title: string
  body: string
  route: string
  event_type: string
  sound: string
  data: Record<string, string>
  fcmProjectId: string
  accessToken: string
}): Promise<SendResult> {
  const { token, platform, title, body, route, event_type, sound, data, fcmProjectId, accessToken } = opts

  // Incoming calls are a NORMAL notification message (not data-only) on a
  // dedicated max-importance 'incoming_calls' channel (created client-side).
  // This makes the call ring as a heads-up notification even when the app is
  // minimized or closed — exactly like every other notification. (A data-only
  // message + custom native service was tried for a full-screen ring, but data
  // messages aren't delivered reliably to a backgrounded/killed app, so the
  // ring never showed. A normal notification is the robust path.)
  const isCall = event_type === 'incoming_call'

  const message: Record<string, unknown> = {
    token,
    notification: { title, body },
    data: { route, event_type, ...data },
  }

  if (platform === 'android') {
    message.android = isCall
      ? { priority: 'high', notification: { channel_id: 'incoming_calls', sound: 'bell' } }
      : { notification: { channel_id: `wash_${sound || 'chirp'}`, sound } }
  } else if (platform === 'ios') {
    message.apns = { payload: { aps: { sound: `${sound}.mp3` } } }
  }

  let res: Response
  try {
    res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${fcmProjectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ message }),
      },
    )
  } catch (e) {
    return { token, ok: false, deadToken: false, error: `network: ${String(e)}` }
  }

  if (res.ok) {
    return { token, ok: true, deadToken: false, error: null }
  }

  // Parse FCM error body to detect dead tokens.
  let errBody: Record<string, unknown> = {}
  try { errBody = await res.json() } catch { /* non-JSON body */ }

  const fcmError  = (errBody?.error as Record<string, unknown>) ?? {}
  const fcmStatus = String(fcmError.status ?? '')
  const errorCode = String(
    ((fcmError.details as Array<Record<string, string>>)?.[0]?.errorCode) ?? ''
  )

  // UNREGISTERED: token was valid but the app was uninstalled or FCM rotated it.
  // INVALID_ARGUMENT: token is malformed — never valid.
  // Both are safe to delete immediately.
  const deadToken = errorCode === 'UNREGISTERED' || fcmStatus === 'INVALID_ARGUMENT'

  return {
    token,
    ok:        false,
    deadToken,
    error:     errorCode || fcmStatus || `FCM ${res.status}`,
  }
}
