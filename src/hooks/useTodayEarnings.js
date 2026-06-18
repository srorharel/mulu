import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAppForeground } from './useAppForeground.js'

// Sum of the washer's payout on orders an agent has APPROVED (status =
// 'completed') today. ADR-015 originally rendered the dashboard "today" widget
// as a static `₪—`; this is the deferred follow-up. Mirrors the Earnings page:
// payout is `payout_amount` when set, else legacy `base_price`.
//
// `null` = still loading (so the widget can keep showing `₪—`).
//
// Kept live three ways, because realtime alone is unreliable on mobile (the
// socket dies while backgrounded and missed events aren't replayed):
//   1. `refreshSignal` — the caller passes the active-job id, so finishing a job
//      (panel clears) re-sums immediately.
//   2. realtime UPDATE on this washer's orders → refetch when one turns completed.
//   3. foreground refetch (useAppForeground) for everything missed while away.
export function useTodayEarnings(userId, refreshSignal) {
  const [amount, setAmount] = useState(null)

  const refetch = useCallback(async () => {
    if (!userId) return
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const { data, error } = await supabase
      .from('orders')
      .select('payout_amount, base_price')
      .eq('washer_id', userId)
      .eq('status', 'completed')
      .gte('completed_at', start.toISOString())
    if (error) { console.error('[today-earnings] fetch failed:', error); return }
    const sum = (data ?? []).reduce((s, o) => s + Number(o.payout_amount ?? o.base_price ?? 0), 0)
    setAmount(sum)
  }, [userId])

  // Initial load + whenever the active job changes (a completion clears it).
  useEffect(() => { refetch() }, [refetch, refreshSignal])

  // Best-effort live bump when one of this washer's orders is marked completed.
  useEffect(() => {
    if (!userId) return undefined
    const channel = supabase
      .channel(`today-earnings:${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `washer_id=eq.${userId}` },
        (payload) => { if (payload.new?.status === 'completed') refetch() },
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [userId, refetch])

  // Self-heal on foreground (realtime misses events while backgrounded).
  useAppForeground(refetch)

  return amount
}
