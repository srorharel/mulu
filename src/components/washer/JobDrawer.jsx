import { useRef, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useMotionValue, animate } from 'framer-motion'
import {
  MoonStar, Sparkles, ChevronRight, Loader2,
  Car, MapPin, DollarSign, Key, XCircle, CheckCircle, Video, MessageCircle, Camera,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { JobCardSkeleton } from '../Skeleton.jsx'
import JobCard from '../JobCard.jsx'
import { useRealtimeOrder } from '../../hooks/useRealtimeOrder.js'
import { useReverseGeocode } from '../../lib/geocode.js'
import { haversineKm } from '../../lib/geo.js'
import { supabase } from '../../lib/supabase.js'
import { useToast } from '../ui/Toast.jsx'
import ConfirmDialog from '../ui/ConfirmDialog.jsx'
import StatusTimeline from '../StatusTimeline.jsx'
import SupportChatSheet from '../support/SupportChatSheet.jsx'
import PhotoLightbox from '../ui/PhotoLightbox.jsx'
import { getOrCreateOrderConversation } from '../../lib/support.js'
import i18n from '../../i18n/index.js'
import { VAT_RATE } from '../../lib/pricing.js'

const SPRING        = { type: 'spring', stiffness: 300, damping: 32 }
const TOGGLE_SPRING = { type: 'spring', stiffness: 500, damping: 40 }

const CANCEL_STATUSES = ['accepted', 'en_route']

const TRANSITION_KEYS = {
  accepted:    { next: 'en_route',         key: 'washer.drawer.transitions.startDrive'        },
  en_route:    { next: 'arrived',          key: 'washer.drawer.transitions.markArrived'       },
  arrived:     { next: 'in_progress',      key: 'washer.drawer.transitions.startWork'         },
  in_progress: { next: 'pending_approval', key: 'washer.drawer.transitions.submitForApproval' },
}

const ADVANCE_TOAST_KEYS = {
  en_route:    'washer.drawer.toasts.enRoute',
  arrived:     'washer.drawer.toasts.arrived',
  in_progress: 'washer.drawer.toasts.inProgress',
  // pending_approval handled separately (triggers onJobDone with delay)
}

const FILE_NAMES = {
  before:        'before.mp4',
  after:         'after.mp4',
  wiper_fluid:   'wiper_fluid.mp4',
  tire_pressure: 'tire_pressure.mp4',
}

const COLUMNS = {
  before:        'evidence_before_path',
  after:         'evidence_after_path',
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

// Israeli plate display: 7 digits → XX-XXX-XX, 8 digits → XXX-XX-XXX
function formatPlate(digits) {
  if (!digits) return ''
  if (digits.length === 7) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`
  if (digits.length >= 8) return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`
  return digits
}

// ── Vehicle section shown in the active-job panel ──────────────────────────────
function VehicleSection({ order }) {
  const { t }   = useTranslation()
  const [lightboxOpen, setLightboxOpen]   = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [photoUrls, setPhotoUrls]         = useState([])

  const isHighlighted = order.status === 'arrived' || order.status === 'in_progress'

  useEffect(() => {
    if (!order) return
    async function loadUrls() {
      const paths = [order.car_photo_1_path, order.car_photo_2_path].filter(Boolean)
      if (paths.length === 0) { setPhotoUrls([]); return }
      const urls = await Promise.all(
        paths.map(async p => {
          const { data } = await supabase.storage.from('car-photos').createSignedUrl(p, 3600)
          return data?.signedUrl ?? null
        })
      )
      setPhotoUrls(urls.filter(Boolean))
    }
    loadUrls()
  }, [order?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const hasInfo = order.car_plate || order.car_make || order.car_photo_1_path || order.car_photo_2_path

  return (
    <div className={`bg-glass border backdrop-blur-xl rounded-2xl p-4 flex flex-col gap-3 ${
      isHighlighted ? 'border-accent/40' : 'border-glass-border'
    }`}>
      <div className="flex items-center gap-2">
        <Car className="h-4 w-4 text-accent shrink-0" />
        <p className="text-sm font-semibold text-accent">{t('washer.drawer.vehicle.title')}</p>
      </div>

      {!hasInfo ? (
        <p className="text-sm text-ink-muted">{t('washer.drawer.vehicle.notProvided')}</p>
      ) : (
        <>
          {/* Plate — primary identifier, shown largest */}
          {order.car_plate && (
            <div className="rounded-lg bg-accent-muted px-3 py-2 self-start">
              <p className="text-base font-mono font-bold text-accent tracking-widest">
                {formatPlate(order.car_plate)}
              </p>
            </div>
          )}

          {/* Color + make + model + year */}
          {(order.car_make || order.car_color) && (
            <p className="text-sm text-ink">
              {[order.car_color, order.car_make, order.car_model, order.car_year].filter(Boolean).join(' · ')}
            </p>
          )}

          {/* Photo thumbnails — 0, 1, or 2 */}
          {photoUrls.length > 0 && (
            <div className={`grid gap-2 ${photoUrls.length === 1 ? 'grid-cols-1 max-w-[50%]' : 'grid-cols-2'}`}>
              {photoUrls.map((url, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => { setLightboxIndex(i); setLightboxOpen(true) }}
                  className="aspect-square rounded-xl overflow-hidden border border-glass-border"
                >
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {/* Loading placeholder while signed URLs resolve */}
          {(order.car_photo_1_path || order.car_photo_2_path) && photoUrls.length === 0 && (
            <div className={`grid gap-2 ${order.car_photo_2_path ? 'grid-cols-2' : 'grid-cols-1 max-w-[50%]'}`}>
              {[order.car_photo_1_path, order.car_photo_2_path].filter(Boolean).map((_, i) => (
                <div key={i} className="aspect-square rounded-xl bg-neutral-100 flex items-center justify-center">
                  <Camera className="h-5 w-5 text-neutral-300" />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {lightboxOpen && photoUrls.length > 0 && (
        <PhotoLightbox
          photos={photoUrls}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </div>
  )
}

// ── Active-job panel ───────────────────────────────────────────────────────────
function ActiveJobPanel({ activeJob, order, mutateOrder, onJobDone, position }) {
  const navigate  = useNavigate()
  const showToast = useToast()
  const { t }     = useTranslation()
  const { address } = useReverseGeocode(activeJob?.lat, activeJob?.lng)

  const [advancing, setAdvancing]     = useState(false)
  const advancingRef                  = useRef(false)
  const [uploading, setUploading]     = useState({})
  const [uploadErrors, setUploadErrors] = useState({})
  const [supportConvId, setSupportConvId] = useState(null)
  const [supportOpen, setSupportOpen]     = useState(false)
  const [openingSupport, setOpeningSupport] = useState(false)

  // Geofence failed-attempt tracking: array of timestamps
  const failedAttemptsRef = useRef([])
  const [showContactSupport, setShowContactSupport] = useState(false)

  async function handleOpenSupport() {
    setOpeningSupport(true)
    const consumerId = order?.consumer_id || null
    const { data, error } = await getOrCreateOrderConversation(activeJob.id, consumerId)
    setOpeningSupport(false)
    if (error || !data) { showToast(i18n.t('support.errors.createFailed'), 'error'); return }
    setSupportConvId(data.id)
    setSupportOpen(true)
  }

  // Realtime consumer-cancel detection + pending_approval auto-clear
  useEffect(() => {
    if (order?.status === 'cancelled') onJobDone()
    if (order?.status === 'pending_approval') {
      const t = setTimeout(onJobDone, 1500)
      return () => clearTimeout(t)
    }
  }, [order?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  function recordGeofenceFailure() {
    const now    = Date.now()
    const cutoff = now - 5 * 60 * 1000
    failedAttemptsRef.current = [...failedAttemptsRef.current.filter(t => t > cutoff), now]
    if (failedAttemptsRef.current.length >= 3) setShowContactSupport(true)
  }

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

    const isArriving = trans.next === 'arrived'
    const { error } = await supabase.rpc('transition_order_status', {
      order_id:   activeJob.id,
      new_status: trans.next,
      washer_lat: isArriving ? (position?.lat ?? null) : null,
      washer_lng: isArriving ? (position?.lng ?? null) : null,
    })

    advancingRef.current = false
    setAdvancing(false)

    if (error) {
      const isGeofenceError =
        error.message?.includes('Too far from location') ||
        error.message?.includes('Worker location required')

      if (isArriving && isGeofenceError) recordGeofenceFailure()

      if (!error.message?.match(/Invalid transition: (\S+) → \1/)) {
        showToast(error.message, 'error')
      }
      return
    }

    mutateOrder({ status: trans.next })
    if (trans.next === 'pending_approval') {
      showToast(t('washer.drawer.toasts.submitted'), 'success')
      setTimeout(onJobDone, 1500)
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
  const isCompleting = trans?.next === 'pending_approval'
  const isArriving   = trans?.next === 'arrived'
  const anyUploading = Object.values(uploading).some(Boolean)

  // Client-side geofence
  const distanceM = (isArriving && position && order.lat && order.lng)
    ? Math.round(haversineKm(position.lat, position.lng, order.lat, order.lng) * 1000)
    : null
  const isTooFar   = isArriving && (distanceM === null || distanceM > 100)
  const noGps      = isArriving && !position

  // Both before + after required to submit for approval.
  // Legacy addon evidence (wiper/tire) still gates completion for old orders.
  const canComplete = (
    order.evidence_before_path != null &&
    order.evidence_after_path  != null &&
    (!order.addon_wiper_fluid   || order.evidence_wiper_fluid_path   != null) &&
    (!order.addon_tire_pressure || order.evidence_tire_pressure_path != null)
  )

  const missingEvidence = [
    !order.evidence_before_path                                        && t('washer.evidence.before'),
    !order.evidence_after_path                                         && t('washer.evidence.after'),
    order.addon_wiper_fluid   && !order.evidence_wiper_fluid_path     && t('washer.drawer.wiperFluidEvidence'),
    order.addon_tire_pressure && !order.evidence_tire_pressure_path   && t('washer.drawer.tirePressureEvidence'),
  ].filter(Boolean)

  const isActionDisabled = advancing || anyUploading || (isCompleting && !canComplete) || (isArriving && isTooFar)

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
              {t(`carLabels.${order.car_type}`)}
            </p>
            <p className="text-sm font-medium text-accent">
              {t('washer.drawer.earnings.label')}: ₪{order.base_price}
            </p>
            <p className="text-xs text-ink-muted">
              {t('washer.drawer.earnings.includesVat', {
                rate:   Math.round(VAT_RATE * 100),
                amount: (order.base_price - order.base_price / (1 + VAT_RATE)).toFixed(2),
              })}
            </p>
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

      {/* Vehicle section */}
      <VehicleSection order={order} />

      {/* Access notes — new orders use access_notes; legacy orders fall back to key_location */}
      <div className="bg-glass border border-glass-border backdrop-blur-xl rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <Key className="h-4 w-4 text-accent shrink-0" />
          <p className="text-sm font-semibold text-accent">{t('washer.drawer.access.title')}</p>
        </div>
        <p className="text-sm text-ink">
          {order.access_notes || order.key_location || t('washer.drawer.access.none')}
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
            label={t('washer.evidence.before')}
            path={order.evidence_before_path}
            uploading={!!uploading.before}
            error={uploadErrors.before}
            onRecord={file => uploadEvidence('before', file)}
          />
          <EvidenceCard
            label={t('washer.evidence.after')}
            path={order.evidence_after_path}
            uploading={!!uploading.after}
            error={uploadErrors.after}
            onRecord={file => uploadEvidence('after', file)}
          />

          {/* Legacy addon evidence — still shown if old order has addons */}
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

      {/* Submitted state — visible briefly while drawer waits to clear */}
      {order.status === 'pending_approval' && (
        <div className="bg-glass border border-glass-border backdrop-blur-xl rounded-2xl p-4 text-center">
          <p className="font-semibold text-accent">{t('washer.drawer.submitted')}</p>
          <p className="text-xs text-ink-muted mt-1">{t('washer.drawer.submittedDesc')}</p>
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
            onClick={isActionDisabled ? undefined : advance}
            disabled={isActionDisabled}
            className="btn-primary w-full"
          >
            {advancing
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <ChevronRight className="h-4 w-4 rtl:rotate-180" />
            }
            {advancing ? t('washer.drawer.updating') : t(trans.key)}
          </button>

          {/* Geofence helpers */}
          {isArriving && noGps && (
            <p className="text-xs text-center text-ink-muted px-2">
              {t('washer.drawer.geofence.gpsRequired')}
            </p>
          )}
          {isArriving && isTooFar && distanceM !== null && (
            <p className="text-xs text-center text-ink-muted px-2">
              {t('washer.drawer.geofence.tooFar')} — {t('washer.drawer.geofence.distance', { distance: distanceM })}
            </p>
          )}
          {isArriving && showContactSupport && (
            <button
              type="button"
              onClick={() => navigate('/washer/support')}
              className="btn-ghost w-full text-sm text-warning-600"
            >
              {t('washer.drawer.geofence.contactSupport')}
            </button>
          )}

          {isCompleting && !canComplete && (
            <p className="text-xs text-center text-ink-muted px-2">
              {t('washer.drawer.uploadRequired', { items: missingEvidence.join(', ') })}
            </p>
          )}
        </>
      )}

      <button
        onClick={handleOpenSupport}
        disabled={openingSupport}
        className="btn-ghost w-full text-sm"
      >
        <MessageCircle className="h-4 w-4" />
        {openingSupport ? t('common.loading') : t('support.needHelp')}
      </button>

      <SupportChatSheet
        open={supportOpen}
        convId={supportConvId}
        onClose={() => setSupportOpen(false)}
      />
    </div>
  )
}

// ── Main drawer component ──────────────────────────────────────────────────────
export default function JobDrawer({ jobs, loading, selectedJobId, online, onToggle, toggling, activeJob, onJobDone, position }) {
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
    : null  // toggle relocated to Dashboard top-chrome pill

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
            position={position}
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
