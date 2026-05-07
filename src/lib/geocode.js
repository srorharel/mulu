// Reverse geocoding via Nominatim (OpenStreetMap).
// PRODUCTION NOTE: Nominatim's public instance is rate-limited (1 req/sec) and
// requires caching per their usage policy. It is suitable for dev/demo/early launch
// only. Before serving real user volume, replace with a paid geocoder (Mapbox,
// Google Maps Platform, etc.) that offers SLA-backed rate limits and billing.
//
// Usage policy: https://operations.osmfoundation.org/policies/nominatim/

import { useEffect, useState } from 'react'
import i18n from '../i18n/index.js'

const NOMINATIM = 'https://nominatim.openstreetmap.org/reverse'
const UA        = 'SparkleGo/1.0'
const TIMEOUT_MS = 5000

// ── In-memory cache keyed by "lat4,lng4" (4 decimal places ≈ 11m precision) ──
const memCache = new Map()

function cacheKey(lat, lng) {
  return `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`
}

// ── localStorage persistence ───────────────────────────────────────────────────
const LS_KEY = 'sparkle_geocode_v3'

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

// ── Short-form address builder ────────────────────────────────────────────────

function buildShortAddress(addr) {
  if (!addr) return null

  const street = addr.road
    ?? addr.pedestrian
    ?? addr.footway
    ?? addr.path
    ?? addr.cycleway
    ?? null

  // City-first: prefer specific city over suburb/neighbourhood
  const area = addr.city
    ?? addr.town
    ?? addr.village
    ?? addr.suburb
    ?? addr.neighbourhood
    ?? null

  const houseNumber = addr.house_number ?? null

  // English-speaking countries use "number street"; everywhere else uses "street number"
  const numberFirst = ['us', 'gb', 'ca', 'au', 'nz', 'ie'].includes(addr.country_code)

  let streetPart
  if (street && houseNumber) {
    streetPart = numberFirst
      ? `${houseNumber} ${street}`
      : `${street} ${houseNumber}`
  } else if (street) {
    streetPart = street
  } else {
    streetPart = null
  }

  if (streetPart && area) return `${streetPart}, ${area}`
  if (streetPart) return streetPart
  if (area) return area
  return null
}

// ── Core fetch ────────────────────────────────────────────────────────────────

async function fetchAddress(lat, lng) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const lang = i18n.language ?? 'en'
    const url = `${NOMINATIM}?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=${lang},en`
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    return buildShortAddress(data.address) ?? data.display_name ?? null
  } catch {
    return null  // caller falls back to coords
  } finally {
    clearTimeout(timer)
  }
}

// ── Coord-string detector — used by consumers to identify legacy address_label ─
const COORDS_PATTERN = /^-?\d+\.\d+\s*,\s*-?\d+\.\d+$/

export function looksLikeCoords(str) {
  return typeof str === 'string' && COORDS_PATTERN.test(str.trim())
}

// ── Failure cooldown: prevents hammering Nominatim when it's down ─────────────
// Not persisted — resets on every page load so the next session retries fresh.
const recentFailures      = new Map()
const FAILURE_COOLDOWN_MS = 60_000

// ── Public API ────────────────────────────────────────────────────────────────

export async function reverseGeocode(lat, lng) {
  if (lat == null || lng == null) return null
  const key = cacheKey(lat, lng)
  if (memCache.has(key)) return memCache.get(key)

  const lastFailure = recentFailures.get(key)
  if (lastFailure && Date.now() - lastFailure < FAILURE_COOLDOWN_MS) {
    return `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`
  }

  const address = await enqueue(() => fetchAddress(lat, lng))
  if (address) {
    memCache.set(key, address)
    saveToLocalCache(key, address)
    return address
  }
  recentFailures.set(key, Date.now())
  return `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}`
}

// ── Forward geocoding ─────────────────────────────────────────────────────────

const FORWARD_BASE = 'https://nominatim.openstreetmap.org/search'

async function fetchForwardGeocode(query, countryCodes) {
  const url = new URL(FORWARD_BASE)
  url.searchParams.set('format',        'jsonv2')
  url.searchParams.set('q',             query)
  url.searchParams.set('limit',         '1')
  url.searchParams.set('countrycodes',  countryCodes)
  url.searchParams.set('accept-language', `${i18n.language ?? 'en'},en`)
  url.searchParams.set('addressdetails', '1')

  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA } })
    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) return null
    const top = data[0]
    return {
      lat:         parseFloat(top.lat),
      lng:         parseFloat(top.lon),
      address:     top.address      ?? null,
      displayName: top.display_name ?? null,
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const forwardCache          = new Map()
const forwardRecentFailures = new Map()

export async function forwardGeocode(query, countryCodes = 'il') {
  if (!query || query.trim().length < 3) return null
  const key = `${countryCodes}:${query.trim().toLowerCase()}`

  if (forwardCache.has(key)) return forwardCache.get(key)

  const lastFailure = forwardRecentFailures.get(key)
  if (lastFailure && Date.now() - lastFailure < FAILURE_COOLDOWN_MS) return null

  const result = await enqueue(() => fetchForwardGeocode(query, countryCodes))

  if (result) {
    forwardCache.set(key, result)
  } else {
    forwardRecentFailures.set(key, Date.now())
  }
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
