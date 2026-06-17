import { supabase } from './supabase.js'

// STUN-only fallback. Used if the turn-credentials Edge Function is missing,
// errors, or no TURN provider is configured yet. STUN alone is enough on good
// networks / same-LAN but not for many cellular NATs — a real TURN server
// (Cloudflare Realtime TURN) is what makes calls connect reliably on mobile.
const STUN_FALLBACK = [{ urls: 'stun:stun.l.google.com:19302' }]

// Fetches short-lived ICE servers for a WebRTC call. Never throws — degrades to
// STUN so a call attempt still proceeds (it just may not connect across strict
// NATs without TURN).
export async function getIceServers() {
  try {
    const { data, error } = await supabase.functions.invoke('turn-credentials')
    if (error || !data?.iceServers) return STUN_FALLBACK
    const servers = Array.isArray(data.iceServers) ? data.iceServers : [data.iceServers]
    return servers.length ? servers : STUN_FALLBACK
  } catch {
    return STUN_FALLBACK
  }
}
