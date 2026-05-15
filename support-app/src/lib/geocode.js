// Minimal reverse geocoder using Nominatim.
// Production note: Nominatim is rate-limited (1 req/sec). Fine for low-volume internal use.

import { useState, useEffect } from 'react'

const NOMINATIM = 'https://nominatim.openstreetmap.org/reverse'
const UA        = 'WashSupport/1.0'
const cache     = new Map()

function cacheKey(lat, lng) {
  return `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`
}

function buildShortAddress(addr) {
  if (!addr) return null
  const street = addr.road ?? addr.pedestrian ?? addr.footway ?? null
  const area   = addr.city ?? addr.town ?? addr.village ?? addr.suburb ?? null
  const num    = addr.house_number ?? null
  const streetPart = street ? (num ? `${street} ${num}` : street) : null
  if (streetPart && area) return `${streetPart}, ${area}`
  return streetPart ?? area ?? null
}

export async function reverseGeocode(lat, lng) {
  if (lat == null || lng == null) return null
  const key = cacheKey(lat, lng)
  if (cache.has(key)) return cache.get(key)

  try {
    const res = await fetch(
      `${NOMINATIM}?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=en`,
      { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(5000) }
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const address = buildShortAddress(data.address) ?? data.display_name ?? null
    cache.set(key, address)
    return address
  } catch {
    return null
  }
}

export function useReverseGeocode(lat, lng) {
  const key = lat != null && lng != null ? cacheKey(lat, lng) : null
  const [address, setAddress] = useState(() => key ? cache.get(key) ?? null : null)

  useEffect(() => {
    if (!key) return
    if (cache.has(key)) { setAddress(cache.get(key)); return }
    reverseGeocode(lat, lng).then(a => { if (a) setAddress(a) })
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  return address
}
