import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'

// Returns the number of unread messages in an order chat for the current user.
// "Unread" means read_at IS NULL and sender_id != auth.uid().
// Refresh on screen focus is acceptable for v1 — this hook only re-queries
// when orderId changes (e.g., when the component remounts).
export function useOrderUnreadCount(orderId) {
  const { user }   = useAuth()
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!orderId || !user) { setCount(0); return }
    supabase
      .from('order_messages')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', orderId)
      .is('read_at', null)
      .neq('sender_id', user.id)
      .then(({ count: c }) => setCount(c ?? 0))
  }, [orderId, user?.id])

  return count
}
