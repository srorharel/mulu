import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useMotionValue, animate } from 'framer-motion'
import { Car, MapPin, Navigation, Clock, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useReverseGeocode, looksLikeCoords } from '../lib/geocode.js'
import { useAuth } from '../context/AuthContext.jsx'
import { payoutForTier } from '../lib/payout.js'

const SPRING         = { type: 'spring', stiffness: 400, damping: 35 }
const SWIPE_VELOCITY = 500
const SWIPE_RATIO    = 0.4

// Relative "posted X ago" — reuses the shared washer.jobDetail.postedAgo strings.
function postedAgo(iso, t) {
  if (!iso) return null
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1)  return t('washer.jobDetail.postedAgo.justNow')
  if (min < 60) return t('washer.jobDetail.postedAgo.minutes', { n: min })
  const hr = Math.floor(min / 60)
  if (hr < 24)  return t('washer.jobDetail.postedAgo.hours', { n: hr })
  return t('washer.jobDetail.postedAgo.days', { n: Math.floor(hr / 24) })
}

export default function JobCard({ job, onClick, highlight = false }) {
  const navigate     = useNavigate()
  const containerRef = useRef(null)
  const x            = useMotionValue(0)
  const { t }        = useTranslation()
  const { profile }  = useAuth()

  // Prefer the address the customer actually confirmed at booking
  // (order.address_label, e.g. "אבן גבירול, תל אביב"). Reverse-geocoding the pin
  // coordinates is unreliable near city boundaries (a Tel Aviv pin can resolve to
  // Holon) and silently shows the washer the wrong city. Fall back to
  // reverse-geocode only for legacy orders with no label or a coords-only label.
  const hasLabel    = !!job.address_label && !looksLikeCoords(job.address_label)
  const { address: geocoded } = useReverseGeocode(
    hasLabel ? null : job.lat,
    hasLabel ? null : job.lng,
  )
  const address = hasLabel ? job.address_label : geocoded

  const distKm    = job.distance_km != null ? job.distance_km.toFixed(1) : '—'
  const posted    = postedAgo(job.created_at, t)
  // What the washer earns is their rating-based tier amount (payout_for_tier),
  // NOT the order's base_price (the consumer-side worker rate). Every job pays
  // this washer the same tier rate; the server locks it into orders.payout_amount
  // at acceptance. Mirrors JobDetail so the list and the detail screen agree.
  const payout    = payoutForTier(profile?.current_tier)
  const ariaLabel = t('washer.jobCard.ariaLabel', {
    car:      t(`carLabels.${job.car_type}`),
    service:  t(`serviceLabels.${job.service_type || 'wash'}`),
    distance: distKm,
    price:    payout,
  })

  function open() {
    if (onClick) onClick()
    else navigate(`/washer/job/${job.id}`)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      open()
    }
  }

  function handleDragEnd(_, info) {
    const width        = containerRef.current?.offsetWidth ?? 300
    const thresholdMet =
      Math.abs(info.offset.x)   > width * SWIPE_RATIO ||
      Math.abs(info.velocity.x) > SWIPE_VELOCITY
    if (thresholdMet) open()
    else animate(x, 0, SPRING)
  }

  return (
    <motion.div
      ref={containerRef}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.15}
      style={{ x }}
      onDragEnd={handleDragEnd}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={ariaLabel}
      animate={{
        boxShadow: highlight
          ? [
              '0 0 0 0px rgba(125,217,162,0)',
              '0 0 0 3px rgba(125,217,162,0.65)',
              '0 0 0 3px rgba(125,217,162,0)',
            ]
          : '0 0 0 0px rgba(125,217,162,0)',
      }}
      transition={{ duration: 0.7 }}
      className="bg-surface-elevated border border-edge rounded-2xl p-3.5 flex flex-col gap-3 cursor-grab active:cursor-grabbing select-none"
    >
      {/* Vehicle + payout hero */}
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 dark:bg-accent-muted shrink-0">
          <Car className="h-5 w-5 text-primary-700 dark:text-accent" strokeWidth={2} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-bold text-ink leading-tight truncate">{t(`carLabels.${job.car_type}`)}</p>
          <p className="text-[12px] text-ink-muted">{t(`serviceLabels.${job.service_type || 'wash'}`)}</p>
        </div>
        <p className="text-[23px] font-extrabold text-primary-700 dark:text-accent leading-none shrink-0" dir="ltr">
          ₪{payout}
        </p>
      </div>

      {/* Geocoded address */}
      {address && (
        <div className="flex items-center gap-1.5 text-[12px] text-ink-muted">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span className="leading-snug truncate">{address}</span>
        </div>
      )}

      {/* Distance pill + posted-ago + open affordance */}
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary-50 dark:bg-accent-muted text-[12px] font-semibold text-primary-700 dark:text-accent">
          <Navigation className="h-3.5 w-3.5" />
          {distKm} {t('common.km')}
        </span>
        {posted && (
          <span className="inline-flex items-center gap-1 text-[12px] text-ink-muted">
            <Clock className="h-3.5 w-3.5" />
            {posted}
          </span>
        )}
        <div className="flex-1" />
        <ChevronRight className="h-4 w-4 text-ink-subtle rtl:rotate-180 shrink-0" />
      </div>
    </motion.div>
  )
}
