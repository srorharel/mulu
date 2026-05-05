import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

export function useRealtimeOrder(orderId) {
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
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

    const channel = supabase
      .channel(`order:${orderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        (payload) => setOrder(payload.new)
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [orderId])

  return { order, loading, error }
}
