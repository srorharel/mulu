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

// iOS Safari silently denies geolocation unless called from a synchronous user gesture.
// Detect once at module level so the check is free on every call.
export const isIOSSafari =
  typeof navigator !== 'undefined' &&
  /iPad|iPhone|iPod/.test(navigator.userAgent) &&
  /Safari/.test(navigator.userAgent) &&
  !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent)

// useGeolocation({ watch: false })
//
// Default (watch: false) — one-shot getCurrentPosition. Existing callers unchanged.
// Watch (watch: true) — continuous watchPosition with throttle:
//   emits when ≥3s have passed OR ≥10m of movement, whichever comes first.
//   First position always emits immediately (no cold-start delay).
//   Cleans up the watcher on unmount.
//
// iOS Safari gate: on mount the hook stays idle (permissionState: 'idle', no auto-request).
// Call requestPermission() from a tap handler to start the request. iOS will then show
// the system prompt because the call originates from a synchronous user gesture.
// All other platforms (Capacitor native, Android, desktop) auto-request on mount.
//
// Returns { position, error, loading, permissionState, requestPermission }
//   permissionState: 'idle' | 'prompting' | 'granted' | 'denied'
export function useGeolocation({ watch = false } = {}) {
  const [position, setPosition] = useState(null)
  const [error, setError]       = useState(null)
  // Don't start in loading state on iOS Safari — nothing is happening yet.
  const [loading, setLoading]   = useState(!isIOSSafari)
  const [permissionState, setPermissionState] = useState(isIOSSafari ? 'idle' : 'prompting')
  // enabled starts false on iOS Safari; requestPermission() flips it true.
  const [enabled, setEnabled]   = useState(!isIOSSafari)

  // Throttle state in a ref to avoid spurious re-renders.
  const throttle = useRef({ lastTime: 0, lastPos: null })

  function requestPermission() {
    if (enabled) return // already triggered
    setLoading(true)
    setPermissionState('prompting')
    setEnabled(true)
  }

  useEffect(() => {
    if (!enabled) return // iOS Safari idle — wait for requestPermission()

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
        setPermissionState('granted')
      }
    }

    function applyError(msg) {
      if (cancelled) return
      setError(msg)
      setLoading(false)
      setPermissionState('denied')
    }

    if (!watch) {
      // ── One-shot mode ────────────────────────────────────────────────────────
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
  }, [watch, enabled])

  return { position, error, loading, permissionState, requestPermission }
}
