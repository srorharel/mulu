import { useRef, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useMotionValue, animate } from 'framer-motion'
import {
  MoonStar, Sparkles, ChevronRight, Loader2,
  Car, MapPin, DollarSign, Key, XCircle, CheckCircle, Video,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { JobCardSkeleton } from '../Skeleton.jsx'
import JobCard from '../JobCard.jsx'
import { useRealtimeOrder } from '../../hooks/useRealtimeOrder.js'
import { useReverseGeocode } from '../../lib/geocode.js'
import { supabase } from '../../lib/supabase.js'
import { useToast } from '../ui/Toast.jsx'
import ConfirmDialog from '../ui/ConfirmDialog.jsx'
import StatusTimeline from '../StatusTimeline.jsx'
import i18n from '../../i18n/index.js'

const SPRING        = { type: 'spring', stiffness: 300, damping: 32 }
const TOGGLE_SPRING = { type: 'spring', stiffness: 500, damping: 40 }

// Statuses from which a washer is allowed to cancel.
const CANCEL_STATUSES = ['accepted', 'en_route']

const TRANSITION_KEYS = {
  accepted:    { next: 'en_route',    key: 'washer.drawer.transitions.startDrive'  },
  en_route:    { next: 'arrived',     key: 'washer.drawer.transitions.markArrived' },
  arrived:     { next: 'in_progress', key: 'washer.drawer.transitions.startWork'   },
  in_progress: { next: 'completed',   key: 'washer.drawer.transitions.completeJob' },
}

const ADVANCE_TOAST_KEYS = {
  en_route:    'washer.drawer.toasts.enRoute',
  arrived:     'washer.drawer.toasts.arrived',
  in_progress: 'washer.drawer.toasts.inProgress',
}

const FILE_NAMES = {
  wash:          'wash.mp4',
  wiper_fluid:   'wiper_fluid.mp4',
  tire_pressure: 'tire_pressure.mp4',
}

const COLUMNS = {
  wash:          'evidence_wash_path',
  wiper_fluid:   'evidence_wiper_fluid_path',
  tire_pressure: 'evidence_tire_pressure_path',
}

function checkVideoDuration(file) {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src)
      resolve(video.duration > 30 ? i18n.t('washer.drawer.videoTooLong') : null)
    }
    video.onerror = () => {
      URL.revokeObjectURL(video.src)
      resolve(i18n.t('washer.drawer.videoReadError'))
    }
    video.src = URL.createObjectURL(file)
  })
}

function EvidenceCard({ label, path, uploading, error, onRecord }) {
  const { t }    = useTranslation()
  const inputRef = useRef(null)

  return (
    <div className="bg-glass border border-glass-border backdrop-blur-xl rounded-2xl p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">{label}</p>
        {path
          ? <span className="flex items-center gap-1 text-accent text-xs font-medium">
              <CheckCircle className="h-4 w-4" /> {t('washer.drawer.uploaded')}
            </span>
          : <span className="text-xs text-danger-500 font-medium">{t('washer.drawer.required')}</span>
        }
      </div>

      {error && <p className="text-danger-500 text-xs -mt-1">{error}</p>}

      {uploading && (
        <div className="h-1.5 bg-neutral-100 dark:bg-edge rounded-full overflow-hidden">
          <div className="h-full bg-accent rounded-full w-3/5 animate-pulse" />
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="hidden"
        onChange={e => { if (e.target.files[0]) onRecord(e.target.files[0]) }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={`w-full ${path ? 'btn-ghost text-sm' : 'btn-outline text-sm'}`}
      >
        <Video className="h-4 w-4" />
        {uploading
          ? t('washer.drawer.uploading')
          : path
            ? t('washer.drawer.replaceVideo')
            : t('washer.drawer.recordVideo')
        }
      </button>
    </div>
  )
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

function SlideToggle({ online, onToggle, toggling }) {
  const { t } = useTranslation()
  return (
    <button
      onClick={onToggle}
      disabled={toggling}
      aria-label={t('washer.toggle.ariaLabel')}
      className="flex items-center gap-2 shrink-0"
    >
      <span className={`text-xs font-medium ${online ? 'text-accent' : 'text-ink-muted'}`}>
        {toggling ? '…' : online ? t('washer.toggle.online') : t('washer.toggle.offline')}
      </span>
      <motion.div
        className="relative w-11 h-6 rounded-full border"
        animate={{
          backgroundColor: online ? 'rgba(125,217,162,0.20)' : 'rgba(255,255,255,0.06)',
          borderColor:      online ? 'rgba(125,217,162,0.45)' : 'rgba(255,255,255,0.12)',
        }}
        transition={TOGGLE_SPRING}
      >
        <motion.div
          className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full shadow-md"
          animate={{
            x:               online ? 20 : 0,
            backgroundColor: online ? 'rgb(71,209,127)' : 'rgb(115,115,115)',
          }}
          transition={TOGGLE_SPRING}
        />
      </motion.div>
    </button>
  )
}

// order and mutateOrder are passed down from JobDrawer (which owns useRealtimeOrder).
function ActiveJobPanel({ activeJob, order, mutateOrder, onJobDone }) {
  const showToast = useToast()
  const { t }     = useTranslation()
  const { address } = useReverseGeocode(activeJob?.lat, activeJob?.lng)
  const [advancing, setAdvancing]   = useState(false)
  const advancingRef  = useRef(false)
  const [uploading, setUploading]       = useState({})
  const [uploadErrors, setUploadErrors] = useState({})

  // Realtime consumer-cancel detection
  useEffect(() => {
    if (order?.status === 'cancelled') onJobDone()
  }, [order?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  async function uploadEvidence(type, file) {
    if (file.size > 50 * 1024 * 1024) {
      setUploadErrors(e => ({ ...e, [type]: t('washer.drawer.videoTooLarge') }))
      return
    }
    const durationError = await checkVideoDuration(file)
    if (durationError) {
      setUploadErrors(e => ({ ...e, [type]: durationError }))
      return
    }
    setUploading(u => ({ ...u, [type]: true }))
    setUploadErrors(e => ({ ...e, [type]: '' }))

    const path = `${activeJob.id}/${FILE_NAMES[type]}`
    const { error: uploadError } = await supabase.storage
      .from('job-evidence')
      .upload(path, file, { upsert: true })

    if (uploadError) {
      setUploadErrors(e => ({ ...e, [type]: uploadError.message }))
      setUploading(u => ({ ...u, [type]: false }))
      return
    }

    const { error: updateError } = await supabase
      .from('orders')
      .update({ [COLUMNS[type]]: path })
      .eq('id', activeJob.id)

    if (updateError) setUploadErrors(e => ({ ...e, [type]: updateError.message }))
    else mutateOrder({ [COLUMNS[type]]: path })

    setUploading(u => ({ ...u, [type]: false }))
  }

  async function advance() {
    if (advancingRef.current || !order) return
    const trans = TRANSITION_KEYS[order.status]
    if (!trans) return
    advancingRef.current = true
    setAdvancing(true)
    const { error } = await supabase.rpc('transition_order_status', {
      order_id:   activeJob.id,
      new_status: trans.next,
    })
    advancingRef.current = false
    setAdvancing(false)
    if (error) {
      if (!error.message?.match(/Invalid transition: (\S+) → \1/)) {
        showToast(error.message, 'error')
      }
      return
    }
    mutateOrder({ status: trans.next })
    if (trans.next === 'completed') {
      showToast(t('washer.drawer.toasts.completed'), 'success')
      setTimeout(onJobDone, 2000)
    } else {
      showToast(t(ADVANCE_TOAST_KEYS[trans.next] ?? 'washer.drawer.updating'), 'success')
    }
  }

  if (!order) return (
    <div className="flex justify-center py-8">
      <Loader2 className="h-6 w-6 animate-spin text-ink-muted" />
    </div>
  )

  const trans        = TRANSITION_KEYS[order.status]
  const isCompleting = trans?.next === 'completed'
  const anyUploading = Object.values(uploading).some(Boolean)

  const canComplete = (
    order.evidence_wash_path != null &&
    (!order.addon_wiper_fluid   || order.evidence_wiper_fluid_path   != null) &&
    (!order.addon_tire_pressure || order.evidence_tire_pressure_path != null)
  )

  const missingEvidence = [
    !order.evidence_wash_path                                         && t('washer.drawer.washVideo'),
    order.addon_wiper_fluid   && !order.evidence_wiper_fluid_path    && t('washer.drawer.wiperFluidEvidence'),
    order.addon_tire_pressure && !order.evidence_tire_pressure_path  && t('washer.drawer.tirePressureEvidence'),
  ].filter(Boolean)

  return (
    <div className="flex flex-col gap-3 px-4 pb-6">

      {/* Job info */}
      <div className="bg-glass border border-glass-border backdrop-blur-xl rounded-2xl p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-muted shrink-0">
            <Car className="h-4 w-4 text-accent" />
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">
              {t(`carLabels.${order.car_type}`)} — {t(`serviceLabels.${order.service_type}`)}
            </p>
            <p className="text-xs text-ink-muted">{t('washer.jobDetail.payout', { amount: order.base_price })}</p>
          </div>
        </div>

        <div className="flex items-start gap-2 text-xs text-ink-muted">
          <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span className="leading-snug">{address}</span>
        </div>

        <div className="flex items-center gap-2 text-xs text-ink-muted">
          <DollarSign className="h-3.5 w-3.5 shrink-0" />
          <span>{t('washer.drawer.customerPays', { amount: order.total_price })}</span>
        </div>
      </div>

      {/* Access instructions */}
      <div className="bg-glass border border-glass-border backdrop-blur-xl rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <Key className="h-4 w-4 text-accent shrink-0" />
          <p className="text-sm font-semibold text-accent">{t('washer.drawer.accessInstructions')}</p>
        </div>
        <p className="text-sm text-ink">
          {order.key_location || t('washer.drawer.noAccessNotes')}
        </p>
      </div>

      {/* Status timeline */}
      <div className="bg-glass border border-glass-border backdrop-blur-xl rounded-2xl p-4">
        <StatusTimeline status={order.status} />
      </div>

      {/* Evidence section — only when in_progress */}
      {order.status === 'in_progress' && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold text-ink px-1">{t('washer.drawer.uploadEvidence')}</p>

          <EvidenceCard
            label={t('washer.drawer.washVideo')}
            path={order.evidence_wash_path}
            uploading={!!uploading.wash}
            error={uploadErrors.wash}
            onRecord={file => uploadEvidence('wash', file)}
          />

          {order.addon_wiper_fluid && (
            <EvidenceCard
              label={t('washer.drawer.wiperFluidEvidence')}
              path={order.evidence_wiper_fluid_path}
              uploading={!!uploading.wiper_fluid}
              error={uploadErrors.wiper_fluid}
              onRecord={file => uploadEvidence('wiper_fluid', file)}
            />
          )}

          {order.addon_tire_pressure && (
            <EvidenceCard
              label={t('washer.drawer.tirePressureEvidence')}
              path={order.evidence_tire_pressure_path}
              uploading={!!uploading.tire_pressure}
              error={uploadErrors.tire_pressure}
              onRecord={file => uploadEvidence('tire_pressure', file)}
            />
          )}
        </div>
      )}

      {/* Completed card */}
      {order.status === 'completed' && (
        <div className="bg-glass border border-glass-border backdrop-blur-xl rounded-2xl p-4 text-center">
          <p className="font-semibold text-accent">{t('washer.drawer.jobCompleted')}</p>
        </div>
      )}

      {/* Primary action */}
      {trans && (
        <>
          <button
            onClick={advance}
            disabled={advancing || anyUploading || (isCompleting && !canComplete)}
            className="btn-primary w-full"
          >
            {advancing
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <ChevronRight className="h-4 w-4 rtl:rotate-180" />
            }
            {advancing ? t('washer.drawer.updating') : t(trans.key)}
          </button>

          {isCompleting && !canComplete && (
            <p className="text-xs text-center text-ink-muted px-2">
              {t('washer.drawer.uploadRequired', { items: missingEvidence.join(', ') })}
            </p>
          )}
        </>
      )}
    </div>
  )
}

export default function JobDrawer({ jobs, loading, selectedJobId, online, onToggle, toggling, activeJob, onJobDone }) {
  const navigate  = useNavigate()
  const { t }     = useTranslation()
  const showToast = useToast()
  const snaps     = useRef(getSnaps())
  const y         = useMotionValue(snaps.current.default)
  const listRef   = useRef(null)
  const cardRefs  = useRef({})

  const { order, mutateOrder }                    = useRealtimeOrder(activeJob?.id)
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  const [cancelling, setCancelling]               = useState(false)
  const cancellingRef                             = useRef(false)

  const isActive   = !!activeJob
  const canCancel  = isActive && CANCEL_STATUSES.includes(order?.status)

  async function cancelJob() {
    if (cancellingRef.current) return
    cancellingRef.current = true
    setCancelling(true)
    const { error } = await supabase.rpc('transition_order_status', {
      order_id:   activeJob.id,
      new_status: 'cancelled',
    })
    cancellingRef.current = false
    setCancelling(false)
    if (error) { showToast(error.message, 'error'); return }
    onJobDone()
  }

  // Safety net: block going offline while a job is active (shouldn't trigger
  // in normal flow since the toggle is hidden during active jobs).
  function handleToggle() {
    if (activeJob) {
      showToast(t('washer.online.cantGoOfflineActive'), 'error')
      return
    }
    onToggle()
  }

  useEffect(() => {
    if (!selectedJobId) return
    animate(y, snaps.current.default, SPRING)
    const timer = setTimeout(() => {
      const el = cardRefs.current[selectedJobId]
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 150)
    return () => clearTimeout(timer)
  }, [selectedJobId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    animate(y, activeJob ? snaps.current.expanded : snaps.current.default, SPRING)
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
  const drawerTitle = isActive ? t('washer.drawer.activeJob') : t('washer.drawer.jobsNearby')

  // Header trailing slot:
  //   active job + cancellable status → compact danger pill
  //   active job + non-cancellable status (arrived+) → nothing
  //   no active job → online toggle
  const headerTrailing = isActive
    ? (canCancel
        ? <button
            onClick={() => setCancelConfirmOpen(true)}
            disabled={cancelling}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-danger-500 bg-danger-500/10 border border-danger-500/20 hover:bg-danger-500/20 transition-colors shrink-0"
          >
            {cancelling
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <XCircle className="h-3.5 w-3.5" />
            }
            {cancelling ? t('washer.drawer.cancelling') : t('washer.drawer.cancel.shortLabel')}
          </button>
        : null)
    : <SlideToggle online={online} onToggle={handleToggle} toggling={toggling} />

  return (
    <motion.div
      drag={isActive ? false : 'y'}
      dragConstraints={{ top: 0, bottom: collapsed }}
      dragElastic={{ top: 0.05, bottom: 0.12 }}
      style={{ y, height: expandedH, bottom: 'var(--nav-height, 56px)' }}
      onDragEnd={onDragEnd}
      className="fixed inset-x-0 z-30 flex flex-col bg-glass border-t border-glass-border backdrop-blur-xl rounded-t-3xl"
    >
      {/* Drag handle — visible only in job-list mode */}
      <div className="flex justify-center pt-3 pb-2 shrink-0 touch-none" style={{ cursor: isActive ? 'default' : undefined }}>
        {isActive
          ? <div className="w-9 h-1" />
          : <div className="w-9 h-1 bg-neutral-400/40 rounded-full cursor-grab active:cursor-grabbing" />
        }
      </div>

      {/* Header */}
      <div className="px-4 pb-3 shrink-0 flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5 min-w-0">
          <p className="text-base font-bold text-ink leading-tight">{drawerTitle}</p>
          {!isActive && online && !loading && jobs.length > 0 && (
            <p className="text-xs text-ink-muted">
              {t('washer.drawer.jobsNearbyCount', { count: jobs.length })}
            </p>
          )}
          {!isActive && loading && (
            <p className="text-xs text-ink-muted">{t('washer.drawer.lookingForJobs')}</p>
          )}
        </div>
        {headerTrailing}
      </div>

      {/* Body */}
      {isActive ? (
        <div
          className="flex-1 overflow-y-auto"
          onPointerDown={e => e.stopPropagation()}
        >
          <ActiveJobPanel
            activeJob={activeJob}
            order={order}
            mutateOrder={mutateOrder}
            onJobDone={onJobDone}
          />
        </div>
      ) : (
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

          {!loading && !online && (
            <div className="flex flex-col items-center gap-3 pt-10 text-center">
              <MoonStar className="h-9 w-9 text-ink-muted/50" />
              <p className="text-sm font-semibold text-ink">{t('washer.drawer.goOnline')}</p>
              <p className="text-xs text-ink-muted/70">{t('washer.drawer.goOnlineHint')}</p>
            </div>
          )}

          {!loading && online && jobs.length === 0 && (
            <div className="flex flex-col items-center gap-3 pt-10 text-center">
              <Sparkles className="h-9 w-9 text-ink-muted/50" />
              <p className="text-sm font-semibold text-ink">{t('washer.drawer.noJobs')}</p>
              <p className="text-xs text-ink-muted/70">{t('washer.drawer.noJobsHint')}</p>
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
      )}

      <ConfirmDialog
        open={cancelConfirmOpen}
        onConfirm={() => { setCancelConfirmOpen(false); cancelJob() }}
        onCancel={() => setCancelConfirmOpen(false)}
        title={t('washer.drawer.cancel.title')}
        message={t('washer.drawer.cancel.message')}
        confirmLabel={t('washer.drawer.cancel.confirmLabel')}
        cancelLabel={t('washer.drawer.cancel.cancelLabel')}
        destructive
      />
    </motion.div>
  )
}
