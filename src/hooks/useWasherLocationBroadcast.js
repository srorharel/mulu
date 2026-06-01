import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useGeolocation } from './useGeolocation.js'

// useWasherLocationBroadcast(active)
//
// Keeps the washer's location flowing while they have an ACTIVE job but are OFF the
// Dashboard. The Dashboard (WasherMapShell) already broadcasts every 10s while online
// — and a washer can't go offline with an active job (Dashboard.handleToggle) — so
// the only freeze case is navigating to a washer SUB-page (earnings/shop/settings/
// job-detail under WasherShell), which unmounts the Dashboard and its broadcast.
// Mounting this in WasherShell with active = has-active-job closes that gap. The two
// broadcasters never run at once (the two shells are mutually-exclusive routes), so
// there is no double GPS watcher and the Dashboard stays unchanged.
//
// This deliberately MIRRORS the Dashboard's two write effects exactly
// (current_location PostGIS + throttled last_lat/last_lng/last_location_at) rather
// than inventing a second, divergent write path.
//
//   active === true  → watch GPS, write current_location eagerly + last_* every 10s.
//   active === false → useGeolocation runs in one-shot mode and no writes happen.
export function useWasherLocationBroadcast(active) {
  const { user } = useAuth()
  const { position } = useGeolocation({ watch: active })
  const lastPersistedAtRef = useRef(0)

  // current_location (PostGIS) — eager while active. Mirrors Dashboard.jsx:214-221.
  useEffect(() => {
    if (!active || !user?.id || !position) return
    supabase
      .from('profiles')
      .update({ current_location: `POINT(${position.lng} ${position.lat})` })
      .eq('id', user.id)
  }, [position?.lat, position?.lng, active, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // last_lat/last_lng/last_location_at — throttled to 10s. Mirrors Dashboard.jsx:223-244.
  useEffect(() => {
    if (!active || !position || !user?.id) return
    const now = Date.now()
    if (now - lastPersistedAtRef.current < 10_000) return
    lastPersistedAtRef.current = now
    supabase
      .from('profiles')
      .update({ last_lat: position.lat, last_lng: position.lng, last_location_at: new Date().toISOString() })
      .eq('id', user.id)
      .select('id')
      .then(({ data, error }) => {
        if (error) {
          console.error('[washer-broadcast] write failed (error):', error)
          lastPersistedAtRef.current = 0
        } else if (!data || data.length === 0) {
          console.error('[washer-broadcast] write matched 0 rows — RLS may be blocking. user.id:', user.id)
          lastPersistedAtRef.current = 0
        }
      })
  }, [position?.lat, position?.lng, active, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps
}
