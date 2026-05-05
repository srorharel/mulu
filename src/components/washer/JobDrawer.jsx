import { useRef, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useMotionValue, animate } from 'framer-motion'
import { MapPin, Power } from 'lucide-react'
import { JobCardSkeleton } from '../Skeleton.jsx'
import JobCard from '../JobCard.jsx'

const SPRING = { type: 'spring', stiffness: 300, damping: 32 }
const BOTTOM_NAV_H = 56  // px — BottomNav sits below the drawer

// ── Snap geometry (computed once at module level, recalculated if viewport < 600px) ──
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

// ── JobDrawer ──────────────────────────────────────────────────────────────────
// Props:
//   jobs          array of nearby pending job objects
//   loading       boolean
//   selectedJobId string | null — when set, drawer snaps to default and scrolls to card
//   online        boolean — shown in empty state
export default function JobDrawer({ jobs, loading, selectedJobId, online }) {
  const navigate   = useNavigate()
  const snaps      = useRef(getSnaps())
  const y          = useMotionValue(snaps.current.default)
  const listRef    = useRef(null)
  const cardRefs   = useRef({})

  // Snap to 'default' and scroll when a job pin is tapped
  useEffect(() => {
    if (!selectedJobId) return
    animate(y, snaps.current.default, SPRING)
    // Scroll the selected card into view after a brief delay (let snap settle)
    const timer = setTimeout(() => {
      const el = cardRefs.current[selectedJobId]
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 150)
    return () => clearTimeout(timer)
  }, [selectedJobId]) // eslint-disable-line react-hooks/exhaustive-deps

  function onDragEnd(_, info) {
    const s   = snaps.current
    const cur = y.get()
    const vel = info.velocity.y

    const points = [s.expanded, s.default, s.collapsed]
    let target = points.reduce((a, b) => Math.abs(b - cur) < Math.abs(a - cur) ? b : a)

    // Velocity flick overrides nearest-snap
    if (Math.abs(vel) > 400) {
      if (vel > 0) target = points.find(p => p > cur) ?? s.collapsed
      else         target = [...points].reverse().find(p => p < cur) ?? s.expanded
    }

    animate(y, target, SPRING)
  }

  const { expandedH, collapsed } = snaps.current

  return (
    <motion.div
      drag="y"
      dragConstraints={{ top: 0, bottom: collapsed }}
      dragElastic={{ top: 0.05, bottom: 0.12 }}
      style={{ y, height: expandedH, bottom: BOTTOM_NAV_H }}
      onDragEnd={onDragEnd}
      className="fixed inset-x-0 z-30 flex flex-col bg-glass border-t border-glass-border backdrop-blur-xl rounded-t-3xl"
    >
      {/* ── Drag handle ───────────────────────────────────────────── */}
      <div className="flex justify-center pt-3 pb-2 shrink-0 cursor-grab active:cursor-grabbing touch-none">
        <div className="w-9 h-1 bg-neutral-400/40 rounded-full" />
      </div>

      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="px-4 pb-2 shrink-0">
        <p className="text-sm font-semibold text-ink">
          {loading ? 'Looking for jobs…' : `${jobs.length} job${jobs.length !== 1 ? 's' : ''} nearby`}
        </p>
      </div>

      {/* ── Scrollable job list ────────────────────────────────────── */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-3"
        // Prevent drawer drag from triggering when scrolling the list
        onPointerDown={e => e.stopPropagation()}
      >
        {loading && (
          <>
            <JobCardSkeleton />
            <JobCardSkeleton />
            <JobCardSkeleton />
          </>
        )}

        {!loading && online && jobs.length === 0 && (
          <div className="flex flex-col items-center gap-2 pt-8 text-center">
            <MapPin className="h-8 w-8 text-ink-muted" />
            <p className="text-sm font-semibold text-ink">No jobs nearby</p>
            <p className="text-xs text-ink-muted">We'll update automatically when a new job comes in.</p>
          </div>
        )}

        {!loading && !online && (
          <div className="flex flex-col items-center gap-2 pt-8 text-center">
            <Power className="h-8 w-8 text-ink-muted" />
            <p className="text-sm font-semibold text-ink">You're offline</p>
            <p className="text-xs text-ink-muted">Toggle online to start receiving jobs.</p>
          </div>
        )}

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
    </motion.div>
  )
}
