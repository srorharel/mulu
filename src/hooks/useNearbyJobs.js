import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'
import { haversineKm } from '../lib/geo.js'

const RADIUS_KM = 15

// Minimal projection of the fields the job list actually renders / sorts on.
// Used to skip no-op setState after a refetch: if the incoming list is identical
// to current state by this signature, we keep the existing array reference so
// React preserves every JobCard node (no remount, no flicker).
function signature(rows) {
  return rows
    .map(j => `${j.id}:${j.status}:${j.distance_km}:${j.base_price}:${j.lat}:${j.lng}`)
    .join('|')
}

// Deterministic nearest-first order — mirrors the RPC's `ORDER BY distance_km ASC`,
// tie-broken by id so equal distances never reshuffle unrelated rows between renders.
function sortJobs(rows) {
  return [...rows].sort((a, b) => {
    const da = a.distance_km ?? Infinity
    const db = b.distance_km ?? Infinity
    if (da !== db) return da - db
    return String(a.id).localeCompare(String(b.id))
  })
}

// Best-effort lat/lng from a raw realtime `orders` row. The nearby_jobs RPC derives
// these via ST_Y/ST_X server-side; the raw row instead carries either explicit
// lat/lng (future generated columns / the test) or a `POINT(lng lat)` WKT string.
// Returns null when neither is available, so the caller can fall back gracefully.
function rowLatLng(row) {
  if (row == null) return null
  if (typeof row.lat === 'number' && typeof row.lng === 'number') {
    return { lat: row.lat, lng: row.lng }
  }
  const m = typeof row.location === 'string'
    ? row.location.match(/POINT\s*\(\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\)/i)
    : null
  if (m) return { lat: Number(m[2]), lng: Number(m[1]) }
  return null
}

// Module-level stale-while-revalidate cache for the nearby-jobs list, preserved
// across dashboard remounts (see the note in the hook). Off under Vitest so each
// test starts clean and the cross-test state can't leak.
const CACHE_ENABLED = !import.meta.env.VITEST
let cachedJobs = []

export function useNearbyJobs(position, enabled = true) {
  // Stale-while-revalidate cache: the washer dashboard fully unmounts when the
  // washer opens a job's details (/washer/job/:id lives under a different layout)
  // and remounts on return. Without this, the list would reset to empty and flash
  // "no jobs" while GPS + the RPC re-acquire — i.e. the order they just tapped
  // looks like it disappeared. Seeding from the last-known list shows it instantly,
  // then a silent refetch reconciles. Disabled under Vitest for clean test state.
  const seeded = CACHE_ENABLED && cachedJobs.length > 0
  const [jobs, setJobs]       = useState(seeded ? cachedJobs : [])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  // Refs let the realtime handler read the latest position / jobs without being
  // re-created (and without re-subscribing the channel) on every GPS tick.
  const posRef  = useRef(position)
  const jobsRef = useRef(jobs)
  // The skeleton/"looking for jobs" state shows ONLY for the genuine first load of
  // a session. Every later update (GPS movement, realtime, refresh()) reconciles
  // the list silently/in place — so it never re-flashes a refresh spinner, even
  // while the list is momentarily empty. Seeding from cache (a remount) counts as
  // already-loaded, so the refetch stays silent (no skeleton over the cached list).
  const loadedOnceRef = useRef(seeded)
  // Position we last actually refetched at. Used to ignore sub-50 m GPS jitter so
  // the list doesn't churn + re-sort on every watch tick.
  const lastFetchRef  = useRef(null)
  useEffect(() => { posRef.current = position }, [position?.lat, position?.lng]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { jobsRef.current = jobs }, [jobs])

  // Commit a new list only if its rendered signature actually changed. This is
  // what kills the periodic flicker: an identical poll/refetch returns the SAME
  // array reference, so nothing downstream re-renders.
  const commit = useCallback((nextRows) => {
    const sorted = sortJobs(nextRows)
    if (CACHE_ENABLED) cachedJobs = sorted
    setJobs(prev => (signature(prev) === signature(sorted) ? prev : sorted))
  }, [])

  // Full list fetch via the RPC. The searching/skeleton state is shown ONLY for
  // the initial empty fetch — never on a realtime- or GPS-driven refetch (that
  // toggle was the visible "refresh"). Pass { silent: true } to suppress it even
  // when the list is currently empty: a realtime-driven refetch must never flash a
  // spinner — the new order should just pop in.
  const fetchJobs = useCallback(async (lat, lng, { silent = false } = {}) => {
    // First load only — keyed on "have we ever fetched", NOT on list emptiness, so
    // a later refetch over an empty list can't re-flash the skeleton.
    const isInitial = !silent && !loadedOnceRef.current
    if (isInitial) setLoading(true)
    setError(null)
    const { data, error } = await supabase.rpc('nearby_jobs', {
      washer_lat: lat,
      washer_lng: lng,
      radius_km:  RADIUS_KM,
    })
    if (error) setError(error.message)
    else commit(data ?? [])
    loadedOnceRef.current = true
    if (isInitial) setLoading(false)
  }, [commit])

  // Apply a realtime `orders` change. Removals (DELETE / left-pending / out-of-range)
  // and coord-bearing upserts happen in place with no RPC. The one case that needs a
  // refetch is a new/updated pending order whose coordinates the realtime row does
  // NOT carry — see the fallback at the bottom.
  const applyRealtime = useCallback((payload) => {
    const next = payload?.new ?? {}
    const old  = payload?.old ?? {}
    const id   = next.id ?? old.id
    if (!id) return

    const current = jobsRef.current
    const without = current.filter(j => j.id !== id)
    const dropIfPresent = () => { if (without.length !== current.length) commit(without) }

    // DELETE, or the order left the pending pool (accepted/cancelled/…): remove it.
    if (payload?.eventType === 'DELETE' || next.status !== 'pending') {
      dropIfPresent()
      return
    }

    // INSERT / UPDATE of a pending order. If the realtime row carries usable coords
    // we place it incrementally (one row in/out, no RPC — keeps the list stable).
    const pos = posRef.current
    const ll  = rowLatLng(next)
    if (ll && pos) {
      const distance_km = Math.round(haversineKm(pos.lat, pos.lng, ll.lat, ll.lng) * 100) / 100
      if (distance_km > RADIUS_KM) { dropIfPresent(); return }
      const existing = current.find(j => j.id === id)
      const merged   = { ...existing, ...next, lat: ll.lat, lng: ll.lng, distance_km }
      commit([...without, merged])
      return
    }

    // We could NOT derive coordinates from the realtime row — the normal production
    // case: Postgres logical replication serializes the PostGIS `location` as EWKB
    // hex (not WKT `POINT(...)`) and strips the generated lat/lng columns entirely,
    // so `next` has nothing to place the order from. Previously we bailed here, so a
    // brand-new in-range order stayed invisible until the washer happened to move and
    // a GPS tick refetched — i.e. it looked like you had to refresh. Instead refetch
    // now: the same silent RPC a GPS tick runs ({ silent } = no spinner), with the
    // signature no-op in commit() keeping it flicker-free, so the order just pops in.
    if (pos) { fetchJobs(pos.lat, pos.lng, { silent: true }); return }

    // No washer position yet — can't refetch either; the initial GPS fetch reconciles.
    dropIfPresent()
  }, [commit, fetchJobs])

  // Fetch (and refetch on position change) — silent except for the initial load.
  // Ignore sub-50 m GPS jitter: a watch tick that barely moved would otherwise
  // refetch + re-sort the list every second. New/removed orders still arrive live
  // over the realtime channel, so the list stays current without that churn.
  useEffect(() => {
    if (!enabled || !position) return
    const last = lastFetchRef.current
    if (last && haversineKm(last.lat, last.lng, position.lat, position.lng) < 0.05) return
    lastFetchRef.current = { lat: position.lat, lng: position.lng }
    fetchJobs(position.lat, position.lng)
  }, [position?.lat, position?.lng, enabled, fetchJobs]) // eslint-disable-line react-hooks/exhaustive-deps

  // Going offline clears the movement anchor so the next online session refetches.
  useEffect(() => {
    if (!enabled) lastFetchRef.current = null
  }, [enabled])

  // Subscribe once per online session (not per GPS tick). Listen to all orders
  // changes and decide client-side, so we also catch pending → accepted/cancelled
  // transitions (a server-side status=eq.pending filter would drop those UPDATEs).
  useEffect(() => {
    if (!enabled) return
    const channel = supabase
      .channel('pending_orders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        applyRealtime,
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [enabled, applyRealtime])

  // Stable identity (deps: the memoized fetchJobs) so consumers can list it in an
  // effect's deps without the effect re-firing every render. Returns fetchJobs'
  // promise so callers can `await` a manual refresh.
  const refresh = useCallback(
    () => (posRef.current ? fetchJobs(posRef.current.lat, posRef.current.lng) : undefined),
    [fetchJobs],
  )

  return { jobs, loading, error, refresh }
}
