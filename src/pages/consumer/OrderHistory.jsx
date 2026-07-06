import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Car, Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../components/ui/Toast.jsx'
import { HistoryRowSkeleton } from '../../components/Skeleton.jsx'
import PageShell from '../../components/ui/PageShell.jsx'
import GlassCard from '../../components/ui/GlassCard.jsx'
import Editable from '../../components/editable/Editable.jsx'

// pending_approval is intentionally excluded from "live": the wash is done from
// the consumer's perspective, so the row uses the same muted chrome as completed.
const LIVE_STATUSES = new Set(['pending', 'accepted', 'en_route', 'arrived', 'in_progress'])
// "Done" from the consumer's perspective — wash finished, awaiting/closed.
const DONE_STATUSES = new Set(['pending_approval', 'completed'])

const FILTERS = ['all', 'active', 'completed']
function matchesFilter(status, filter) {
  if (filter === 'active')    return LIVE_STATUSES.has(status)
  if (filter === 'completed') return DONE_STATUSES.has(status)
  return true
}

// Tinted status pill — green for live, warning for in-review, danger for
// cancelled, muted for completed. Colour is never the only signal: the label
// always shows too (a11y: color-not-only).
function statusChipClass(status) {
  if (LIVE_STATUSES.has(status))     return 'bg-primary-100 text-primary-800'
  if (status === 'pending_approval') return 'bg-warning-50 text-warning-700'
  if (status === 'cancelled')        return 'bg-danger-50 text-danger-600'
  return 'bg-black/[0.05] text-ink-muted'
}

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
  const showToast = useToast()
  const [orders, setOrders]   = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState('all')

  useEffect(() => {
    supabase
      .from('orders')
      .select('*')
      .eq('consumer_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) showToast(t('common.error'), 'error')
        // Abandoned unpaid checkout drafts (ADR-042: the row is inserted
        // before payment) are invisible everywhere else (Home, washer pool,
        // discount check) — showing them here as a live "pending" wash would
        // display a phantom order that no washer can ever pick up.
        setOrders((data ?? []).filter(o => !(o.status === 'pending' && !o.paid_at)))
        setLoading(false)
      })
  }, [user.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Derive year stats from already-loaded data — no extra query. Cancelled
  // orders excluded; everything else counts (ADR-014). The summary tracks the
  // full year and is intentionally independent of the active filter.
  const thisYear   = new Date().getFullYear()
  const yearCount  = useMemo(() =>
    orders.filter(o =>
      new Date(o.created_at).getFullYear() === thisYear &&
      o.status !== 'cancelled'
    ).length,
    [orders, thisYear]
  )

  const visibleOrders = useMemo(
    () => (filter === 'all' ? orders : orders.filter(o => matchesFilter(o.status, filter))),
    [orders, filter]
  )
  const groups    = useMemo(() => groupOrders(visibleOrders), [visibleOrders])
  const todayStr  = t('consumer.history.today')

  return (
    <PageShell>
      <div className="bg-mesh min-h-full flex flex-col">

        {/* ── Header ── */}
        <div className="px-5 pt-4 pb-1 shrink-0">
          <h1 className="text-[28px] font-extrabold text-ink tracking-[-0.7px] leading-tight">
            {t('consumer.history.title')}
          </h1>
          <p className="text-sm text-ink-muted leading-tight mt-0.5">
            {t('consumer.history.subtitle')}
          </p>
        </div>

        <div className="flex-1 px-4 pb-4 pt-3 flex flex-col gap-3">

          {/* ── Loading skeletons ── */}
          {loading && (
            <div className="flex flex-col gap-3 pt-2">
              <HistoryRowSkeleton />
              <HistoryRowSkeleton />
              <HistoryRowSkeleton />
            </div>
          )}

          {/* ── Empty state (no orders at all) ── */}
          {!loading && orders.length === 0 && (
            <div className="flex flex-col items-center gap-2 pt-12 text-center">
              <div className="w-16 h-16 rounded-2xl bg-glass border border-glass-border flex items-center justify-center mb-1">
                <Car className="h-8 w-8 text-ink-muted" />
              </div>
              <p className="font-semibold text-ink">{t('consumer.history.empty')}</p>
              <p className="text-sm text-ink-muted max-w-xs">{t('consumer.history.emptyDesc')}</p>
              <Link to="/book" className="btn-primary mt-3">{t('consumer.history.bookNow')}</Link>
            </div>
          )}

          {/* ── Summary + filter + grouped list ── */}
          {!loading && orders.length > 0 && (
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="flex flex-col gap-3"
            >
              {/* Summary hero — ADR-014: stats derived from loaded data, no extra query */}
              <motion.div variants={itemVariants}>
                <div
                  className="relative overflow-hidden rounded-glass p-4 shadow-glass"
                  style={{ background: 'linear-gradient(135deg, #1C8747, #26B55F)' }}
                >
                  <div className="absolute -top-9 -end-9 w-32 h-32 rounded-full bg-white/10" aria-hidden="true" />
                  <div className="relative flex items-start justify-between">
                    <div className="text-white">
                      <p className="text-[11px] font-semibold opacity-85 uppercase tracking-[0.4px]">
                        {t('consumer.history.summaryLabel')}
                      </p>
                      <div className="flex items-baseline gap-2 mt-1">
                        <span className="text-[34px] font-extrabold tracking-[-0.8px] leading-none tabular-nums">{yearCount}</span>
                        <span className="text-[13px] opacity-90 font-medium">{t('consumer.history.summaryWashes')}</span>
                      </div>
                    </div>
                    <div className="w-[52px] h-[52px] rounded-2xl bg-white/95 shadow-sm flex items-center justify-center shrink-0">
                      <Sparkles className="h-[26px] w-[26px] text-primary-700" strokeWidth={1.5} />
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Segmented filter — works on the already-loaded list (no query) */}
              <motion.div variants={itemVariants}>
                <div
                  role="tablist"
                  aria-label={t('consumer.history.filter')}
                  className="flex p-1 gap-1 rounded-2xl bg-glass border border-glass-border"
                >
                  {FILTERS.map(f => {
                    const active = filter === f
                    return (
                      <button
                        key={f}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setFilter(f)}
                        className={`flex-1 h-10 rounded-xl text-[13px] font-bold transition-colors
                          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                          active ? 'bg-primary-700 text-white shadow-sm' : 'text-ink-muted active:bg-black/[0.04]'
                        }`}
                      >
                        {t(`consumer.history.filters.${f}`)}
                      </button>
                    )
                  })}
                </div>
              </motion.div>

              {/* Grouped rows — or an in-filter empty hint */}
              {groups.length === 0 ? (
                <motion.div variants={itemVariants} className="flex flex-col items-center gap-3 pt-10 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-glass border border-glass-border flex items-center justify-center">
                    <Car className="h-7 w-7 text-ink-muted" />
                  </div>
                  <p className="text-sm text-ink-muted">{t('consumer.history.noneInFilter')}</p>
                  <button
                    type="button"
                    onClick={() => setFilter('all')}
                    className="text-[13px] font-bold text-primary-700 px-4 min-h-[44px] active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-xl"
                  >
                    {t('consumer.history.showAll')}
                  </button>
                </motion.div>
              ) : (
                groups.map(group => (
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
                          <Editable key={order.id} id="consumer.history.row">
                          <motion.div
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
                                    <span className="absolute -top-0.5 -end-0.5 w-3 h-3 rounded-full bg-primary-600 border-2 border-white" />
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

                                {/* Price + status chip */}
                                <div className="flex flex-col items-end gap-1 shrink-0">
                                  <p className="text-[14px] font-extrabold text-ink tabular-nums">₪{order.total_price}</p>
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${statusChipClass(order.status)}`}>
                                    {t(`status.labels.${order.status}`, order.status)}
                                  </span>
                                </div>
                              </div>
                            </Link>
                          </motion.div>
                          </Editable>
                        )
                      })}
                    </GlassCard>
                  </motion.div>
                ))
              )}
            </motion.div>
          )}
        </div>
      </div>
    </PageShell>
  )
}
