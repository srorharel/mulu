import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useMotionValue, animate } from 'framer-motion'
import { Car, MapPin, Clock, GripHorizontal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useReverseGeocode } from '../lib/geocode.js'

const SPRING         = { type: 'spring', stiffness: 400, damping: 35 }
const SWIPE_VELOCITY = 500
const SWIPE_RATIO    = 0.4

export default function JobCard({ job, onClick, highlight = false }) {
  const navigate     = useNavigate()
  const containerRef = useRef(null)
  const x            = useMotionValue(0)
  const { address }  = useReverseGeocode(job.lat, job.lng)
  const { t, i18n }  = useTranslation()

  const distKm   = job.distance_km != null ? job.distance_km.toFixed(1) : '—'
  const ariaLabel = t('washer.jobCard.ariaLabel', {
    car:      t(`carLabels.${job.car_type}`),
    service:  t(`serviceLabels.${job.service_type}`),
    distance: distKm,
    price:    job.base_price,
  })

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (onClick) onClick()
      else navigate(`/washer/job/${job.id}`)
    }
  }

  function handleDragEnd(_, info) {
    const width       = containerRef.current?.offsetWidth ?? 300
    const thresholdMet =
      Math.abs(info.offset.x)   > width * SWIPE_RATIO ||
      Math.abs(info.velocity.x) > SWIPE_VELOCITY

    if (thresholdMet) {
      if (onClick) onClick()
      else navigate(`/washer/job/${job.id}`)
    } else {
      animate(x, 0, SPRING)
    }
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
              '0 0 0 0px rgba(14,165,164,0)',
              '0 0 0 3px rgba(14,165,164,0.65)',
              '0 0 0 3px rgba(14,165,164,0)',
            ]
          : '0 0 0 0px rgba(14,165,164,0)',
      }}
      transition={{ duration: 0.7 }}
      className="bg-glass border border-glass-border backdrop-blur-xl rounded-2xl p-4 flex flex-col gap-3 cursor-grab active:cursor-grabbing select-none"
    >
      {/* Row 1: car badge + service pill + drag hint */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-muted shrink-0">
            <Car className="h-4 w-4 text-accent" />
          </span>
          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-surface-elevated border border-edge text-ink-muted">
            {t(`serviceLabels.${job.service_type}`)}
          </span>
        </div>
        <GripHorizontal className="h-4 w-4 text-ink-muted/40 shrink-0" />
      </div>

      {/* Row 2: price hero + car type */}
      <div>
        <p className="text-2xl font-bold text-accent leading-none">
          ₪{job.base_price}
        </p>
        <p className="text-xs text-ink-muted mt-0.5">{t(`carLabels.${job.car_type}`)}</p>
      </div>

      {/* Row 3: geocoded address */}
      {address && (
        <div className="flex items-start gap-1.5 text-xs text-ink-muted">
          <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span className="leading-snug line-clamp-1">{address}</span>
        </div>
      )}

      {/* Row 4: distance + time */}
      <div className="flex items-center gap-4 text-xs text-ink-muted">
        <span className="flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" />
          {distKm} {t('common.km')}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="h-3.5 w-3.5" />
          {new Date(job.created_at).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </motion.div>
  )
}
