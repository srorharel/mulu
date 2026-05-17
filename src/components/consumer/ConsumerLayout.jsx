import { useState, useEffect, useCallback } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import RatingModal from './RatingModal.jsx'

// Session-dismiss key: user tapped X for this order in this browser session.
// Does NOT call skip_rating — modal re-appears on next app open.
const sessionDismissKey = (orderId) => `rating_modal_dismissed_${orderId}`

function isWithinWindow(order) {
  // At pending_approval, completed_at may not be set yet — treat as within window.
  if (order.status === 'pending_approval' && !order.completed_at) return true
  const ref = order.completed_at ? new Date(order.completed_at) : null
  if (!ref) return true
  return Date.now() - ref.getTime() < 48 * 60 * 60 * 1000
}

function needsRating(order) {
  return (
    ['pending_approval', 'completed'].includes(order.status) &&
    !order.rated_at &&
    !order.rating_skipped &&
    isWithinWindow(order)
  )
}

export default function ConsumerLayout() {
  const { user } = useAuth()
  const location = useLocation()

  const [pendingOrder, setPendingOrder] = useState(null) // order to show modal for
  const [modalOpen,    setModalOpen]    = useState(false)

  // ── Find the latest order that needs rating ──────────────────────────────
  const checkForPendingRating = useCallback(async () => {
    if (!user?.id) return
    const { data } = await supabase
      .from('orders')
      .select(`
        id, status, rated_at, rating_skipped, completed_at, washer_id,
        completion_photo_front, completion_photo_back,
        completion_photo_driver, completion_photo_passenger
      `)
      .eq('consumer_id', user.id)
      .in('status', ['pending_approval', 'completed'])
      .is('rated_at', null)
      .eq('rating_skipped', false)
      .order('created_at', { ascending: false })
      .limit(5)

    if (!data) return

    for (const order of data) {
      if (!isWithinWindow(order)) continue
      // Skip if user already dismissed this order in this session
      if (sessionStorage.getItem(sessionDismissKey(order.id))) continue
      setPendingOrder(order)
      setModalOpen(true)
      return
    }
    // Nothing pending
    setPendingOrder(null)
    setModalOpen(false)
  }, [user?.id])

  // Run check on mount and on every navigation
  useEffect(() => {
    checkForPendingRating()
  }, [location.pathname, checkForPendingRating])

  // ── Realtime: watch for this consumer's orders transitioning to pending_approval
  useEffect(() => {
    if (!user?.id) return
    const channel = supabase
      .channel(`consumer-orders:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `consumer_id=eq.${user.id}`,
        },
        (payload) => {
          const updated = payload.new
          if (
            updated.status === 'pending_approval' &&
            !updated.rated_at &&
            !updated.rating_skipped &&
            !sessionStorage.getItem(sessionDismissKey(updated.id))
          ) {
            setPendingOrder(updated)
            setModalOpen(true)
          }
        }
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [user?.id])

  // X button: session-only dismiss, modal re-appears on next app open
  function handleDismiss() {
    if (pendingOrder) {
      sessionStorage.setItem(sessionDismissKey(pendingOrder.id), '1')
    }
    setModalOpen(false)
  }

  // Submit or Skip: permanent — don't re-check for this order this session
  function handleComplete() {
    if (pendingOrder) {
      sessionStorage.setItem(sessionDismissKey(pendingOrder.id), '1')
    }
    setModalOpen(false)
    setPendingOrder(null)
  }

  return (
    <>
      <Outlet />
      <AnimatePresence>
        {modalOpen && pendingOrder && (
          <RatingModal
            key={pendingOrder.id}
            order={pendingOrder}
            onDismiss={handleDismiss}
            onComplete={handleComplete}
          />
        )}
      </AnimatePresence>
    </>
  )
}
