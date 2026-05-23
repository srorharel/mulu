import { useState, useEffect, useMemo, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle, Clock, Play, X, User, Camera } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { approveOrder, getSignedUrl } from '../lib/approvals.js'
import { useReverseGeocode } from '../lib/geocode.js'

const MiniMap = lazy(() => import('./MiniMap.jsx'))

const PHOTO_SLOTS = ['front', 'back', 'driver', 'passenger']

function formatPlate(digits) {
  if (!digits) return ''
  if (digits.length === 7) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`
  if (digits.length >= 8) return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`
  return digits
}

function timeAgo(dateStr) {
  if (!dateStr) return '—'
  const seconds = Math.max(1, Math.round((Date.now() - new Date(dateStr)) / 1000))
  try {
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
    if (seconds < 60)    return rtf.format(-seconds, 'second')
    if (seconds < 3600)  return rtf.format(-Math.round(seconds / 60), 'minute')
    if (seconds < 86400) return rtf.format(-Math.round(seconds / 3600), 'hour')
    return rtf.format(-Math.round(seconds / 86400), 'day')
  } catch { return `${Math.round(seconds / 60)}m ago` }
}

function VideoModal({ url, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative max-w-2xl w-full" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -top-9 right-0 text-white/70 hover:text-white" aria-label="Close">
          <X className="h-6 w-6" />
        </button>
        <video src={url} controls autoPlay className="w-full rounded-xl max-h-[70vh] bg-black" />
      </div>
    </div>,
    document.body
  )
}

function ImageModal({ url, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={onClose}>
      <div className="relative max-w-2xl w-full" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute -top-9 right-0 text-white/70 hover:text-white" aria-label="Close">
          <X className="h-6 w-6" />
        </button>
        <img src={url} alt="" className="w-full rounded-xl max-h-[80vh] object-contain bg-black" />
      </div>
    </div>,
    document.body
  )
}

function VideoThumb({ label, url }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => url && setOpen(true)}
        disabled={!url}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border py-5 transition-colors ${
          url ? 'border-edge hover:border-accent/50 cursor-pointer' : 'border-edge/40 opacity-40 cursor-not-allowed'
        } bg-surface`}
      >
        <Play className={`h-7 w-7 ${url ? 'text-accent' : 'text-ink-muted'}`} />
        <span className="text-xs text-ink-muted font-medium">{label}</span>
      </button>
      {open && url && <VideoModal url={url} onClose={() => setOpen(false)} />}
    </>
  )
}

function PhotoThumb({ label, url }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => url && setOpen(true)}
        disabled={!url}
        className={`flex flex-col rounded-xl border overflow-hidden transition-colors ${
          url ? 'border-edge hover:border-accent/50 cursor-pointer' : 'border-edge/40 opacity-40 cursor-not-allowed'
        } bg-surface`}
      >
        {url ? (
          <img src={url} alt="" className="w-full aspect-square object-cover" />
        ) : (
          <div className="w-full aspect-square flex items-center justify-center">
            <Camera className="h-5 w-5 text-ink-muted" />
          </div>
        )}
        <span className="text-[11px] text-ink-muted font-medium text-center py-1.5 px-1 truncate">{label}</span>
      </button>
      {open && url && <ImageModal url={url} onClose={() => setOpen(false)} />}
    </>
  )
}

// UI-only warning threshold — no enforcement.
const SUBMISSION_DISTANCE_WARN_M = 500

function haversineM(lat1, lng1, lat2, lng2) {
  const R  = 6371000
  const φ1 = lat1 * Math.PI / 180
  const φ2 = lat2 * Math.PI / 180
  const Δφ = (lat2 - lat1) * Math.PI / 180
  const Δλ = (lng2 - lng1) * Math.PI / 180
  const a  = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

function LocationCard({ order }) {
  const { t } = useTranslation()
  const hasSubmitted = order.submitted_lat != null && order.submitted_lng != null
  const hasOrderLoc  = order.lat != null && order.lng != null

  const submittedAddress = useReverseGeocode(
    hasSubmitted ? order.submitted_lat : null,
    hasSubmitted ? order.submitted_lng : null,
  )

  const dist = (hasSubmitted && hasOrderLoc)
    ? haversineM(order.submitted_lat, order.submitted_lng, order.lat, order.lng)
    : null

  return (
    <div className="rounded-xl border border-edge bg-surface p-3 flex flex-col gap-2">
      <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
        {t('approvals.location.title')}
      </p>

      {!hasSubmitted ? (
        <p className="text-sm text-ink-muted">{t('approvals.location.notRecorded')}</p>
      ) : (
        <>
          <Suspense fallback={<div className="h-[150px] rounded-lg bg-surface-elevated animate-pulse" />}>
            <MiniMap
              lat={order.submitted_lat}
              lng={order.submitted_lng}
              secondLat={hasOrderLoc ? order.lat : undefined}
              secondLng={hasOrderLoc ? order.lng : undefined}
            />
          </Suspense>

          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500 shrink-0" />
              <p className="text-xs text-ink leading-snug">{submittedAddress ?? '—'}</p>
            </div>
            {order.address_label && (
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-indigo-500 shrink-0" />
                <p className="text-xs text-ink-muted leading-snug">{order.address_label}</p>
              </div>
            )}
          </div>

          {dist !== null && (
            <p className={`text-xs font-semibold ${dist > SUBMISSION_DISTANCE_WARN_M ? 'text-danger-500' : 'text-accent'}`}>
              {t('approvals.location.distance', { distance: dist })}
            </p>
          )}

          <p className="text-xs text-ink-muted">
            {t('approvals.location.submittedAt', { time: timeAgo(order.submitted_location_at) })}
          </p>
        </>
      )}
    </div>
  )
}

export default function ApprovalRow({ order, onApproved }) {
  const { t } = useTranslation()

  // New orders have completion_photo_* populated; legacy orders have evidence_before/after_path.
  const isNewShape = Boolean(
    order.completion_photo_front ||
    order.completion_photo_back  ||
    order.completion_photo_driver ||
    order.completion_photo_passenger
  )

  // Memoize path strings so realtime updates to unrelated fields (status, GPS)
  // don't retrigger signed-URL fetches.
  /* eslint-disable react-hooks/exhaustive-deps */
  const photoPaths = useMemo(() => {
    if (!isNewShape) return null
    return [
      ...PHOTO_SLOTS.map(s => ({ key: `arrival_${s}`,    path: order[`arrival_photo_${s}`]    })),
      ...PHOTO_SLOTS.map(s => ({ key: `completion_${s}`, path: order[`completion_photo_${s}`] })),
    ]
  }, [
    isNewShape,
    order.arrival_photo_front,   order.arrival_photo_back,
    order.arrival_photo_driver,  order.arrival_photo_passenger,
    order.completion_photo_front, order.completion_photo_back,
    order.completion_photo_driver, order.completion_photo_passenger,
  ])
  /* eslint-enable react-hooks/exhaustive-deps */

  const [beforeUrl,  setBeforeUrl]  = useState(null)
  const [afterUrl,   setAfterUrl]   = useState(null)
  const [photoUrls,  setPhotoUrls]  = useState({})
  const [confirming, setConfirming] = useState(false)
  const [approving,  setApproving]  = useState(false)
  const [error, setError]           = useState('')

  useEffect(() => {
    if (isNewShape) {
      Promise.allSettled(
        photoPaths.map(async ({ key, path }) => ({ key, url: await getSignedUrl(path) }))
      ).then(results => {
        const urls = {}
        results.forEach(r => {
          if (r.status === 'fulfilled' && r.value.url) urls[r.value.key] = r.value.url
        })
        setPhotoUrls(urls)
      })
    } else {
      getSignedUrl(order.evidence_before_path).then(setBeforeUrl)
      getSignedUrl(order.evidence_after_path).then(setAfterUrl)
    }
  }, [isNewShape, photoPaths]) // eslint-disable-line react-hooks/exhaustive-deps

  async function doApprove() {
    setApproving(true)
    setError('')
    const { error: err } = await approveOrder(order.id)
    setApproving(false)
    if (err) { setError(err.message); setConfirming(false); return }
    onApproved(order.id)
  }

  const vehicleStr = [order.car_color, order.car_make, order.car_model, order.car_year]
    .filter(Boolean).join(' · ')

  return (
    <div className="border border-edge rounded-2xl bg-surface-elevated p-4 flex flex-col gap-4">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1 min-w-0">
          <p className="text-xs font-mono text-ink-muted">{order.id.slice(0, 8)}…</p>

          <div className="flex items-center gap-1.5 text-sm">
            <User className="h-3.5 w-3.5 text-ink-muted shrink-0" />
            <span className="text-xs text-ink-muted">{t('approvals.row.customer')}:</span>
            <span className="font-medium text-ink truncate">{order.consumer_profile?.full_name ?? '—'}</span>
          </div>

          <div className="flex items-center gap-1.5 text-sm">
            <User className="h-3.5 w-3.5 text-ink-muted shrink-0" />
            <span className="text-xs text-ink-muted">{t('approvals.row.worker')}:</span>
            <span className="font-medium text-ink truncate">{order.washer_profile?.full_name ?? '—'}</span>
          </div>

          <div className="flex items-center gap-1 text-xs text-ink-muted">
            <Clock className="h-3 w-3" />
            <span>{t('approvals.row.submitted', { time: timeAgo(order.accepted_at ?? order.created_at) })}</span>
          </div>
        </div>

        {/* Approve action */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              disabled={approving}
              className="btn-primary text-sm"
            >
              <CheckCircle className="h-4 w-4" />
              {t('approvals.actions.approve')}
            </button>
          ) : (
            <div className="flex flex-col items-end gap-1">
              <p className="text-xs font-semibold text-ink">{t('approvals.actions.confirmTitle')}</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirming(false)} className="btn-ghost text-xs px-2 py-1">{t('approvals.actions.confirmNo')}</button>
                <button onClick={doApprove} disabled={approving} className="btn-primary text-xs px-2 py-1">
                  {approving ? '…' : t('approvals.actions.confirmYes')}
                </button>
              </div>
            </div>
          )}
          {error && <p className="text-xs text-danger-500 max-w-[160px] text-end">{error}</p>}
        </div>
      </div>

      {/* Vehicle */}
      {(order.car_plate || vehicleStr) && (
        <div className="flex items-center gap-2 flex-wrap">
          {order.car_plate && (
            <span className="rounded-lg bg-accent/10 border border-accent/20 px-2 py-0.5 text-sm font-mono font-bold text-accent tracking-wider">
              {formatPlate(order.car_plate)}
            </span>
          )}
          {vehicleStr && <span className="text-sm text-ink">{vehicleStr}</span>}
        </div>
      )}

      {/* Evidence — dual shape */}
      {isNewShape ? (
        <>
          {/* Arrival photos */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
              {t('approvals.section.arrival')}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {PHOTO_SLOTS.map(slot => (
                <PhotoThumb
                  key={slot}
                  label={t(`approvals.photoSlots.${slot}`)}
                  url={photoUrls[`arrival_${slot}`]}
                />
              ))}
            </div>
          </div>

          {/* Completion photos */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
              {t('approvals.section.completion')}
            </p>
            <div className="grid grid-cols-4 gap-2">
              {PHOTO_SLOTS.map(slot => (
                <PhotoThumb
                  key={slot}
                  label={t(`approvals.photoSlots.${slot}`)}
                  url={photoUrls[`completion_${slot}`]}
                />
              ))}
            </div>
          </div>
        </>
      ) : (
        /* Legacy orders: before/after videos */
        <div className="grid grid-cols-2 gap-3">
          <VideoThumb label={t('approvals.row.videoBefore')} url={beforeUrl} />
          <VideoThumb label={t('approvals.row.videoAfter')}  url={afterUrl}  />
        </div>
      )}

      {/* Location card */}
      <LocationCard order={order} />
    </div>
  )
}
