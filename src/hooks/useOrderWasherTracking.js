import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { haversineKm, etaMinutes } from '../lib/geo.js'

// Statuses during which the washer is moving toward / at the job and the consumer
// should see a live marker + ETA. Mirrors the server-side filter in the
// get_order_washer_location RPC (migration 0106) — keep the two in sync.
const ACTIVE_STATUSES = new Set(['accepted', 'en_route', 'arrived', 'in_progress'])
const POLL_MS  = 6_000
const STALE_MS = 60_000

// useOrderWasherTracking({ orderId, status, jobLat, jobLng })
//
// Polls the scoped, leak-safe get_order_washer_location RPC every 6s while the order
// is in an active status, and derives a straight-line ETA from the washer's position
// to the job. We poll (rather than subscribe to realtime) on purpose: realtime would
// need a profiles SELECT policy that reopens the fleet-wide washer-GPS leak (ADR-032
// / migration 0099). The washer writes every ~10s, so 6s polling is effectively live.
//
// Returns { location: { lat, lng, updatedAt } | null, etaMin: number | null, stale }
//   - location null when status is non-active OR the washer is unassigned / terminal
//     (the RPC returns zero rows). No error toast on empty results.
//   - stale = the last washer write is older than 60s (UI shows "Updating location…").
export function useOrderWasherTracking({ orderId, status, jobLat, jobLng }) {
  const [location, setLocation] = useState(null)
  const [stale, setStale]       = useState(false)

  useEffect(() => {
    // Not active → no polling, cleared state. Cleanup of any prior interval has
    // already run, so leaving the active set stops polling.
    if (!orderId || !ACTIVE_STATUSES.has(status)) {
      setLocation(null)
      setStale(false)
      return
    }

    let cancelled = false

    async function poll() {
      const { data, error } = await supabase.rpc('get_order_washer_location', { p_order_id: orderId })
      if (cancelled || error) return // transient error → keep last value, never toast
      const row = Array.isArray(data) ? data[0] : data
      if (!row || row.lat == null || row.lng == null) {
        setLocation(null)
        setStale(false)
        return
      }
      const updatedAt = row.updated_at ?? null
      setLocation({ lat: row.lat, lng: row.lng, updatedAt })
      setStale(updatedAt ? Date.now() - new Date(updatedAt).getTime() > STALE_MS : false)
    }

    poll() // immediate first read — don't make the consumer wait one interval
    const intervalId = setInterval(poll, POLL_MS)
    return () => { cancelled = true; clearInterval(intervalId) }
  }, [orderId, status])

  const etaMin =
    location && jobLat != null && jobLng != null
      ? etaMinutes(haversineKm(location.lat, location.lng, jobLat, jobLng))
      : null

  return { location, etaMin, stale }
}
