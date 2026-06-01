import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'

// Active = anything not terminal (completed/cancelled). A consumer may legitimately
// have several at once — booking a second car while one is in progress is supported
// (no DB constraint blocks it), so this always loads a LIST.
const ACTIVE_STATUSES = ['pending', 'accepted', 'en_route', 'arrived', 'in_progress', 'pending_approval']

// useConsumerActiveOrders() -> { orders, loading }
// Loads the signed-in consumer's active orders (newest first) for the /home list.
// Fetches on mount; /home remounts whenever the consumer returns to it, so the list
// is refreshed after booking or after viewing a tracking screen.
export function useConsumerActiveOrders() {
  const { user } = useAuth()
  const [orders, setOrders]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.id) { setOrders([]); setLoading(false); return }
    let cancelled = false
    setLoading(true)
    supabase
      .from('orders')
      .select('id, status, address_label, total_price, created_at')
      .eq('consumer_id', user.id)
      .in('status', ACTIVE_STATUSES)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (cancelled) return
        if (!error) setOrders(data ?? [])
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [user?.id])

  return { orders, loading }
}
