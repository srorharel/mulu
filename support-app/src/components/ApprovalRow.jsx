import { useState, useEffect, useMemo, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle, Clock, Play, X, Camera } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { approveOrder, declineOrder, getSignedUrl } from '../lib/approvals.js'
import i18n from '../i18n'
import { useReverseGeocode } from '../lib/geocode.js'
import Pill from './Pill.jsx'
import PhotoLightbox from './PhotoLightbox.jsx'

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
    const rtf = new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' })
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
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center p-4" style={{ zIndex: 99999 }} onClick={onClose}>
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


function VideoThumb({ label, url }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => url && setOpen(true)}
        disabled={!url}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border py-5 transition-colors ${
          url ? 'border-edge hover:border-agent/50 cursor-pointer' : 'border-edge/40 opacity-40 cursor-not-allowed'
        } bg-surface`}
      >
        <Play className={`h-7 w-7 ${url ? 'text-agent' : 'text-ink-muted'}`} />
        <span className="text-xs text-ink-muted font-medium">{label}</span>
      </button>
      {open && url && <VideoModal url={url} onClose={() => setOpen(false)} />}
    </>
  )
}

function PhotoThumb({ label, url, onClick }) {
  return (
    <button
      type="button"
      onClick={() => url && onClick?.()}
      disabled={!url}
      className={`flex flex-col rounded-xl border overflow-hidden transition-colors ${
        url ? 'border-edge hover:border-agent/50 cursor-pointer' : 'border-edge/40 opacity-40 cursor-not-allowed'
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
  )
}

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
  const { t, i18n } = useTranslation()
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
      <p className={`text-[10.5px] font-bold text-ink-muted ${i18n.language === 'en' ? 'uppercase tracking-[0.05em]' : 'font-semibold'}`}>
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
              <span className="h-2.5 w-2.5 rounded-full bg-agent shrink-0" />
              <p className="text-xs text-ink leading-snug">{submittedAddress ?? '—'}</p>
            </div>
            {order.address_label && (
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-accent shrink-0" />
                <p className="text-xs text-ink-muted leading-snug">{order.address_label}</p>
              </div>
            )}
          </div>

          {dist !== null && (
            <p className={`text-xs font-semibold ${dist > SUBMISSION_DISTANCE_WARN_M ? 'text-danger' : 'text-agent'}`}>
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
  const { t, i18n } = useTranslation()

  const isNewShape = Boolean(
    order.completion_photo_front ||
    order.completion_photo_back  ||
    order.completion_photo_driver ||
    order.completion_photo_passenger
  )

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
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [confirming, setConfirming] = useState(null) // 'approve' | 'decline' | null
  const [busy,       setBusy]       = useState(null) // 'approve' | 'decline' | null
  const [declineReason, setDeclineReason] = useState('')
  const [error, setError]           = useState('')

  const allPhotos = useMemo(() => {
    if (!isNewShape) return []
    return [
      ...PHOTO_SLOTS.map(s => ({ key: `arrival_${s}`,    label: `${t('approvals.section.arrival')} — ${t(`approvals.photoSlots.${s}`)}`,    url: photoUrls[`arrival_${s}`] })),
      ...PHOTO_SLOTS.map(s => ({ key: `completion_${s}`, label: `${t('approvals.section.completion')} — ${t(`approvals.photoSlots.${s}`)}`, url: photoUrls[`completion_${s}`] })),
    ].filter(p => p.url)
  }, [isNewShape, photoUrls, t])

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

  async function doApprove(e) {
    e.stopPropagation()
    setBusy('approve')
    setError('')
    const { error: err } = await approveOrder(order.id)
    setBusy(null)
    if (err) { setError(err.message); setConfirming(null); return }
    onApproved(order.id)
  }

  async function doDecline(e) {
    e.stopPropagation()
    if (!declineReason.trim() || declineReason.trim().length < 3) return
    setBusy('decline')
    setError('')
    const { error: err } = await declineOrder(order.id, declineReason.trim())
    setBusy(null)
    if (err) { setError(err.message); return }
    onApproved(order.id)
  }

  const vehicleStr = [order.car_color, order.car_make, order.car_model, order.car_year]
    .filter(Boolean).join(' · ')

  return (
    <div className="border border-edge rounded-2xl bg-surface-elevated p-4 flex flex-col gap-4" style={{ borderRadius: 14 }}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-mono text-[13px] font-bold text-ink">
              {order.id?.slice(0, 8)}…
            </span>
            <Pill color="warning" dot>
              {t('approvals.row.pendingApproval')}
            </Pill>
            <span className="text-[11.5px] text-ink-subtle flex items-center gap-1">
              <Clock size={11} />
              {timeAgo(order.accepted_at ?? order.created_at)}
            </span>
          </div>

          <div className="flex items-center gap-1 text-[12.5px] text-ink-muted">
            <span>{order.consumer_profile?.full_name ?? '—'}</span>
            <span className="text-ink-subtle">→</span>
            <span>{order.washer_profile?.full_name ?? '—'}</span>
          </div>

          {(order.car_plate || vehicleStr) && (
            <div className="flex items-center gap-2 flex-wrap">
              {order.car_plate && (
                <span className="rounded-lg bg-agent/10 border border-agent/20 px-2 py-0.5 text-[12px] font-mono font-bold text-agent tracking-wider">
                  {formatPlate(order.car_plate)}
                </span>
              )}
              {vehicleStr && <span className="text-[12px] text-ink-muted">{vehicleStr}</span>}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
          {confirming === null ? (
            <>
              <button
                type="button"
                onClick={() => setConfirming('decline')}
                disabled={busy !== null}
                className="flex items-center gap-1.5 text-[12px] font-bold px-3 py-2 rounded-xl border border-danger/40 text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
              >
                <X size={13} />
                {t('approvals.actions.reject')}
              </button>
              <button
                type="button"
                onClick={() => setConfirming('approve')}
                disabled={busy !== null}
                className="flex items-center gap-1.5 text-[13px] font-bold px-4 py-2 rounded-xl text-white transition-colors disabled:opacity-50"
                style={{
                  background: 'var(--color-agent)',
                  boxShadow: '0 4px 14px rgba(63,181,143,0.3)',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-agent-deep)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-agent)' }}
              >
                <CheckCircle size={15} />
                {t('approvals.actions.approve')}
              </button>
            </>
          ) : confirming === 'approve' ? (
            <div className="flex flex-col items-end gap-1">
              <p className="text-[12px] font-semibold text-ink">{t('approvals.actions.confirmTitle')}</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirming(null)} className="btn-ghost text-xs px-2 py-1">
                  {t('approvals.actions.confirmNo')}
                </button>
                <button
                  type="button"
                  onClick={doApprove}
                  disabled={busy !== null}
                  className="text-xs font-bold px-3 py-1 rounded-lg text-white disabled:opacity-50"
                  style={{ background: 'var(--color-agent)' }}
                >
                  {busy === 'approve' ? '…' : t('approvals.actions.confirmYes')}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-end gap-1.5 min-w-[200px]">
              <p className="text-[12px] font-semibold text-danger">{t('approvals.actions.declineTitle')}</p>
              <textarea
                value={declineReason}
                onChange={e => setDeclineReason(e.target.value)}
                placeholder={t('approvals.actions.declinePlaceholder')}
                rows={2}
                className="w-full rounded-lg border border-edge bg-surface px-2.5 py-1.5 text-xs text-ink resize-none focus:outline-none focus:border-danger"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => { setConfirming(null); setDeclineReason('') }} className="btn-ghost text-xs px-2 py-1">
                  {t('approvals.actions.confirmNo')}
                </button>
                <button
                  type="button"
                  onClick={doDecline}
                  disabled={busy !== null || !declineReason.trim() || declineReason.trim().length < 3}
                  className="text-xs font-bold px-3 py-1 rounded-lg border border-danger/40 text-danger hover:bg-danger/10 disabled:opacity-40 transition-colors"
                >
                  {busy === 'decline' ? '…' : t('approvals.actions.declineConfirm')}
                </button>
              </div>
            </div>
          )}
          {error && <p className="text-xs text-danger max-w-[160px] text-end">{error}</p>}
        </div>
      </div>

      {/* Decline history banner */}
      {order.decline_count > 0 && (
        <div className={`rounded-xl border px-3.5 py-2.5 flex items-center gap-2.5 ${
          order.decline_count >= 3
            ? 'bg-danger/10 border-danger/30'
            : 'bg-warning-500/10 border-warning-500/30'
        }`}>
          <span className={`text-xs font-bold ${order.decline_count >= 3 ? 'text-danger' : 'text-warning-600'}`}>
            {order.decline_count >= 3
              ? t('approvals.row.escalated', { count: order.decline_count })
              : t('approvals.row.previouslyDeclined', { count: order.decline_count })}
          </span>
        </div>
      )}

      {/* Evidence */}
      {isNewShape ? (
        <>
          <div className="grid grid-cols-2 gap-4">
            {/* Arrival photos */}
            <div className="flex flex-col gap-2">
              <p className={`text-[11.5px] font-bold text-ink-muted ${i18n.language === 'en' ? 'uppercase tracking-[0.05em]' : 'font-semibold'}`}>
                {t('approvals.section.arrival')}
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {PHOTO_SLOTS.map(slot => {
                  const key = `arrival_${slot}`
                  return (
                    <PhotoThumb
                      key={slot}
                      label={t(`approvals.photoSlots.${slot}`)}
                      url={photoUrls[key]}
                      onClick={() => {
                        const idx = allPhotos.findIndex(p => p.key === key)
                        if (idx >= 0) setLightboxIndex(idx)
                      }}
                    />
                  )
                })}
              </div>
            </div>

            {/* Completion photos */}
            <div className="flex flex-col gap-2">
              <p className={`text-[11.5px] font-bold text-agent ${i18n.language === 'en' ? 'uppercase tracking-[0.05em]' : 'font-semibold'}`}>
                {t('approvals.section.completion')}
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {PHOTO_SLOTS.map(slot => {
                  const key = `completion_${slot}`
                  return (
                    <PhotoThumb
                      key={slot}
                      label={t(`approvals.photoSlots.${slot}`)}
                      url={photoUrls[key]}
                      onClick={() => {
                        const idx = allPhotos.findIndex(p => p.key === key)
                        if (idx >= 0) setLightboxIndex(idx)
                      }}
                    />
                  )
                })}
              </div>
            </div>
          </div>

          <PhotoLightbox
            photos={allPhotos}
            index={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
            onNavigate={setLightboxIndex}
          />
        </>
      ) : (
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
