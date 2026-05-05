import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, History } from 'lucide-react'
import { motion } from 'framer-motion'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { HistoryRowSkeleton } from '../../components/Skeleton.jsx'
import PageShell from '../../components/ui/PageShell.jsx'
import GlassCard from '../../components/ui/GlassCard.jsx'

// Status band colors (left edge accent strip)
const STATUS_BAND = {
  pending:     'bg-warning-500',
  accepted:    'bg-primary-400',
  en_route:    'bg-primary-400',
  arrived:     'bg-primary-400',
  in_progress: 'bg-primary-500',
  completed:   'bg-success-500',
  cancelled:   'bg-danger-400',
}

// Badge text colors (inside tile)
const STATUS_BADGE = {
  pending:     'text-warning-600 bg-warning-50',
  accepted:    'text-primary-600 bg-primary-50',
  en_route:    'text-primary-600 bg-primary-50',
  arrived:     'text-primary-600 bg-primary-50',
  in_progress: 'text-primary-600 bg-primary-50',
  completed:   'text-success-600 bg-success-50',
  cancelled:   'text-danger-500 bg-danger-50',
}

const SERVICE_LABELS = { exterior: 'Exterior', interior: 'Interior', full: 'Full Wash' }
const CAR_LABELS     = { sedan: 'Sedan', suv: 'SUV', pickup: 'Pickup', van: 'Van' }

const containerVariants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.06 } },
}
const itemVariants = {
  hidden:  { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
}

export default function OrderHistory() {
  const { user } = useAuth()
  const [orders, setOrders]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('orders')
      .select('*')
      .eq('consumer_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setOrders(data ?? []); setLoading(false) })
  }, [user.id])

  return (
    <PageShell>
      <div className="bg-mesh min-h-full px-4 pt-6 pb-4 flex flex-col gap-4">
        <h1 className="text-xl font-bold text-neutral-900">My Orders</h1>

        {loading && (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map(i => <HistoryRowSkeleton key={i} />)}
          </div>
        )}

        {!loading && orders.length === 0 && (
          <div className="flex flex-col items-center gap-2 pt-12 text-center">
            <div className="rounded-2xl bg-white/60 backdrop-blur-sm p-5 mb-1">
              <History className="h-10 w-10 text-neutral-400" />
            </div>
            <p className="font-semibold text-neutral-700">No washes yet</p>
            <p className="text-sm text-neutral-400 max-w-xs">
              Book your first on-demand car wash — it takes under a minute.
            </p>
            <Link to="/home" className="btn-primary mt-3">Book a wash</Link>
          </div>
        )}

        {!loading && orders.length > 0 && (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="flex flex-col gap-3"
          >
            {orders.map(order => (
              <motion.div key={order.id} variants={itemVariants} whileTap={{ scale: 0.98 }}>
                <Link to={`/order/${order.id}`}>
                  {/* GlassCard with relative positioning for the status band strip */}
                  <GlassCard className="relative overflow-hidden flex items-center gap-3 px-4 py-3">
                    {/* Leading status band — 3px strip on the left edge */}
                    <div className={`absolute inset-y-0 start-0 w-1 ${STATUS_BAND[order.status] ?? 'bg-neutral-300'}`} />

                    {/* Content — ps-2 shifts text past the band */}
                    <div className="ps-2 flex-1 min-w-0">
                      <p className="font-semibold text-sm text-neutral-900 truncate">
                        {CAR_LABELS[order.car_type]} · {SERVICE_LABELS[order.service_type]}
                      </p>
                      <p className="text-xs text-neutral-400 mt-0.5">
                        {new Date(order.created_at).toLocaleDateString()}
                      </p>
                      <span className={`mt-1.5 inline-block text-xs font-medium rounded px-2 py-0.5 ${STATUS_BADGE[order.status] ?? ''}`}>
                        {order.status.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                      <p className="font-bold text-primary-600">₪{order.total_price}</p>
                      <ChevronRight className="h-4 w-4 text-neutral-300" />
                    </div>
                  </GlassCard>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </PageShell>
  )
}
