import { useRef, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useMotionValue, animate } from 'framer-motion'
import { MoonStar, Sparkles, ChevronRight, Loader2, ExternalLink, Car, MapPin, DollarSign } from 'lucide-react'
import { JobCardSkeleton } from '../Skeleton.jsx'
import JobCard from '../JobCard.jsx'
import { useRealtimeOrder } from '../../hooks/useRealtimeOrder.js'
import { useReverseGeocode } from '../../lib/geocode.js'
import { supabase } from '../../lib/supabase.js'
import { useToast } from '../ui/Toast.jsx'

const SPRING      = { type: 'spring', stiffness: 300, damping: 32 }
const TOGGLE_SPRING = { type: 'spring', stiffness: 500, damping: 40 }
const BOTTOM_NAV_H = 56

const CAR_LABELS     = { sedan: 'Sedan', suv: 'SUV', pickup: 'Pickup', van: 'Van' }
const SERVICE_LABELS = { exterior: 'Exterior', interior: 'Interior', full: 'Full Wash' }

const TRANSITIONS = {
  accepted:    { next: 'en_route',    label: 'Start drive' },
  en_route:    { next: 'arrived',     label: 'Mark arrived' },
  arrived:     { next: 'in_progress', label: 'Start work' },
  in_progress: { next: 'completed',   label: 'Complete' },
}

function getSnaps() {
  const vh = window.innerHeight
  const EXPANDED_H  = vh * 0.80
  const DEFAULT_H   = vh * 0.40
  const COLLAPSED_H = 120
  return {
    expandedH:  EXPANDED_H,
    expanded:   0,
    default:    EXPANDED_H - DEFAULT_H,
    collapsed:  EXPANDED_H - COLLAPSED_H,
  }
}

// ── Inline slide toggle ───────────────────────────────────────────────────────

function SlideToggle({ online, onToggle, toggling }) {
  return (
    <button
      onClick={onToggle}
      disabled={toggling}
      aria-label="Toggle online status"
      className="flex items-center gap-2 shrink-0"
    >
      <span className={`text-xs font-medium ${online ? 'text-accent' : 'text-ink-muted'}`}>
        {toggling ? '…' : online ? 'Online' : 'Offline'}
      </span>
      {/* Track */}
      <motion.div
        className="relative w-11 h-6 rounded-full border"
        animate={{
          backgroundColor: online ? 'rgba(20,184,166,0.20)' : 'rgba(255,255,255,0.06)',
          borderColor:      online ? 'rgba(20,184,166,0.45)' : 'rgba(255,255,255,0.12)',
        }}
        transition={TOGGLE_SPRING}
      >
        {/* Thumb */}
        <motion.div
          className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full shadow-md"
          animate={{
            x:               online ? 20 : 0,
            backgroundColor: online ? 'rgb(20,184,166)' : 'rgb(115,115,115)',
          }}
          transition={TOGGLE_SPRING}
        />
      </motion.div>
    </button>
  )
}

// ── Active-job inline panel ───────────────────────────────────────────────────

function ActiveJobPanel({ activeJob }) {
  const navigate  = useNavigate()
  const showToast = useToast()
  const { order } = useRealtimeOrder(activeJob?.id)
  const { address } = useReverseGeocode(activeJob?.lat, activeJob?.lng)
  const [advancing, setAdvancing] = useState(false)
  const advancingRef = useRef(false)

  async function advance() {
    if (advancingRef.current || !order) return
    const nextStatus = TRANSITIONS[order.status]?.next
    if (!nextStatus) return
    advancingRef.current = true
    setAdvancing(true)
    const { error } = await supabase.rpc('transition_order_status', {
      order_id: activeJob.id,
      new_status: nextStatus,
    })
    advancingRef.current = false
    setAdvancing(false)
    if (error) {
      if (!error.message?.match(/Invalid transition: (\S+) → \1/)) {
        showToast(error.message, 'error')
      }
    }
  }

  const transition = order ? TRANSITIONS[order.status] : null

  return (
    <div className="flex flex-col gap-3 px-4 pb-4">
      {order ? (
        <>
          {/* Key details */}
          <div className="bg-glass border border-glass-border backdrop-blur-xl rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-muted shrink-0">
                <Car className="h-4 w-4 text-accent" />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">
                  {CAR_LABELS[order.car_type]} — {SERVICE_LABELS[order.service_type]}
                </p>
                <p className="text-xs text-ink-muted">₪{order.base_price} payout</p>
              </div>
            </div>

            <div className="flex items-start gap-2 text-xs text-ink-muted">
              <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span className="leading-snug">{address}</span>
            </div>

            <div className="flex items-center gap-2 text-xs text-ink-muted">
              <DollarSign className="h-3.5 w-3.5 shrink-0" />
              <span>Customer pays ₪{order.total_price}</span>
            </div>
          </div>

          {/* Transition button */}
          {transition && (
            <button
              onClick={advance}
              disabled={advancing}
              className="btn-primary w-full"
            >
              {advancing
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <ChevronRight className="h-4 w-4 rtl:rotate-180" />
              }
              {advancing ? 'Updating…' : transition.label}
            </button>
          )}

          {/* Deep-dive link */}
          <button
            onClick={() => navigate(`/washer/active/${activeJob.id}`)}
            className="btn-ghost text-sm w-full"
          >
            <ExternalLink className="h-4 w-4" />
            Manage job
          </button>
        </>
      ) : (
        <div className="flex justify-center py-6">
          <Loader2 className="h-6 w-6 animate-spin text-ink-muted" />
        </div>
      )}
    </div>
  )
}

// ── JobDrawer ─────────────────────────────────────────────────────────────────
// Props:
//   jobs          array of nearby pending job objects
//   loading       boolean
//   selectedJobId string | null — when set, drawer snaps to default and scrolls to card
//   online        boolean
//   onToggle      () => void — called when the slide toggle is tapped
//   toggling      boolean — disables the toggle while in-flight
//   activeJob     { id, lat, lng } | null — when set, body shows active-job panel

export default function JobDrawer({ jobs, loading, selectedJobId, online, onToggle, toggling, activeJob }) {
  const navigate = useNavigate()
  const snaps    = useRef(getSnaps())
  const y        = useMotionValue(snaps.current.default)
  const listRef  = useRef(null)
  const cardRefs = useRef({})

  // Snap to default when a job pin is tapped
  useEffect(() => {
    if (!selectedJobId) return
    animate(y, snaps.current.default, SPRING)
    const timer = setTimeout(() => {
      const el = cardRefs.current[selectedJobId]
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 150)
    return () => clearTimeout(timer)
  }, [selectedJobId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-expand to default when an active job appears
  useEffect(() => {
    if (!activeJob) return
    animate(y, snaps.current.default, SPRING)
  }, [activeJob?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function onDragEnd(_, info) {
    const s   = snaps.current
    const cur = y.get()
    const vel = info.velocity.y

    const points = [s.expanded, s.default, s.collapsed]
    let target = points.reduce((a, b) => Math.abs(b - cur) < Math.abs(a - cur) ? b : a)

    if (Math.abs(vel) > 400) {
      if (vel > 0) target = points.find(p => p > cur) ?? s.collapsed
      else         target = [...points].reverse().find(p => p < cur) ?? s.expanded
    }

    animate(y, target, SPRING)
  }

  const { expandedH, collapsed } = snaps.current

  const isActive = !!activeJob
  const drawerTitle = isActive ? 'Active job' : 'Jobs nearby'

  return (
    <motion.div
      drag="y"
      dragConstraints={{ top: 0, bottom: collapsed }}
      dragElastic={{ top: 0.05, bottom: 0.12 }}
      style={{ y, height: expandedH, bottom: BOTTOM_NAV_H }}
      onDragEnd={onDragEnd}
      className="fixed inset-x-0 z-30 flex flex-col bg-glass border-t border-glass-border backdrop-blur-xl rounded-t-3xl"
    >
      {/* ── Drag handle ─────────────────────────────────────────────── */}
      <div className="flex justify-center pt-3 pb-2 shrink-0 cursor-grab active:cursor-grabbing touch-none">
        <div className="w-9 h-1 bg-neutral-400/40 rounded-full" />
      </div>

      {/* ── Header row: title + toggle ──────────────────────────────── */}
      <div className="px-4 pb-3 shrink-0 flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5 min-w-0">
          <p className="text-base font-bold text-ink leading-tight">{drawerTitle}</p>
          {/* Subtitle / count line */}
          {!isActive && online && !loading && jobs.length > 0 && (
            <p className="text-xs text-ink-muted">{jobs.length} job{jobs.length !== 1 ? 's' : ''} nearby</p>
          )}
          {!isActive && loading && (
            <p className="text-xs text-ink-muted">Looking for jobs…</p>
          )}
        </div>
        <SlideToggle online={online} onToggle={onToggle} toggling={toggling} />
      </div>

      {/* ── Body ────────────────────────────────────────────────────── */}
      {isActive ? (
        // Active job: inline panel, scrollable
        <div
          className="flex-1 overflow-y-auto"
          onPointerDown={e => e.stopPropagation()}
        >
          <ActiveJobPanel activeJob={activeJob} />
        </div>
      ) : (
        // Job list / empty states
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-3"
          onPointerDown={e => e.stopPropagation()}
        >
          {loading && (
            <>
              <JobCardSkeleton />
              <JobCardSkeleton />
              <JobCardSkeleton />
            </>
          )}

          {/* Offline empty state */}
          {!loading && !online && (
            <div className="flex flex-col items-center gap-3 pt-10 text-center">
              <MoonStar className="h-9 w-9 text-ink-muted/50" />
              <p className="text-sm font-semibold text-ink">Go online to see nearby jobs</p>
              <p className="text-xs text-ink-muted/70">Flip the switch above when you're ready to work.</p>
            </div>
          )}

          {/* Online, no jobs */}
          {!loading && online && jobs.length === 0 && (
            <div className="flex flex-col items-center gap-3 pt-10 text-center">
              <Sparkles className="h-9 w-9 text-ink-muted/50" />
              <p className="text-sm font-semibold text-ink">No jobs around you currently</p>
              <p className="text-xs text-ink-muted/70">We'll notify you when one comes in.</p>
            </div>
          )}

          {/* Job list */}
          {jobs.map(job => (
            <div
              key={job.id}
              ref={el => { cardRefs.current[job.id] = el }}
            >
              <JobCard
                job={job}
                onClick={() => navigate(`/washer/job/${job.id}`)}
                highlight={selectedJobId === job.id}
              />
            </div>
          ))}
        </div>
      )}
    </motion.div>
  )
}
