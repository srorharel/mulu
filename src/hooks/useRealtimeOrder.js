import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAppForeground } from './useAppForeground.js'
import { cacheOrder, readCachedOrder, removeCachedOrder } from '../lib/offlineCache.js'

const TERMINAL = new Set(['completed', 'cancelled'])

// `cache` (opt-in) mirrors the order row to localStorage and falls back to it
// when the fetch fails offline. Only the washer's active-job drawer enables it —
// that's the surface that must keep working underground; consumer/agent views
// pass it off so their behaviour is unchanged.
export function useRealtimeOrder(orderId, { cache = false } = {}) {
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(() => {
    if (!orderId) return
    // Offline read-through: if the network fetch fails and nothing is loaded yet
    // (cold start underground), hydrate from the cached snapshot so the panel
    // renders the last-known status instead of an endless spinner.
    const restoreFromCache = () => {
      if (!cache) return false
      const cached = readCachedOrder(orderId)
      if (cached) { setOrder(prev => prev ?? cached); return true }
      return false
    }
    supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single()
      .then(({ data, error }) => {
        if (error) {
          if (!restoreFromCache()) setError(error.message)
        } else {
          setOrder(data)
        }
        setLoading(false)
      })
      .catch(() => { restoreFromCache(); setLoading(false) })
  }, [orderId, cache])

  useEffect(() => {
    if (!orderId) return

    refetch()

    const channel = supabase
      .channel(`order:${orderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        (payload) => setOrder(payload.new)
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [orderId, refetch])

  // Mirror the order to the offline cache on every change (refetch, realtime,
  // and optimistic mutateOrder all flow through `order`). Drop it once terminal
  // so a finished job can't be re-hydrated. No-op unless `cache` is enabled.
  useEffect(() => {
    if (!cache || !order?.id) return
    if (TERMINAL.has(order.status)) removeCachedOrder(order.id)
    else cacheOrder(order)
  }, [cache, order])

  // Self-heal on foreground: the realtime socket dies while backgrounded and
  // missed events aren't replayed, so an agent/consumer status change made while
  // the app was closed (approve, decline, cancel) would leave `order` stale.
  useAppForeground(refetch)

  function mutateOrder(patch) {
    setOrder(o => o ? { ...o, ...patch } : o)
  }

  return { order, loading, error, mutateOrder }
}
