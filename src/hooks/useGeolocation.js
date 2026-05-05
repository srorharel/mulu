import { useState, useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'

// Haversine distance in km — inlined to keep the hook self-contained.
function haversineKm(p1, p2) {
  const R = 6371
  const dLat = (p2.lat - p1.lat) * Math.PI / 180
  const dLng = (p2.lng - p1.lng) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// useGeolocation({ watch: false })
//
// Default (watch: false) — one-shot getCurrentPosition. Existing callers unchanged.
// Watch (watch: true) — continuous watchPosition with throttle:
//   emits when ≥3s have passed OR ≥10m of movement, whichever comes first.
//   First position always emits immediately (no cold-start delay).
//   Cleans up the watcher on unmount.
//
// Returns { position: { lat, lng } | null, error: string | null, loading: boolean }
export function useGeolocation({ watch = false } = {}) {
  const [position, setPosition] = useState(null)
  const [error, setError]       = useState(null)
  const [loading, setLoading]   = useState(true)

  // Throttle state stored in a ref (not React state) to avoid spurious re-renders.
  const throttle = useRef({ lastTime: 0, lastPos: null })

  useEffect(() => {
    let cancelled  = false
    let cleanedUp  = false

    const options = { enableHighAccuracy: true, timeout: 10000 }

    function applyPosition(lat, lng) {
      if (cancelled) return
      const newPos = { lat, lng }
      const t      = throttle.current
      const isFirst = t.lastPos === null
      const timePassed  = Date.now() - t.lastTime >= 3000
      const distPassed  = t.lastPos ? haversineKm(t.lastPos, newPos) >= 0.01 : true

      if (isFirst || timePassed || distPassed) {
        t.lastTime = Date.now()
        t.lastPos  = newPos
        setPosition(newPos)
        setLoading(false)
      }
    }

    function applyError(msg) {
      if (cancelled) return
      setError(msg)
      setLoading(false)
    }

    if (!watch) {
      // ── One-shot mode (existing behaviour, unchanged) ────────────────────────
      if (Capacitor.isNativePlatform()) {
        Geolocation.getCurrentPosition(options)
          .then(p => applyPosition(p.coords.latitude, p.coords.longitude))
          .catch(e => applyError(e.message ?? 'Location unavailable'))
      } else {
        if (!navigator.geolocation) { applyError('Geolocation not supported'); return }
        navigator.geolocation.getCurrentPosition(
          p  => applyPosition(p.coords.latitude, p.coords.longitude),
          e  => applyError(e.message),
          options
        )
      }
      return () => { cancelled = true }
    }

    // ── Watch mode ────────────────────────────────────────────────────────────
    if (Capacitor.isNativePlatform()) {
      let watchId = null

      Geolocation.watchPosition(options, (pos, err) => {
        if (cancelled) return
        if (err)  { applyError(err.message ?? 'Location unavailable'); return }
        if (pos)  applyPosition(pos.coords.latitude, pos.coords.longitude)
      }).then(id => {
        if (cleanedUp) {
          // Unmount raced the async resolve — clear immediately.
          Geolocation.clearWatch({ id })
        } else {
          watchId = id
        }
      }).catch(e => applyError(e.message ?? 'Location unavailable'))

      return () => {
        cancelled = true
        cleanedUp = true
        if (watchId) Geolocation.clearWatch({ id: watchId })
      }
    } else {
      if (!navigator.geolocation) { applyError('Geolocation not supported'); return }

      const watchId = navigator.geolocation.watchPosition(
        p => applyPosition(p.coords.latitude, p.coords.longitude),
        e => applyError(e.message),
        options
      )

      return () => {
        cancelled = true
        navigator.geolocation.clearWatch(watchId)
      }
    }
  }, [watch])

  return { position, error, loading }
}
