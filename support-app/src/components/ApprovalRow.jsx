import { useState, useEffect, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle, Clock, Play, X, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { approveOrder, getSignedUrl } from '../lib/approvals.js'
import { useReverseGeocode } from '../lib/geocode.js'

const MiniMap = lazy(() => import('./MiniMap.jsx'))

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

function LocationCard({ washer }) {
  const { t } = useTranslation()
  const address = useReverseGeocode(washer?.last_lat, washer?.last_lng)
  const hasLoc  = washer?.last_lat != null && washer?.last_lng != null

  return (
    <div className="rounded-xl border border-edge bg-surface p-3 flex flex-col gap-2">
      <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">{t('approvals.location.title')}</p>
      {hasLoc ? (
        <>
          <Suspense fallback={<div className="h-[150px] rounded-lg bg-surface-elevated animate-pulse" />}>
            <MiniMap lat={washer.last_lat} lng={washer.last_lng} />
          </Suspense>
          {address && <p className="text-xs text-ink leading-snug">{address}</p>}
          <p className="text-xs text-ink-muted">
            {t('approvals.location.lastSeen', { time: timeAgo(washer.last_location_at) })}
          </p>
        </>
      ) : (
        <p className="text-sm text-ink-muted">{t('approvals.location.unavailable')}</p>
      )}
    </div>
  )
}

export default function ApprovalRow({ order, onApproved }) {
  const { t } = useTranslation()

  const [beforeUrl, setBeforeUrl] = useState(null)
  const [afterUrl,  setAfterUrl]  = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [approving,  setApproving]  = useState(false)
  const [error, setError]           = useState('')

  useEffect(() => {
    getSignedUrl(order.evidence_before_path).then(setBeforeUrl)
    getSignedUrl(order.evidence_after_path).then(setAfterUrl)
  }, [order.id]) // eslint-disable-line react-hooks/exhaustive-deps

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
            <span>{t('approvals.row.submitted', { time: timeAgo(order.updated_at ?? order.created_at) })}</span>
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

      {/* Videos */}
      <div className="grid grid-cols-2 gap-3">
        <VideoThumb label={t('approvals.row.videoBefore')} url={beforeUrl} />
        <VideoThumb label={t('approvals.row.videoAfter')}  url={afterUrl}  />
      </div>

      {/* Location card */}
      <LocationCard washer={order.washer_profile} />
    </div>
  )
}
