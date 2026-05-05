import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, XCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import { supabase } from '../../lib/supabase.js'
import { useRealtimeOrder } from '../../hooks/useRealtimeOrder.js'
import { useToast } from '../../components/ui/Toast.jsx'
import { OrderTrackingSkeleton } from '../../components/Skeleton.jsx'
import StatusTimeline from '../../components/StatusTimeline.jsx'
import PageShell from '../../components/ui/PageShell.jsx'
import GlassCard from '../../components/ui/GlassCard.jsx'
import MotionButton from '../../components/ui/MotionButton.jsx'

const CAR_LABELS     = { sedan: 'Sedan', suv: 'SUV', pickup: 'Pickup', van: 'Van' }
const SERVICE_LABELS = { exterior: 'Exterior', interior: 'Interior', full: 'Full Wash' }
const CANCELLABLE    = new Set(['pending', 'accepted'])

const pageVariants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.08 } },
}
const itemVariants = {
  hidden:  { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
}

export default function OrderTracking() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { order, loading, error } = useRealtimeOrder(id)
  const showToast = useToast()
  const [cancelling, setCancelling] = useState(false)

  async function handleCancel() {
    setCancelling(true)
    const { error: rpcError } = await supabase.rpc('transition_order_status', { order_id: id, new_status: 'cancelled' })
    setCancelling(false)
    if (rpcError) { showToast(rpcError.message, 'error'); return }
    showToast('Order cancelled', 'success')
    navigate('/history')
  }

  if (loading) return (
    <PageShell>
      <div className="bg-mesh min-h-full">
        <OrderTrackingSkeleton />
      </div>
    </PageShell>
  )

  if (error || !order) return (
    <PageShell>
      <div className="bg-mesh min-h-full flex items-center justify-center p-6">
        <p className="text-danger-500 text-sm">{error ?? 'Order not found'}</p>
      </div>
    </PageShell>
  )

  return (
    <PageShell>
      <div className="bg-mesh min-h-full px-5 pt-6 pb-6">
        <motion.div
          className="flex flex-col gap-5"
          variants={pageVariants}
          initial="hidden"
          animate="visible"
        >
          <motion.button
            variants={itemVariants}
            onClick={() => navigate('/history')}
            className="flex items-center gap-2 text-neutral-500 text-sm -ml-1 w-fit"
            whileTap={{ scale: 0.97 }}
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </motion.button>

          <motion.div variants={itemVariants}>
            <h1 className="text-xl font-bold">Order status</h1>
            <p className="text-xs text-neutral-400 mt-1">#{order.id.slice(0, 8)}</p>
          </motion.div>

          {/* Order summary card */}
          <motion.div variants={itemVariants}>
            <GlassCard className="flex justify-between text-sm p-4">
              <div>
                <p className="font-semibold">{CAR_LABELS[order.car_type]}</p>
                <p className="text-neutral-500">{SERVICE_LABELS[order.service_type]}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-primary-600">₪{order.total_price}</p>
                <p className="text-xs text-neutral-400">total</p>
              </div>
            </GlassCard>
          </motion.div>

          {/* Status timeline */}
          <motion.div variants={itemVariants}>
            <GlassCard className="p-4">
              <StatusTimeline status={order.status} />
            </GlassCard>
          </motion.div>

          {order.status === 'completed' && (
            <motion.div variants={itemVariants}>
              <GlassCard className="p-4 text-center border-success-500/30 bg-success-50/60">
                <p className="font-semibold text-success-600">Your car is sparkling clean!</p>
              </GlassCard>
            </motion.div>
          )}

          {order.status === 'cancelled' && (
            <motion.div variants={itemVariants}>
              <GlassCard className="p-4 text-center border-danger-500/30 bg-danger-50/60">
                <p className="font-semibold text-danger-600">Order cancelled</p>
                {order.cancellation_reason && (
                  <p className="text-sm text-neutral-500 mt-1">{order.cancellation_reason}</p>
                )}
              </GlassCard>
            </motion.div>
          )}

          {CANCELLABLE.has(order.status) && (
            <motion.div variants={itemVariants}>
              <MotionButton
                onClick={handleCancel}
                disabled={cancelling}
                className="btn-ghost text-danger-500 hover:bg-danger-50 w-full"
              >
                <XCircle className="h-4 w-4" />
                {cancelling ? 'Cancelling…' : 'Cancel order'}
              </MotionButton>
            </motion.div>
          )}
        </motion.div>
      </div>
    </PageShell>
  )
}
