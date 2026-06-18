import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAppForeground } from './useAppForeground.js'

export function useRealtimeOrder(orderId) {
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const refetch = useCallback(() => {
    if (!orderId) return
    supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single()
      .then(({ data, error }) => {
        if (error) setError(error.message)
        else setOrder(data)
        setLoading(false)
      })
  }, [orderId])

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

  // Self-heal on foreground: the realtime socket dies while backgrounded and
  // missed events aren't replayed, so an agent/consumer status change made while
  // the app was closed (approve, decline, cancel) would leave `order` stale.
  useAppForeground(refetch)

  function mutateOrder(patch) {
    setOrder(o => o ? { ...o, ...patch } : o)
  }

  return { order, loading, error, mutateOrder }
}
