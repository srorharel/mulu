import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase.js'

// First-wash discount eligibility (ADR-040): a consumer with no prior
// non-cancelled order gets 30% off. Display-only mirror of the server-side
// check in validate_order_prices (migration 0111) — the trigger decides the
// real price at insert time, so a stale/false positive here only mislabels
// the preview, never the charge.
export function useFirstWashDiscount(userId) {
  const [eligible, setEligible] = useState(false)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    if (!userId) { setEligible(false); setLoading(false); return }
    let active = true
    supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('consumer_id', userId)
      .neq('status', 'cancelled')
      .then(({ count, error }) => {
        if (!active) return
        setEligible(!error && count === 0)
        setLoading(false)
      })
    return () => { active = false }
  }, [userId])

  return { eligible, loading }
}
