import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useAppForeground } from './useAppForeground.js'

// Active = anything not terminal (completed/cancelled). A consumer may legitimately
// have several at once — booking a second car while one is in progress is supported
// (no DB constraint blocks it), so this always loads a LIST.
const ACTIVE_STATUSES = ['pending', 'accepted', 'en_route', 'arrived', 'in_progress', 'pending_approval']

const COLUMNS = 'id, status, address_label, total_price, created_at'

// An order is only a "live wash" for the consumer once it is PAID. A pending order
// that is still unpaid is an abandoned-at-checkout booking (the order row is created
// before payment) — it must NOT surface as an active wash on /home until the payment
// passes, the same gate the washer pool uses (paid_at). paid_at rides in the realtime
// payload (the full row), so we can check it without adding it to COLUMNS.
function isLiveForConsumer(row) {
  return ACTIVE_STATUSES.includes(row.status) && row.paid_at != null
}

// Realtime payload rows carry the full order; keep only what the /home card reads.
function normalize(row) {
  return {
    id:            row.id,
    status:        row.status,
    address_label: row.address_label,
    total_price:   row.total_price,
    created_at:    row.created_at,
  }
}

// useConsumerActiveOrders() -> { orders, loading, refresh }
// Loads the signed-in consumer's active orders (newest first) for the /home card,
// then keeps them LIVE: the consumer always retains read access to their own orders
// (RLS), so every status transition (pending → accepted → en_route → … ) streams in
// and the home tracking card advances on-screen. A terminal transition
// (completed/cancelled) drops the row, so the card disappears the moment the wash
// ends. Realtime is best-effort (sockets die while backgrounded with no replay), so
// a foreground refetch self-heals anything missed while the app was closed.
export function useConsumerActiveOrders() {
  const { user } = useAuth()
  const [orders, setOrders]   = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(() => {
    if (!user?.id) { setOrders([]); setLoading(false); return }
    supabase
      .from('orders')
      .select(COLUMNS)
      .eq('consumer_id', user.id)
      .in('status', ACTIVE_STATUSES)
      .not('paid_at', 'is', null)        // hide unpaid (abandoned-checkout) orders
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error) setOrders(data ?? [])
        setLoading(false)
      })
  }, [user?.id])

  // Initial load + reload when the signed-in user changes.
  useEffect(() => { setLoading(true); refresh() }, [refresh])

  // Live updates for the consumer's own orders.
  useEffect(() => {
    if (!user?.id) return

    const apply = (payload) => {
      const row = payload.new
      if (!row?.id) return
      setOrders(prev => {
        const without = prev.filter(o => o.id !== row.id)
        // Unpaid (abandoned checkout), terminal, or otherwise non-active → no card.
        if (!isLiveForConsumer(row)) return without
        // Paid + active → upsert and keep newest-first.
        const next = [normalize(row), ...without]
        next.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        return next
      })
    }

    const channel = supabase
      .channel(`consumer-active-orders:${user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `consumer_id=eq.${user.id}` }, apply)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: `consumer_id=eq.${user.id}` }, apply)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [user?.id])

  // Self-heal on foreground: refetch what realtime missed while backgrounded.
  useAppForeground(refresh)

  return { orders, loading, refresh }
}
