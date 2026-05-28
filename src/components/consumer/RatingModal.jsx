import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Star } from 'lucide-react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useToast } from '../ui/Toast.jsx'

const SLOTS = ['front', 'back', 'driver', 'passenger']

// ── Signed URL loader ─────────────────────────────────────────────────────────
async function fetchSignedUrls(order) {
  const pathOf = {
    front:     order.completion_photo_front,
    back:      order.completion_photo_back,
    driver:    order.completion_photo_driver,
    passenger: order.completion_photo_passenger,
  }
  const pairs = await Promise.all(
    SLOTS.map(async (slot) => {
      const path = pathOf[slot]
      if (!path) return [slot, null]
      const { data } = await supabase.storage
        .from('job-evidence')
        .createSignedUrl(path, 600)
      return [slot, data?.signedUrl ?? null]
    })
  )
  return Object.fromEntries(pairs)
}

// ── Star picker ───────────────────────────────────────────────────────────────
function StarPicker({ value, onChange, disabled }) {
  const [hovered, setHovered] = useState(0)
  return (
    <div className="flex gap-1 justify-center" dir="ltr">
      {[1, 2, 3, 4, 5].map(n => {
        const filled = n <= (hovered || value)
        return (
          <button
            key={n}
            type="button"
            disabled={disabled}
            aria-label={`${n} stars`}
            onClick={() => onChange(n)}
            onMouseEnter={() => setHovered(n)}
            onMouseLeave={() => setHovered(0)}
            className="p-1 disabled:cursor-default"
          >
            <Star
              className={`h-9 w-9 transition-colors ${filled ? 'text-warning-500' : 'text-edge'}`}
              fill={filled ? 'currentColor' : 'none'}
            />
          </button>
        )
      })}
    </div>
  )
}

// ── Photo tile ────────────────────────────────────────────────────────────────
function PhotoTile({ slot, url, loading, onExpand, t }) {
  const [imgError, setImgError] = useState(false)
  const label = t(`rating.photos.slot.${slot}`)

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => url && !imgError && onExpand(url, label)}
        disabled={!url || imgError || loading}
        className="relative w-full overflow-hidden rounded-xl bg-surface border border-edge aspect-square disabled:cursor-default"
        aria-label={url && !imgError ? t('rating.photos.expand') : label}
      >
        {loading ? (
          <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-edge to-surface" />
        ) : url && !imgError ? (
          <img
            src={url}
            alt={label}
            onError={() => setImgError(true)}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center px-2 text-center">
            <span className="text-[10px] text-ink-muted font-medium">{t('rating.photos.loadError')}</span>
          </div>
        )}
      </button>
      <p className="text-[10px] text-ink-muted text-center font-medium">{label}</p>
    </div>
  )
}

// ── Fullscreen photo viewer (portal, z-200, above everything) ─────────────────
function FullscreenPhoto({ url, label, onClose }) {
  const { t } = useTranslation()
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.92)' }}
      onClick={onClose}
    >
      <div className="relative max-w-lg w-full" onClick={e => e.stopPropagation()}>
        <button
          onClick={onClose}
          aria-label={t('common.close')}
          className="absolute -top-10 end-0 text-white/70 hover:text-white p-1"
        >
          <X className="h-6 w-6" />
        </button>
        <img
          src={url}
          alt={label}
          className="w-full rounded-xl object-contain max-h-[80vh]"
        />
        {label && (
          <p className="mt-2 text-center text-white/60 text-sm">{label}</p>
        )}
      </div>
    </div>,
    document.body
  )
}

// ── Backdrop ──────────────────────────────────────────────────────────────────
function Backdrop({ children }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
    >
      {children}
    </div>
  )
}

// ── Modal shell: sticky header + scrollable body + sticky footer ──────────────
function ModalShell({ title, onX, body, footer }) {
  const { t } = useTranslation()
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      transition={{ type: 'spring', stiffness: 340, damping: 30 }}
      className="w-full max-w-sm bg-white dark:bg-surface-elevated rounded-[28px] shadow-2xl flex flex-col overflow-hidden"
      style={{ maxHeight: 'min(90dvh, 680px)' }}
    >
      {/* Sticky header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-3 shrink-0">
        <p className="text-[17px] font-bold text-ink leading-tight">{title}</p>
        <button
          onClick={onX}
          aria-label={t('common.close')}
          className="w-8 h-8 flex items-center justify-center rounded-full text-ink-muted hover:bg-surface ms-3 shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-2">
        {body}
      </div>

      {/* Sticky footer */}
      <div className="px-6 pb-6 pt-3 shrink-0 border-t border-edge">
        {footer}
      </div>
    </motion.div>
  )
}

// ── RatingModal ───────────────────────────────────────────────────────────────
// Props:
//   order       – full order row (needs id + completion_photo_* columns)
//   onDismiss   – X tap: session-only dismiss, no RPC
//   onComplete  – after submit or skip: permanent, re-query won't resurface this order
export default function RatingModal({ order, onDismiss, onComplete }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const showToast = useToast()

  const [stars,          setStars]          = useState(0)
  const [feedback,       setFeedback]       = useState('')
  const [submitting,     setSubmitting]     = useState(false)
  const [submitted,      setSubmitted]      = useState(false)
  const [submittedStars, setSubmittedStars] = useState(0)
  const [skipping,       setSkipping]       = useState(false)
  const [elaborate,      setElaborate]      = useState('')
  const [elaborateSent,  setElaborateSent]  = useState(false)
  const [elaborating,    setElaborating]    = useState(false)

  const [photoUrls,     setPhotoUrls]     = useState({})
  const [photosLoading, setPhotosLoading] = useState(true)
  const [expanded,      setExpanded]      = useState(null) // { url, label }

  useEffect(() => {
    fetchSignedUrls(order)
      .then(setPhotoUrls)
      .catch(() => {/* tiles show error state */})
      .finally(() => setPhotosLoading(false))
  }, [order.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit() {
    if (!stars) return
    setSubmitting(true)
    const { error } = await supabase.rpc('submit_rating', {
      p_order_id: order.id,
      p_stars:    stars,
      p_feedback: feedback,
    })
    setSubmitting(false)
    if (error) { showToast(error.message, 'error'); return }
    setSubmittedStars(stars)
    setSubmitted(true)
  }

  async function handleSkip() {
    setSkipping(true)
    const { error } = await supabase.rpc('skip_rating', { p_order_id: order.id })
    setSkipping(false)
    if (error) { showToast(error.message, 'error'); return }
    onComplete()
  }

  async function handleElaborate() {
    if (!elaborate.trim()) return
    setElaborating(true)
    await supabase.rpc('update_rating_elaboration', {
      p_order_id:       order.id,
      p_extra_feedback: elaborate,
    })
    setElaborating(false)
    setElaborateSent(true)
  }

  // ── Post-submit view ──────────────────────────────────────────────────────
  if (submitted) {
    const needsElaborate = submittedStars >= 2 && submittedStars <= 4

    return (
      <>
        <Backdrop>
          <ModalShell
            title={t('rating.already.submitted', { stars: submittedStars })}
            onX={onComplete}
            body={
              <div className="flex flex-col gap-4 py-2">
                <p className="text-[14px] text-ink text-center leading-snug">
                  {t(`rating.response.${submittedStars}`)}
                </p>

                {submittedStars === 1 && (
                  <button
                    onClick={() => { onComplete(); navigate('/support') }}
                    className="w-full py-2.5 rounded-xl bg-primary-600 text-white text-[13px] font-semibold"
                  >
                    {t('rating.response.1viewTicket')}
                  </button>
                )}

                {needsElaborate && !elaborateSent && (
                  <div className="flex flex-col gap-2">
                    <textarea
                      value={elaborate}
                      onChange={e => setElaborate(e.target.value)}
                      placeholder={t('rating.response.elaborate.placeholder')}
                      rows={3}
                      className="w-full resize-none rounded-xl border border-edge bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary-400"
                    />
                    <button
                      onClick={handleElaborate}
                      disabled={elaborating || !elaborate.trim()}
                      className="self-end px-4 py-1.5 rounded-xl bg-primary-600 text-white text-[13px] font-semibold disabled:opacity-50"
                    >
                      {t('rating.response.elaborate.submit')}
                    </button>
                  </div>
                )}
              </div>
            }
            footer={
              <button
                onClick={onComplete}
                className="w-full py-2.5 rounded-xl border border-edge text-[13px] font-semibold text-ink-muted"
              >
                {t('common.back')}
              </button>
            }
          />
        </Backdrop>
        {expanded && (
          <FullscreenPhoto url={expanded.url} label={expanded.label} onClose={() => setExpanded(null)} />
        )}
      </>
    )
  }

  // ── Rating prompt view ────────────────────────────────────────────────────
  return (
    <>
      <Backdrop>
        <ModalShell
          title={t('rating.prompt.title')}
          onX={onDismiss}
          body={
            <div className="flex flex-col gap-4 py-1">
              {/* Photos section */}
              <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide text-center">
                {t('rating.photos.heading')}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {SLOTS.map(slot => (
                  <PhotoTile
                    key={slot}
                    slot={slot}
                    url={photoUrls[slot] ?? null}
                    loading={photosLoading}
                    onExpand={(url, label) => setExpanded({ url, label })}
                    t={t}
                  />
                ))}
              </div>

              <div className="h-px bg-edge" />

              {/* Stars */}
              <StarPicker value={stars} onChange={setStars} disabled={submitting} />

              {/* Feedback */}
              <textarea
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                placeholder={t('rating.feedback.placeholder')}
                maxLength={1000}
                rows={3}
                className="w-full resize-none rounded-xl border border-edge bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary-400"
              />
            </div>
          }
          footer={
            <div className="flex gap-2">
              <button
                onClick={handleSkip}
                disabled={skipping || submitting}
                className="flex-1 py-2.5 rounded-xl border border-edge text-[13px] font-semibold text-ink-muted disabled:opacity-50"
              >
                {skipping ? '…' : t('rating.skip')}
              </button>
              <button
                onClick={handleSubmit}
                disabled={!stars || submitting}
                className="flex-[2] py-2.5 rounded-xl bg-primary-600 text-white text-[13px] font-semibold disabled:opacity-50"
              >
                {submitting ? '…' : t('rating.submit')}
              </button>
            </div>
          }
        />
      </Backdrop>

      {expanded && (
        <FullscreenPhoto url={expanded.url} label={expanded.label} onClose={() => setExpanded(null)} />
      )}
    </>
  )
}
