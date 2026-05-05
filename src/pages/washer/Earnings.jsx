import { useEffect, useState } from 'react'
import { DollarSign, TrendingUp, Zap, Star, BarChart2, Clock } from 'lucide-react'
import { motion } from 'framer-motion'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import PageShell from '../../components/ui/PageShell.jsx'

const SERVICE_LABELS = { exterior: 'Exterior', interior: 'Interior', full: 'Full Wash' }
const CAR_LABELS     = { sedan: 'Sedan', suv: 'SUV', pickup: 'Pickup', van: 'Van' }

const container = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.05 } },
}

const tileVariant = {
  hidden: { opacity: 0, y: 14 },
  show:   { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 28 } },
}

function BentoTile({ children, className = '' }) {
  return (
    <motion.div
      variants={tileVariant}
      className={`bg-glass border border-glass-border backdrop-blur-xl rounded-2xl p-4 flex flex-col gap-1 ${className}`}
    >
      {children}
    </motion.div>
  )
}

export default function Earnings() {
  const { user } = useAuth()
  const [orders, setOrders]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('orders')
      .select('*')
      .eq('washer_id', user.id)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .then(({ data }) => { setOrders(data ?? []); setLoading(false) })
  }, [user.id])

  // ── Derived metrics (computed client-side from existing query) ────────────
  const totalEarnings = orders.reduce((sum, o) => sum + Number(o.base_price), 0)

  const now = new Date()
  const thisMonth = orders
    .filter(o => new Date(o.completed_at).getMonth() === now.getMonth() &&
                 new Date(o.completed_at).getFullYear() === now.getFullYear())
    .reduce((sum, o) => sum + Number(o.base_price), 0)

  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const todayCount = orders.filter(o => new Date(o.completed_at) >= todayStart).length

  // ISO week: Monday = start of week
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  const thisWeekCount = orders.filter(o => new Date(o.completed_at) >= monday).length

  const avgPerJob = orders.length > 0 ? totalEarnings / orders.length : 0

  return (
    <PageShell>
      <div className="px-4 pt-6 pb-6 flex flex-col gap-5">
        <h1 className="text-xl font-bold text-ink">Earnings</h1>

        {loading ? (
          <div className="flex justify-center pt-10">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
          </div>
        ) : (
          <>
            {/* ── Bento grid ──────────────────────────────────────────── */}
            <motion.div
              variants={container}
              initial="hidden"
              animate="show"
              className="grid grid-cols-2 gap-3"
            >
              {/* Hero tile — full width */}
              <BentoTile className="col-span-2">
                <p className="text-xs text-ink-muted flex items-center gap-1">
                  <TrendingUp className="h-3.5 w-3.5" /> Total earned
                </p>
                <p className="text-3xl font-bold text-accent">
                  <span className="text-lg font-semibold">₪</span>{totalEarnings.toFixed(2)}
                </p>
                <p className="text-xs text-ink-muted mt-1">
                  {orders.length} job{orders.length !== 1 ? 's' : ''} completed
                </p>
              </BentoTile>

              {/* This month */}
              <BentoTile>
                <p className="text-xs text-ink-muted flex items-center gap-1">
                  <DollarSign className="h-3.5 w-3.5" /> This month
                </p>
                <p className="text-2xl font-bold text-ink">₪{thisMonth.toFixed(0)}</p>
              </BentoTile>

              {/* Today */}
              <BentoTile>
                <p className="text-xs text-ink-muted flex items-center gap-1">
                  <Zap className="h-3.5 w-3.5" /> Today
                </p>
                <p className="text-2xl font-bold text-ink">{todayCount}</p>
                <p className="text-xs text-ink-muted">job{todayCount !== 1 ? 's' : ''}</p>
              </BentoTile>

              {/* Average per job */}
              <BentoTile>
                <p className="text-xs text-ink-muted flex items-center gap-1">
                  <BarChart2 className="h-3.5 w-3.5" /> Avg / job
                </p>
                <p className="text-2xl font-bold text-ink">₪{avgPerJob.toFixed(0)}</p>
              </BentoTile>

              {/* This week */}
              <BentoTile>
                <p className="text-xs text-ink-muted flex items-center gap-1">
                  <Star className="h-3.5 w-3.5" /> This week
                </p>
                <p className="text-2xl font-bold text-ink">{thisWeekCount}</p>
                <p className="text-xs text-ink-muted">job{thisWeekCount !== 1 ? 's' : ''}</p>
              </BentoTile>
            </motion.div>

            {/* ── Recent transactions ────────────────────────────────── */}
            {orders.length === 0 ? (
              <div className="flex flex-col items-center gap-2 pt-8 text-center">
                <div className="rounded-2xl bg-surface-elevated border border-edge p-5 mb-1">
                  <DollarSign className="h-10 w-10 text-ink-muted" />
                </div>
                <p className="font-semibold text-ink">No completed jobs yet</p>
                <p className="text-sm text-ink-muted max-w-xs">
                  Complete your first wash to see your earnings here.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1">Recent</p>
                {orders.map(order => (
                  <div key={order.id} className="flex items-center justify-between py-3 border-b border-edge last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink truncate">
                        {CAR_LABELS[order.car_type]} · {SERVICE_LABELS[order.service_type]}
                      </p>
                      <p className="text-xs text-ink-muted flex items-center gap-1 mt-0.5">
                        <Clock className="h-3 w-3" />
                        {order.completed_at ? new Date(order.completed_at).toLocaleDateString() : '—'}
                      </p>
                    </div>
                    <p className="font-bold text-accent flex-shrink-0 ms-2">₪{order.base_price}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </PageShell>
  )
}
