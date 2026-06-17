// supabase/functions/turn-credentials/index.ts
//
// Feature 2 (HIDDEN): mints short-lived ICE/TURN credentials for an in-app voice
// call. Browser-invoked via supabase.functions.invoke('turn-credentials') with
// the user's session — only logged-in users get credentials, and they expire,
// so they can't be lifted from the bundle and reused.
//
// Provider chosen by the TURN_PROVIDER Edge secret:
//   'cloudflare' → Cloudflare Realtime TURN (recommended; you're already on CF).
//                  Needs TURN_KEY_ID + TURN_KEY_API_TOKEN.
//   'static'     → a self-hosted/coturn or fixed-credential server.
//                  Needs TURN_URLS (comma-separated), TURN_USERNAME, TURN_CREDENTIAL.
//   'none'       → DEFAULT. STUN-only (Google public). Works on good networks /
//                  same-LAN; insufficient for many cellular calls but safe before
//                  a TURN server exists. The client also falls back to STUN.
//
// Returns HTTP 200 with { iceServers: [...] } always (STUN fallback on any error).

import { corsHeaders, jsonResponse } from '../_shared/cors.ts'

const STUN_ONLY = [{ urls: 'stun:stun.l.google.com:19302' }]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Require a bearer token (the platform validated it). We don't need the uid
  // here — just proof the caller is authenticated.
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return jsonResponse({ iceServers: STUN_ONLY })

  const provider = (Deno.env.get('TURN_PROVIDER') ?? 'none').toLowerCase()

  try {
    if (provider === 'cloudflare') {
      const keyId = Deno.env.get('TURN_KEY_ID') ?? ''
      const apiToken = Deno.env.get('TURN_KEY_API_TOKEN') ?? ''
      const res = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ttl: 86400 }), // 24h — well past any single call
        },
      )
      if (!res.ok) {
        console.error('turn-credentials: Cloudflare rejected:', res.status, (await res.text()).slice(0, 200))
        return jsonResponse({ iceServers: STUN_ONLY })
      }
      const body = await res.json()
      // CF returns { iceServers: { urls: [...], username, credential } }.
      const cf = body.iceServers ?? body
      return jsonResponse({ iceServers: [cf, ...STUN_ONLY] })
    }

    if (provider === 'static') {
      const urls = (Deno.env.get('TURN_URLS') ?? '').split(',').map((u) => u.trim()).filter(Boolean)
      const username = Deno.env.get('TURN_USERNAME') ?? ''
      const credential = Deno.env.get('TURN_CREDENTIAL') ?? ''
      if (!urls.length) return jsonResponse({ iceServers: STUN_ONLY })
      return jsonResponse({ iceServers: [{ urls, username, credential }, ...STUN_ONLY] })
    }

    return jsonResponse({ iceServers: STUN_ONLY })
  } catch (e) {
    console.error('turn-credentials: error:', e)
    return jsonResponse({ iceServers: STUN_ONLY })
  }
})
