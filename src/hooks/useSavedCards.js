import { useState, useEffect, useCallback } from 'react'
import { FEATURES } from '../lib/featureFlags.js'
import { listSavedCards, deleteSavedCard, setDefaultCard } from '../lib/payments.js'

// Saved cards for the current user. INERT unless FEATURES.payments — with the
// flag off it never queries payment_methods and returns an empty list, so the
// saved-card UI simply doesn't appear.
export function useSavedCards() {
  const [cards, setCards]     = useState([])
  const [loading, setLoading] = useState(FEATURES.payments)

  const refresh = useCallback(async () => {
    if (!FEATURES.payments) { setCards([]); setLoading(false); return }
    setLoading(true)
    const { data } = await listSavedCards()
    setCards(data)
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const remove = useCallback(async (id) => {
    const { error } = await deleteSavedCard(id)
    if (!error) await refresh()
    return { error }
  }, [refresh])

  const makeDefault = useCallback(async (id) => {
    const { error } = await setDefaultCard(id)
    if (!error) await refresh()
    return { error }
  }, [refresh])

  return { cards, loading, refresh, remove, makeDefault }
}
