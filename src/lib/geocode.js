// Reverse geocoding via Nominatim (OpenStreetMap).
// PRODUCTION NOTE: Nominatim's public instance is rate-limited (1 req/sec) and
// requires caching per their usage policy. It is suitable for dev/demo/early launch
// only. Before serving real user volume, replace with a paid geocoder (Mapbox,
// Google Maps Platform, etc.) that offers SLA-backed rate limits and billing.
//
// Usage policy: https://operations.osmfoundation.org/policies/nominatim/

import { useEffect, useState } from 'react'

const NOMINATIM = 'https://nominatim.openstreetmap.org/reverse'
const UA        = 'SparkleGo/1.0'
const TIMEOUT_MS = 5000

// ── In-memory cache keyed by "lat4,lng4" (4 decimal places ≈ 11m precision) ──
const memCache = new Map()

function cacheKey(lat, lng) {
  return `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`
}

// ── localStorage persistence ───────────────────────────────────────────────────
const LS_KEY = 'sparkle_geocode_v1'

function loadLocalCache() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return
    const entries = JSON.parse(raw)
    for (const [k, v] of Object.entries(entries)) memCache.set(k, v)
  } catch { /* ignore */ }
}

function saveToLocalCache(key, address) {
  try {
    const raw = localStorage.getItem(LS_KEY)
    const entries = raw ? JSON.parse(raw) : {}
    entries[key] = address
    localStorage.setItem(LS_KEY, JSON.stringify(entries))
  } catch { /* ignore */ }
}

loadLocalCache()

// ── Rate-limiter: minimum 1 second between live requests ──────────────────────
let lastRequestAt = 0
const pendingQueue = []
let draining = false

function enqueue(fn) {
  return new Promise((resolve, reject) => {
    pendingQueue.push({ fn, resolve, reject })
    if (!draining) drain()
  })
}

async function drain() {
  draining = true
  while (pendingQueue.length > 0) {
    const now = Date.now()
    const wait = Math.max(0, lastRequestAt + 1000 - now)
    if (wait > 0) await new Promise(r => setTimeout(r, wait))
    const item = pendingQueue.shift()
    if (!item) break
    lastRequestAt = Date.now()
    try { item.resolve(await item.fn()) }
    catch (e) { item.reject(e) }
  }
  draining = false
}

// ── Core fetch ────────────────────────────────────────────────────────────────

async function fetchAddress(lat, lng) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const url = `${NOMINATIM}?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=he,en`
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const a = data.address ?? {}
    const street = a.road || a.pedestrian || a.path || ''
    const area   = a.suburb || a.neighbourhood || a.quarter || a.city_district || a.city || a.town || a.village || ''
    return [street, area].filter(Boolean).join(', ') || data.display_name || `${lat}, ${lng}`
  } catch {
    return null  // caller falls back to coords
  } finally {
    clearTimeout(timer)
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function reverseGeocode(lat, lng) {
  if (lat == null || lng == null) return null
  const key = cacheKey(lat, lng)
  if (memCache.has(key)) return memCache.get(key)

  const address = await enqueue(() => fetchAddress(lat, lng))
  const result  = address ?? `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`
  memCache.set(key, result)
  saveToLocalCache(key, result)
  return result
}

// ── React hook ────────────────────────────────────────────────────────────────

export function useReverseGeocode(lat, lng) {
  const key = lat != null && lng != null ? cacheKey(lat, lng) : null
  const [address, setAddress] = useState(() => key ? memCache.get(key) ?? null : null)
  const [loading, setLoading]  = useState(!!(key && !memCache.has(key)))

  useEffect(() => {
    if (!key) return
    if (memCache.has(key)) {
      setAddress(memCache.get(key))
      setLoading(false)
      return
    }
    setLoading(true)
    reverseGeocode(lat, lng).then(addr => {
      setAddress(addr)
      setLoading(false)
    })
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps

  return { address: address ?? (lat != null ? `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}` : null), loading }
}
