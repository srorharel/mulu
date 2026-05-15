import { useEffect, useState } from 'react'
import { DollarSign, TrendingUp, Zap, Star, BarChart2, Clock, Hourglass } from 'lucide-react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import PageShell from '../../components/ui/PageShell.jsx'

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
  const { t, i18n } = useTranslation()
  const [allOrders, setAllOrders] = useState([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    supabase
      .from('orders')
      .select('*')
      .eq('washer_id', user.id)
      .in('status', ['completed', 'pending_approval'])
      .order('created_at', { ascending: false })
      .then(({ data }) => { setAllOrders(data ?? []); setLoading(false) })
  }, [user.id])

  const approvedOrders = allOrders.filter(o => o.status === 'completed')
  const pendingOrders  = allOrders.filter(o => o.status === 'pending_approval')

  const totalApproved = approvedOrders.reduce((sum, o) => sum + Number(o.base_price), 0)
  const totalPending  = pendingOrders.reduce((sum, o) => sum + Number(o.base_price), 0)

  const now = new Date()
  const thisMonth = approvedOrders
    .filter(o => new Date(o.completed_at).getMonth() === now.getMonth() &&
                 new Date(o.completed_at).getFullYear() === now.getFullYear())
    .reduce((sum, o) => sum + Number(o.base_price), 0)

  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0)
  const todayCount = approvedOrders.filter(o => new Date(o.completed_at) >= todayStart).length

  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  const thisWeekCount = approvedOrders.filter(o => new Date(o.completed_at) >= monday).length

  const avgPerJob = approvedOrders.length > 0 ? totalApproved / approvedOrders.length : 0

  return (
    <PageShell>
      <div className="px-4 pt-6 pb-6 flex flex-col gap-5">
        <h1 className="text-xl font-bold text-ink">{t('washer.earnings.title')}</h1>

        {loading ? (
          <div className="flex justify-center pt-10">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
          </div>
        ) : (
          <>
            <motion.div
              variants={container}
              initial="hidden"
              animate="show"
              className="grid grid-cols-2 gap-3"
            >
              {/* Approved earnings — hero tile, full width */}
              <BentoTile className="col-span-2">
                <p className="text-xs text-ink-muted flex items-center gap-1">
                  <TrendingUp className="h-3.5 w-3.5" /> {t('washer.earnings.approved.title')}
                </p>
                <p className="text-3xl font-bold text-accent">
                  <span className="text-lg font-semibold">₪</span>{totalApproved.toFixed(2)}
                </p>
                <p className="text-xs text-ink-muted mt-1">
                  {t('washer.earnings.jobsCompleted', { count: approvedOrders.length })}
                </p>
                <p className="text-xs text-ink-muted/60">
                  {t('washer.earnings.vatNote')}
                </p>
              </BentoTile>

              {/* Pending approval tile */}
              {(pendingOrders.length > 0 || true) && (
                <BentoTile className="col-span-2 border-warning-300/40 bg-warning-50/10">
                  <p className="text-xs text-ink-muted flex items-center gap-1">
                    <Hourglass className="h-3.5 w-3.5 text-warning-500" /> {t('washer.earnings.pending.title')}
                  </p>
                  <p className="text-2xl font-bold text-ink">
                    ₪{totalPending.toFixed(0)}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {t('washer.earnings.jobCount', { count: pendingOrders.length })}
                  </p>
                </BentoTile>
              )}

              {/* This month */}
              <BentoTile>
                <p className="text-xs text-ink-muted flex items-center gap-1">
                  <DollarSign className="h-3.5 w-3.5" /> {t('washer.earnings.thisMonth')}
                </p>
                <p className="text-2xl font-bold text-ink">₪{thisMonth.toFixed(0)}</p>
              </BentoTile>

              {/* Today */}
              <BentoTile>
                <p className="text-xs text-ink-muted flex items-center gap-1">
                  <Zap className="h-3.5 w-3.5" /> {t('washer.earnings.today')}
                </p>
                <p className="text-2xl font-bold text-ink">{todayCount}</p>
                <p className="text-xs text-ink-muted">{t('washer.earnings.jobCount', { count: todayCount })}</p>
              </BentoTile>

              {/* Average per job */}
              <BentoTile>
                <p className="text-xs text-ink-muted flex items-center gap-1">
                  <BarChart2 className="h-3.5 w-3.5" /> {t('washer.earnings.avgPerJob')}
                </p>
                <p className="text-2xl font-bold text-ink">₪{avgPerJob.toFixed(0)}</p>
              </BentoTile>

              {/* This week */}
              <BentoTile>
                <p className="text-xs text-ink-muted flex items-center gap-1">
                  <Star className="h-3.5 w-3.5" /> {t('washer.earnings.thisWeek')}
                </p>
                <p className="text-2xl font-bold text-ink">{thisWeekCount}</p>
                <p className="text-xs text-ink-muted">{t('washer.earnings.jobCount', { count: thisWeekCount })}</p>
              </BentoTile>
            </motion.div>

            {/* Recent transactions — all orders (approved + pending) */}
            {allOrders.length === 0 ? (
              <div className="flex flex-col items-center gap-2 pt-8 text-center">
                <div className="rounded-2xl bg-surface-elevated border border-edge p-5 mb-1">
                  <DollarSign className="h-10 w-10 text-ink-muted" />
                </div>
                <p className="font-semibold text-ink">{t('washer.earnings.noJobs')}</p>
                <p className="text-sm text-ink-muted max-w-xs">
                  {t('washer.earnings.noJobsDesc')}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1">{t('washer.earnings.recent')}</p>
                {allOrders.map(order => {
                  const isPending = order.status === 'pending_approval'
                  return (
                    <div key={order.id} className="flex items-center justify-between py-3 border-b border-edge last:border-0">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-ink truncate">
                            {t(`carLabels.${order.car_type}`)}
                          </p>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                            isPending
                              ? 'bg-warning-100 text-warning-700'
                              : 'bg-success-100 text-success-700'
                          }`}>
                            {isPending
                              ? t('washer.earnings.transaction.badge.pending')
                              : t('washer.earnings.transaction.badge.approved')
                            }
                          </span>
                        </div>
                        <p className="text-xs text-ink-muted flex items-center gap-1 mt-0.5">
                          <Clock className="h-3 w-3" />
                          {(isPending ? order.created_at : order.completed_at)
                            ? new Date(isPending ? order.created_at : order.completed_at).toLocaleDateString(i18n.language)
                            : '—'}
                        </p>
                      </div>
                      <p className={`font-bold flex-shrink-0 ms-2 ${isPending ? 'text-ink-muted' : 'text-accent'}`}>
                        ₪{order.base_price}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </PageShell>
  )
}
