import { useRef, useEffect, useState, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useMotionValue, animate } from 'framer-motion'
import {
  MoonStar, Sparkles, ChevronRight, Loader2,
  Car, MapPin, DollarSign, Key, XCircle, CheckCircle, Video, MessageCircle, Camera,
  Phone, Droplets, Zap, Star, ArrowLeft, Check,
} from 'lucide-react'
import IsraeliPlate from '../ui/IsraeliPlate.jsx'
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

// ── Status badge shown in the active-job drawer header ────────────────────────
function StatusBadge({ status, t }) {
  const MAP = {
    accepted:         'washer.drawer.badge.enRoute',
    en_route:         'washer.drawer.badge.enRoute',
    arrived:          'washer.drawer.badge.arrived',
    in_progress:      'washer.drawer.badge.washing',
    pending_approval: 'washer.drawer.badge.review',
  }
  const key = MAP[status]
  if (!key) return null
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-primary-700 shrink-0">
      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse shrink-0" />
      <span className="text-[11px] font-bold text-white uppercase tracking-[0.3px]">{t(key)}</span>
    </div>
  )
}

// ── Single read-only site-resource pill ───────────────────────────────────────
function SiteResourcePill({ icon: Icon, label, available, t }) {
  return (
    <div className={`flex-1 flex items-center gap-2 p-2.5 rounded-[14px] border ${
      available ? 'bg-accent-muted border-accent/25' : 'bg-glass border-glass-border'
    }`}>
      <Icon className={`h-4 w-4 shrink-0 ${available ? 'text-accent' : 'text-ink-muted'}`} />
      <div className="min-w-0">
        <p className="text-[12px] font-bold text-ink leading-tight truncate">{label}</p>
        <p className={`text-[10px] ${available ? 'text-accent' : 'text-ink-muted'}`}>
          {available ? t('consumer.home.available') : t('consumer.home.notOnSite')}
        </p>
      </div>
    </div>
  )
}

// ── Horizontal 4-step washer stage tracker ────────────────────────────────────
// Maps order status → active stage index (0–3). Stages: Arrived / Pre-rinse / Wash / Complete.
// accepted/en_route = -1 (driving, no stage active yet).
// arrived = 1 (Arrived ✓ done, Pre-rinse active — washer is setting up).
// in_progress = 2 (Arrived + Pre-rinse ✓, Wash active).
// pending_approval/completed = 3 (all done, Complete active).
const STATUS_TO_STAGE = {
  accepted: -1, en_route: -1,
  arrived: 1, in_progress: 2,
  pending_approval: 3, completed: 3,
}

function WasherStageDots({ status, t }) {
  const stages = [
    t('washer.drawer.stage.arrived'),
    t('washer.drawer.stage.preRinse'),
    t('washer.drawer.stage.wash'),
    t('washer.drawer.stage.complete'),
  ]
  const current = STATUS_TO_STAGE[status] ?? -1

  return (
    <div className="flex items-center gap-1.5 px-1">
      {stages.map((label, i) => {
        const done   = i < current
        const active = i === current
        return (
          <Fragment key={label}>
            <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
              <div className={`w-[14px] h-[14px] rounded-full flex items-center justify-center shrink-0 ${
                done   ? 'bg-primary-500' :
                active ? 'bg-primary-500 ring-[3px] ring-primary-700' :
                         'bg-white/12'
              }`} style={active ? { boxShadow: '0 0 0 3px rgba(125,217,162,0.25)' } : {}}>
                {done && <Check className="h-[8px] w-[8px] text-white" strokeWidth={4} />}
              </div>
              <p className={`text-[10px] leading-tight text-center ${
                active ? 'font-bold text-ink' : 'font-medium text-ink-muted'
              }`}>{label}</p>
            </div>
            {i < stages.length - 1 && (
              <div className={`flex-[0.3] h-0.5 rounded-full mb-4 shrink-0 ${
                done ? 'bg-primary-500' : 'bg-white/10'
              }`} />
            )}
          </Fragment>
        )
      })}
    </div>
  )
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
          {/* Plate + car info row */}
          <div className="flex items-center gap-3">
            {order.car_plate && <IsraeliPlate number={formatPlate(order.car_plate)} />}
            {(order.car_make || order.car_color) && (
              <div className="min-w-0">
                <p className="text-[16px] font-bold text-ink leading-snug truncate">
                  {[order.car_make, order.car_model].filter(Boolean).join(' ')}
                </p>
                <p className="text-[12px] text-ink-muted">
                  {[order.car_year, order.car_color].filter(Boolean).join(' · ')}
                </p>
              </div>
            )}
          </div>

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
  const [consumerProfile, setConsumerProfile] = useState(null)

  // Geofence failed-attempt tracking: array of timestamps
  const failedAttemptsRef = useRef([])
  const [showContactSupport, setShowContactSupport] = useState(false)

  // Fetch consumer profile for the customer card.
  useEffect(() => {
    if (!order?.consumer_id) return
    supabase.from('profiles').select('id, full_name')
      .eq('id', order.consumer_id).single()
      .then(({ data }) => setConsumerProfile(data ?? null))
  }, [order?.consumer_id])

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

    const isArriving   = trans.next === 'arrived'
    const isSubmitting = trans.next === 'pending_approval'
    const needsGps     = isArriving || isSubmitting
    const { error } = await supabase.rpc('transition_order_status', {
      order_id:   activeJob.id,
      new_status: trans.next,
      washer_lat: needsGps ? (position?.lat ?? null) : null,
      washer_lng: needsGps ? (position?.lng ?? null) : null,
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

  const noGpsSubmit      = isCompleting && !position
  const isActionDisabled = advancing || anyUploading || (isCompleting && !canComplete) || (isArriving && isTooFar) || noGpsSubmit

  // Consumer info for the customer card.
  const consumerName     = consumerProfile?.full_name || t('washer.drawer.customer')
  const consumerInitials = consumerProfile?.full_name
    ? consumerProfile.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : 'C'
  const wazeUrl = (activeJob?.lat && activeJob?.lng)
    ? `https://waze.com/ul?ll=${activeJob.lat},${activeJob.lng}&navigate=yes`
    : null

  return (
    <div className="flex flex-col gap-3 px-4 pb-6">

      {/* ── Vehicle card (IsraeliPlate + photos) ── */}
      <VehicleSection order={order} />

      {/* ── Customer card ── */}
      <div className="bg-glass border border-glass-border backdrop-blur-xl rounded-glass p-3.5 flex flex-col gap-3">
        {/* Customer row: avatar + name + rating + action buttons */}
        <div className="flex items-center gap-3">
          <div
            className="w-[42px] h-[42px] rounded-full flex items-center justify-center text-white font-bold text-[16px] shrink-0 border-2 border-white/10"
            style={{ background: 'linear-gradient(135deg, #c08adb, #6e4f8a)' }}
          >
            {consumerInitials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-bold text-ink truncate">{consumerName}</p>
            {/* ADR-017: rating is a static placeholder — no rating column on profiles */}
            <div className="flex items-center gap-1.5 text-[12px] text-ink-muted">
              <Star className="h-3 w-3 shrink-0" fill="#f59e0b" stroke="none" />
              <span className="text-ink font-semibold">4.8</span>
              <span>· {t('washer.drawer.orders')}</span>
            </div>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <button
              onClick={handleOpenSupport}
              disabled={openingSupport}
              aria-label={t('support.needHelp')}
              className="w-9 h-9 rounded-[11px] border border-glass-border bg-glass flex items-center justify-center text-ink"
            >
              <MessageCircle className="h-[16px] w-[16px]" />
            </button>
            {/* Phone: no phone stored — visual only per ADR-017 */}
            <div className="w-9 h-9 rounded-[11px] border border-glass-border bg-glass flex items-center justify-center text-ink opacity-35">
              <Phone className="h-[16px] w-[16px]" />
            </div>
          </div>
        </div>

        {/* Location + access notes + Waze */}
        <div className="flex items-center gap-2.5 pt-2.5 border-t border-glass-border">
          <div className="w-8 h-8 rounded-[10px] bg-accent-muted flex items-center justify-center text-accent shrink-0">
            <MapPin className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-ink leading-snug truncate">{address}</p>
            {(order.access_notes || order.key_location) && (
              <p className="text-[11px] text-ink-muted truncate">
                {order.access_notes || order.key_location}
              </p>
            )}
          </div>
          {wazeUrl && (
            <a
              href={wazeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1.5 rounded-[10px] bg-accent-muted text-accent text-[11px] font-bold shrink-0"
            >
              {t('washer.nav.openIn', { app: 'Waze' })}
            </a>
          )}
        </div>
      </div>

      {/* ── Site resources (read-only) ── */}
      <div className="flex gap-2">
        <SiteResourcePill icon={Droplets} label={t('consumer.home.waterAccessible')} available={order.site_has_water} t={t} />
        <SiteResourcePill icon={Zap}      label={t('consumer.home.powerAccessible')} available={order.site_has_power}  t={t} />
      </div>

      {/* ── Stage progress ── */}
      <div className="bg-glass border border-glass-border backdrop-blur-xl rounded-glass p-4 flex flex-col gap-3">
        <p className="text-[11px] font-bold text-accent uppercase tracking-[0.4px]">
          {t('washer.drawer.stage.label')}
        </p>
        <WasherStageDots status={order.status} t={t} />
      </div>

      {/* ── Evidence section — only when in_progress ── */}
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

      {/* ── Terminal states ── */}
      {order.status === 'pending_approval' && (
        <div className="bg-glass border border-glass-border backdrop-blur-xl rounded-glass p-4 text-center">
          <p className="font-semibold text-accent">{t('washer.drawer.submitted')}</p>
          <p className="text-xs text-ink-muted mt-1">{t('washer.drawer.submittedDesc')}</p>
        </div>
      )}
      {order.status === 'completed' && (
        <div className="bg-glass border border-glass-border backdrop-blur-xl rounded-glass p-4 text-center">
          <p className="font-semibold text-accent">{t('washer.drawer.jobCompleted')}</p>
        </div>
      )}

      {/* ── CTA: earnings strip + primary action button ── */}
      {trans && (
        <>
          {/* Earnings strip */}
          <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-[14px] bg-accent-muted border border-accent/20">
            <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-wider">
              {t('washer.drawer.earnings.label')}
            </p>
            <div className="flex-1" />
            <p className="text-[16px] font-extrabold text-accent tracking-[-0.3px]">₪{order.base_price}</p>
          </div>

          {/* Primary action */}
          <button
            onClick={isActionDisabled ? undefined : advance}
            disabled={isActionDisabled}
            className="w-full h-[54px] rounded-2xl bg-gradient-to-b from-primary-500 to-primary-700 text-white font-extrabold text-[16px] flex items-center justify-center gap-2.5 disabled:opacity-50"
            style={{ boxShadow: '0 8px 22px rgba(38,181,95,0.45), inset 0 1px 0 rgba(255,255,255,0.3)' }}
          >
            {advancing
              ? <Loader2 className="h-5 w-5 animate-spin" />
              : <Check className="h-5 w-5" strokeWidth={3} />
            }
            {advancing ? t('washer.drawer.updating') : t(trans.key)}
          </button>

          {/* Geofence helpers */}
          {isArriving && noGps && (
            <p className="text-xs text-center text-ink-muted px-2">{t('washer.drawer.geofence.gpsRequired')}</p>
          )}
          {isArriving && isTooFar && distanceM !== null && (
            <p className="text-xs text-center text-ink-muted px-2">
              {t('washer.drawer.geofence.tooFar')} — {t('washer.drawer.geofence.distance', { distance: distanceM })}
            </p>
          )}
          {isArriving && showContactSupport && (
            <button type="button" onClick={() => navigate('/washer/support')} className="btn-ghost w-full text-sm text-warning-600">
              {t('washer.drawer.geofence.contactSupport')}
            </button>
          )}
          {isCompleting && noGpsSubmit && (
            <p className="text-xs text-center text-ink-muted px-2">
              {t('washer.drawer.submit.gpsRequired')}
            </p>
          )}
          {isCompleting && !canComplete && (
            <p className="text-xs text-center text-ink-muted px-2">
              {t('washer.drawer.uploadRequired', { items: missingEvidence.join(', ') })}
            </p>
          )}
        </>
      )}

      <SupportChatSheet open={supportOpen} convId={supportConvId} onClose={() => setSupportOpen(false)} />
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
      {isActive ? (
        /* Active-job header: job ID + title + status badge + cancel */
        <div className="px-4 pt-1 pb-3 shrink-0 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-[0.4px]">
              {t('washer.drawer.jobId', { id: (order?.id ?? activeJob?.id ?? '').slice(0, 6).toUpperCase() })}
            </p>
            <p className="text-[17px] font-extrabold text-ink tracking-[-0.4px] leading-tight">
              {t('washer.drawer.activeJob')}
            </p>
          </div>
          <StatusBadge status={order?.status} t={t} />
          {canCancel && (
            <button
              onClick={() => setCancelConfirmOpen(true)}
              disabled={cancelling}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-danger-500 bg-danger-500/10 border border-danger-500/20 hover:bg-danger-500/20 transition-colors shrink-0"
            >
              {cancelling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
              {cancelling ? t('washer.drawer.cancelling') : t('washer.drawer.cancel.shortLabel')}
            </button>
          )}
        </div>
      ) : (
        /* Job-list header: title + count/loading */
        <div className="px-4 pb-3 shrink-0 flex items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5 min-w-0">
            <p className="text-base font-bold text-ink leading-tight">{drawerTitle}</p>
            {online && !loading && jobs.length > 0 && (
              <p className="text-xs text-ink-muted">
                {t('washer.drawer.jobsNearbyCount', { count: jobs.length })}
              </p>
            )}
            {loading && (
              <p className="text-xs text-ink-muted">{t('washer.drawer.lookingForJobs')}</p>
            )}
          </div>
        </div>
      )}

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
              <Sparkles className="h-9 w-9 text-primary-700" />
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
