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

export function useNearbyJobs(position, enabled = true) {
  const [jobs, setJobs]       = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  // Refs let the realtime handler read the latest position / jobs without being
  // re-created (and without re-subscribing the channel) on every GPS tick.
  const posRef  = useRef(position)
  const jobsRef = useRef(jobs)
  useEffect(() => { posRef.current = position }, [position?.lat, position?.lng]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { jobsRef.current = jobs }, [jobs])

  // Commit a new list only if its rendered signature actually changed. This is
  // what kills the periodic flicker: an identical poll/refetch returns the SAME
  // array reference, so nothing downstream re-renders.
  const commit = useCallback((nextRows) => {
    const sorted = sortJobs(nextRows)
    setJobs(prev => (signature(prev) === signature(sorted) ? prev : sorted))
  }, [])

  // Full list fetch via the RPC. The searching/skeleton state is shown ONLY for
  // the initial empty fetch — never on a realtime- or GPS-driven refetch (that
  // toggle was the visible "refresh").
  const fetchJobs = useCallback(async (lat, lng) => {
    const isInitial = jobsRef.current.length === 0
    if (isInitial) setLoading(true)
    setError(null)
    const { data, error } = await supabase.rpc('nearby_jobs', {
      washer_lat: lat,
      washer_lng: lng,
      radius_km:  RADIUS_KM,
    })
    if (error) setError(error.message)
    else commit(data ?? [])
    if (isInitial) setLoading(false)
  }, [commit])

  // Incremental single-row merge for a realtime change — NEVER refetches the list.
  // INSERT/UPDATE of an in-range pending order upserts that one row (distance
  // recomputed client-side); leaving pending / moving out of range / DELETE drops it.
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

    // INSERT / UPDATE of a pending order: place it if we can locate it and it's
    // in range. If we can't compute distance yet (no position / no coords), leave
    // the list as-is — the next GPS-driven fetch reconciles it, without a refetch here.
    const ll  = rowLatLng(next)
    const pos = posRef.current
    if (!ll || !pos) { dropIfPresent(); return }

    const distance_km = Math.round(haversineKm(pos.lat, pos.lng, ll.lat, ll.lng) * 100) / 100
    if (distance_km > RADIUS_KM) { dropIfPresent(); return }

    const existing = current.find(j => j.id === id)
    const merged   = { ...existing, ...next, lat: ll.lat, lng: ll.lng, distance_km }
    commit([...without, merged])
  }, [commit])

  // Fetch (and refetch on position change) — silent except for the initial load.
  useEffect(() => {
    if (!enabled || !position) return
    fetchJobs(position.lat, position.lng)
  }, [position?.lat, position?.lng, enabled, fetchJobs]) // eslint-disable-line react-hooks/exhaustive-deps

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

  return {
    jobs,
    loading,
    error,
    refresh: () => posRef.current && fetchJobs(posRef.current.lat, posRef.current.lng),
  }
}
