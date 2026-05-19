import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Car, Filter, Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { HistoryRowSkeleton } from '../../components/Skeleton.jsx'
import PageShell from '../../components/ui/PageShell.jsx'
import GlassCard from '../../components/ui/GlassCard.jsx'

// pending_approval is intentionally excluded: wash is done from the consumer's
// perspective, so the row uses the same muted chrome as completed.
const LIVE_STATUSES = new Set(['pending', 'accepted', 'en_route', 'arrived', 'in_progress'])

function formatPlate(plate) {
  if (!plate) return null
  const d = plate.replace(/\D/g, '')
  if (d.length === 7) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`
  if (d.length >= 8) return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`
  return plate
}

function formatDate(createdAt, locale, todayStr) {
  const date = new Date(createdAt)
  if (date.toDateString() === new Date().toDateString()) return todayStr
  return date.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatTime(createdAt, locale) {
  return new Date(createdAt).toLocaleTimeString(locale, {
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function groupOrders(orders) {
  const now        = new Date()
  const dayOfWeek  = (now.getDay() + 6) % 7          // 0 = Mon
  const startWeek  = new Date(now)
  startWeek.setDate(now.getDate() - dayOfWeek)
  startWeek.setHours(0, 0, 0, 0)

  const startThisMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const endLastMonth   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)

  const buckets = { thisWeek: [], thisMonth: [], lastMonth: [], older: [] }
  for (const o of orders) {
    const d = new Date(o.created_at)
    if (d >= startWeek)       buckets.thisWeek.push(o)
    else if (d >= startThisMonth) buckets.thisMonth.push(o)
    else if (d >= startLastMonth) buckets.lastMonth.push(o)
    else                          buckets.older.push(o)
  }

  return [
    { key: 'thisWeek',  labelKey: 'consumer.history.groupThisWeek',  orders: buckets.thisWeek  },
    { key: 'thisMonth', labelKey: 'consumer.history.groupThisMonth', orders: buckets.thisMonth },
    { key: 'lastMonth', labelKey: 'consumer.history.groupLastMonth', orders: buckets.lastMonth },
    { key: 'older',     labelKey: 'consumer.history.groupOlder',     orders: buckets.older     },
  ].filter(g => g.orders.length > 0)
}

const containerVariants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.07 } },
}
const itemVariants = {
  hidden:  { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } },
}
const SPRING = { type: 'spring', stiffness: 300, damping: 30 }

export default function OrderHistory() {
  const { user } = useAuth()
  const { t, i18n } = useTranslation()
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

  // Derive year stats from already-loaded data — no extra query.
  // Cancelled orders excluded from both count and spend; everything else
  // (pending through completed) counts — the consumer ordered and paid.
  const thisYear   = new Date().getFullYear()
  const yearOrders = useMemo(() =>
    orders.filter(o =>
      new Date(o.created_at).getFullYear() === thisYear &&
      o.status !== 'cancelled'
    ),
    [orders, thisYear]
  )
  const yearCount  = yearOrders.length
  const yearSpent  = useMemo(() => yearOrders.reduce((s, o) => s + (o.total_price || 0), 0), [yearOrders])

  const groups    = useMemo(() => groupOrders(orders), [orders])
  const todayStr  = t('consumer.history.today')

  return (
    <PageShell>
      <div className="bg-mesh min-h-full flex flex-col">

        {/* ── Header ── */}
        <div className="px-5 pt-4 pb-2 flex items-center justify-between shrink-0">
          <h1 className="text-[28px] font-extrabold text-ink tracking-[-0.7px]">
            {t('consumer.history.title')}
          </h1>
          {/* Filter button — visual placeholder per audit Q5 */}
          <button
            aria-label={t('consumer.history.filter')}
            className="w-10 h-10 rounded-[14px] bg-white/60 backdrop-blur-xl border border-glass-border flex items-center justify-center text-ink shadow-sm"
          >
            <Filter className="h-[18px] w-[18px]" strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 px-4 pb-4 flex flex-col gap-3">

          {/* ── Loading skeletons ── */}
          {loading && (
            <div className="flex flex-col gap-3 pt-2">
              <HistoryRowSkeleton />
              <HistoryRowSkeleton />
              <HistoryRowSkeleton />
            </div>
          )}

          {/* ── Empty state ── */}
          {!loading && orders.length === 0 && (
            <div className="flex flex-col items-center gap-2 pt-12 text-center">
              <div className="rounded-glass bg-white/60 backdrop-blur-sm p-5 mb-1">
                <Car className="h-10 w-10 text-ink-muted" />
              </div>
              <p className="font-semibold text-ink">{t('consumer.history.empty')}</p>
              <p className="text-sm text-ink-muted max-w-xs">{t('consumer.history.emptyDesc')}</p>
              <Link to="/home" className="btn-primary mt-3">{t('consumer.history.bookNow')}</Link>
            </div>
          )}

          {/* ── Summary card + grouped list ── */}
          {!loading && orders.length > 0 && (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="flex flex-col gap-3"
            >
              {/* Summary card — ADR-014: stats derived from loaded data, no extra query */}
              <motion.div variants={itemVariants}>
                <div
                  className="rounded-glass p-4 flex items-start justify-between"
                  style={{ background: 'linear-gradient(135deg, #1C8747, #26B55F)' }}
                >
                  <div className="text-white">
                    <p className="text-[11px] font-semibold opacity-85 uppercase tracking-[0.4px]">
                      {t('consumer.history.summaryLabel')}
                    </p>
                    <div className="flex items-baseline gap-2 mt-0.5">
                      <span className="text-[30px] font-extrabold tracking-[-0.8px] leading-none">{yearCount}</span>
                      <span className="text-[13px] opacity-85">{t('consumer.history.summaryWashes')}</span>
                    </div>
                    <p className="text-[12px] opacity-90 mt-1">
                      {t('consumer.history.summarySpent', { amount: yearSpent.toFixed(0) })}
                    </p>
                  </div>
                  <div className="w-[52px] h-[52px] rounded-2xl bg-white/20 border border-white/30 flex items-center justify-center shrink-0">
                    <Sparkles className="h-[26px] w-[26px] text-white" strokeWidth={1.5} />
                  </div>
                </div>
              </motion.div>

              {/* Grouped rows */}
              {groups.map(group => (
                <motion.div key={group.key} variants={itemVariants} className="flex flex-col gap-2">
                  <p className="text-[11px] font-bold text-ink-muted uppercase tracking-[0.5px] px-1">
                    {t(group.labelKey)}
                  </p>
                  <GlassCard className="p-0 overflow-hidden">
                    {group.orders.map((order, idx) => {
                      const isLive   = LIVE_STATUSES.has(order.status)
                      const plate    = formatPlate(order.car_plate)
                      const carDesc  = [order.car_color, order.car_make, order.car_model]
                        .filter(Boolean).join(' · ')
                        || t(`carLabels.${order.car_type}`)
                      const dateStr  = formatDate(order.created_at, i18n.language, todayStr)
                      const timeStr  = formatTime(order.created_at, i18n.language)
                      const isLast   = idx === group.orders.length - 1

                      return (
                        <motion.div
                          key={order.id}
                          whileTap={{ scale: 0.99 }}
                          transition={SPRING}
                        >
                          <Link to={`/order/${order.id}`} className="block">
                            <div className={`flex items-center gap-3 px-3.5 py-[13px] ${!isLast ? 'border-b border-edge' : ''}`}>
                              {/* Car icon with live dot */}
                              <div className={`w-[42px] h-[42px] rounded-[13px] flex items-center justify-center relative shrink-0 ${
                                isLive ? 'bg-primary-100 text-primary-800' : 'bg-black/[0.04] text-ink-muted'
                              }`}>
                                <Car className="h-5 w-5" />
                                {isLive && (
                                  <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-primary-600 border-2 border-white" />
                                )}
                              </div>

                              {/* Date + plate + car */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-1.5">
                                  <span className="text-[14px] font-bold text-ink">{dateStr}</span>
                                  <span className="text-[12px] text-ink-muted" aria-hidden="true">·</span>
                                  <span className="text-[12px] text-ink-muted tabular-nums">{timeStr}</span>
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5 text-[12px] text-ink-muted min-w-0">
                                  {plate && (
                                    <span className="font-mono font-semibold text-ink shrink-0">{plate}</span>
                                  )}
                                  {plate && carDesc && <span className="shrink-0">·</span>}
                                  <span className="truncate">{carDesc}</span>
                                </div>
                              </div>

                              {/* Price + status */}
                              <div className="text-end shrink-0">
                                <p className="text-[14px] font-extrabold text-ink">₪{order.total_price}</p>
                                <p className={`text-[10px] font-semibold mt-0.5 ${isLive ? 'text-primary-700' : 'text-ink-muted'}`}>
                                  {t(`status.labels.${order.status}`, order.status)}
                                </p>
                              </div>
                            </div>
                          </Link>
                        </motion.div>
                      )
                    })}
                  </GlassCard>
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </div>
    </PageShell>
  )
}
