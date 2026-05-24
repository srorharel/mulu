import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle, X, Clock, User, FileText, Camera } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getVerificationSignedUrl, reviewVerification } from '../lib/washerVerifications.js'
import Pill from './Pill.jsx'

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

function DocThumb({ label, url, icon: Icon = Camera }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => url && setOpen(true)}
        disabled={!url}
        className={`flex flex-col rounded-xl border overflow-hidden transition-colors ${
          url ? 'border-edge hover:border-agent/50 cursor-pointer' : 'border-edge/40 opacity-40 cursor-not-allowed'
        } bg-surface`}
      >
        {url ? (
          <img src={url} alt="" className="w-full aspect-square object-cover" />
        ) : (
          <div className="w-full aspect-square flex items-center justify-center">
            <Icon className="h-5 w-5 text-ink-muted" />
          </div>
        )}
        <span className="text-[11px] text-ink-muted font-medium text-center py-1.5 px-1 truncate">{label}</span>
      </button>
      {open && url && <ImageModal url={url} onClose={() => setOpen(false)} />}
    </>
  )
}

const CITY_LABELS = {
  holon:         'Holon / חולון',
  rishon_lezion: 'Rishon LeZion / ראשון לציון',
  bat_yam:       'Bat Yam / בת ים',
}

export default function WasherVerificationRow({ verification, onReviewed }) {
  const { t } = useTranslation()

  const [urls, setUrls]             = useState({})
  const [rejectMode, setRejectMode] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy]             = useState(false)
  const [error, setError]           = useState('')

  useEffect(() => {
    async function loadUrls() {
      const paths = [
        { key: 'id', path: verification.id_document_path },
        { key: 'selfie', path: verification.selfie_path },
        { key: 'license', path: verification.business_license_path },
      ]
      const results = await Promise.allSettled(
        paths.map(async ({ key, path }) => ({ key, url: await getVerificationSignedUrl(path) }))
      )
      const urlMap = {}
      results.forEach(r => {
        if (r.status === 'fulfilled' && r.value.url) urlMap[r.value.key] = r.value.url
      })
      setUrls(urlMap)
    }
    loadUrls()
  }, [verification.id, verification.id_document_path, verification.selfie_path, verification.business_license_path])

  async function doApprove() {
    setBusy(true); setError('')
    const { error: err } = await reviewVerification(verification.id, 'approved')
    setBusy(false)
    if (err) { setError(err.message); setConfirming(false); return }
    onReviewed(verification.id)
  }

  async function doReject() {
    if (!rejectReason.trim()) return
    setBusy(true); setError('')
    const { error: err } = await reviewVerification(verification.id, 'rejected', rejectReason.trim())
    setBusy(false)
    if (err) { setError(err.message); return }
    onReviewed(verification.id)
  }

  return (
    <div className="border border-edge rounded-2xl bg-surface-elevated p-4 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-ink">
              {verification.washer_name ?? verification.washer_email ?? '—'}
            </span>
            <Pill color="warning" dot>
              {t('washerVerifications.status.pending_review')}
            </Pill>
            <span className="text-[11px] text-ink-subtle flex items-center gap-1">
              <Clock size={11} />
              {timeAgo(verification.submitted_at)}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs text-ink-muted flex-wrap">
            <span className="flex items-center gap-1"><User size={11} />{verification.washer_email ?? '—'}</span>
            <span className="flex items-center gap-1"><FileText size={11} />{t('washerVerifications.dealerNumber')}: {verification.dealer_number}</span>
          </div>

          {(verification.service_areas ?? []).length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {verification.service_areas.map(area => (
                <span key={area} className="text-[11px] px-2 py-0.5 rounded-full bg-agent/10 text-agent border border-agent/20 font-medium">
                  {CITY_LABELS[area] ?? area}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Action area */}
        {!confirming && !rejectMode && (
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setRejectMode(true)}
              className="flex items-center gap-1.5 text-[12px] font-bold px-3 py-2 rounded-xl border border-danger/40 text-danger hover:bg-danger/10 transition-colors"
            >
              <X size={13} />
              {t('washerVerifications.actions.reject')}
            </button>
            <button
              onClick={() => setConfirming(true)}
              disabled={busy}
              className="flex items-center gap-1.5 text-[13px] font-bold px-4 py-2 rounded-xl text-white transition-colors"
              style={{ background: 'var(--color-agent)', boxShadow: '0 4px 14px rgba(63,181,143,0.3)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-agent-deep)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-agent)' }}
            >
              <CheckCircle size={15} />
              {t('washerVerifications.actions.approve')}
            </button>
          </div>
        )}

        {confirming && (
          <div className="flex flex-col items-end gap-1 shrink-0">
            <p className="text-[12px] font-semibold text-ink">{t('washerVerifications.actions.confirmApprove')}</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirming(false)} className="btn-ghost text-xs px-2 py-1">
                {t('washerVerifications.actions.no')}
              </button>
              <button
                onClick={doApprove}
                disabled={busy}
                className="text-xs font-bold px-3 py-1 rounded-lg text-white disabled:opacity-50"
                style={{ background: 'var(--color-agent)' }}
              >
                {busy ? '…' : t('washerVerifications.actions.yes')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Reject form */}
      {rejectMode && (
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold text-ink-muted">{t('washerVerifications.rejectReason')}</label>
          <textarea
            value={rejectReason}
            onChange={e => setRejectReason(e.target.value)}
            placeholder={t('washerVerifications.rejectReasonPlaceholder')}
            rows={2}
            className="w-full rounded-xl border border-edge bg-surface px-3 py-2 text-sm text-ink resize-none focus:outline-none focus:border-agent"
          />
          <div className="flex gap-2">
            <button onClick={() => { setRejectMode(false); setRejectReason('') }} className="btn-ghost text-xs px-3 py-1.5">
              {t('washerVerifications.actions.cancel')}
            </button>
            <button
              onClick={doReject}
              disabled={busy || !rejectReason.trim()}
              className="text-xs font-bold px-3 py-1.5 rounded-xl border border-danger/40 text-danger hover:bg-danger/10 disabled:opacity-40 transition-colors"
            >
              {busy ? '…' : t('washerVerifications.actions.confirmReject')}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}

      {/* Documents */}
      <div className="grid grid-cols-3 gap-3">
        {/* ID */}
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-bold text-ink-muted uppercase tracking-wide">{t('washerVerifications.idDoc')}</p>
          <div className="grid grid-cols-1 gap-1">
            <DocThumb label="ID" url={urls.id} icon={User} />
          </div>
        </div>

        {/* Selfie */}
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-bold text-ink-muted uppercase tracking-wide">{t('washerVerifications.selfie')}</p>
          <div className="grid grid-cols-1 gap-1">
            <DocThumb label={t('washerVerifications.selfieDoc')} url={urls.selfie} icon={Camera} />
          </div>
        </div>

        {/* Business license */}
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-bold text-agent uppercase tracking-wide">{t('washerVerifications.license')}</p>
          <div className="grid grid-cols-1 gap-1">
            <DocThumb label={t('washerVerifications.licenseDoc')} url={urls.license} icon={FileText} />
          </div>
        </div>
      </div>
    </div>
  )
}
