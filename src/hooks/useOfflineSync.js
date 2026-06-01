import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase.js'
import { isOnlineSync, subscribeOnline } from '../lib/offlineSync/connectivity.js'
import { replayAll, getCapturesByOrder } from '../lib/offlineSync/engine.js'

// Drives the underground offline-capture replay engine (ADR-035).
//
// Replays queued captures on mount (app-init — the app may have been killed
// while underground) and whenever connectivity is restored. When `orderId` is
// given, also tracks that order's pending-sync state for the UI indicator.
//
// `enabled` lets the caller engage the engine only for underground orders.
export function useOfflineSync(orderId, { enabled = true, onSynced } = {}) {
  const [online,  setOnline]  = useState(isOnlineSync())
  const [syncing, setSyncing] = useState(false)
  const [pending, setPending] = useState(0)     // replayable captures for this order
  const [hasError, setHasError] = useState(false)
  const runningRef = useRef(false)
  const onSyncedRef = useRef(onSynced)
  useEffect(() => { onSyncedRef.current = onSynced }, [onSynced])

  const refreshPending = useCallback(async () => {
    if (!orderId) { setPending(0); setHasError(false); return }
    try {
      const recs = await getCapturesByOrder(orderId)
      const live = recs.filter(r => ['queued', 'syncing', 'error'].includes(r.status))
      setPending(live.length)
      setHasError(live.some(r => r.status === 'error'))
    } catch { /* IndexedDB unavailable — nothing to show */ }
  }, [orderId])

  const runReplay = useCallback(async () => {
    if (!enabled || runningRef.current) return
    if (!isOnlineSync()) return            // offline: nothing to do yet
    runningRef.current = true
    setSyncing(true)
    try {
      const results = await replayAll(supabase)
      if (results.some(r => r.outcome === 'done') && onSyncedRef.current) onSyncedRef.current()
    } catch { /* transient — retried on next trigger */ }
    finally {
      runningRef.current = false
      setSyncing(false)
      await refreshPending()
    }
  }, [enabled, refreshPending])

  // Connectivity subscription — replay as soon as we're back online.
  useEffect(() => {
    if (!enabled) return undefined
    const unsub = subscribeOnline((isOn) => {
      setOnline(isOn)
      if (isOn) runReplay()
    })
    return unsub
  }, [enabled, runReplay])

  // App-init: surface any pending queue + attempt a replay (covers a session
  // that was killed underground with captures still queued).
  useEffect(() => {
    if (!enabled) return
    refreshPending()
    runReplay()
  }, [enabled, refreshPending, runReplay])

  return { online, syncing, pending, hasError, runReplay, refreshPending }
}
