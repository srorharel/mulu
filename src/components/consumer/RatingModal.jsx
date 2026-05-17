import { useState } from 'react'
import { X, Star } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase.js'
import { useToast } from '../ui/Toast.jsx'

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

// ── RatingModal ───────────────────────────────────────────────────────────────
// Props:
//   order        – the order object (needs id, washer_id)
//   onDismiss    – called when X is tapped (session-only dismiss, no RPC)
//   onComplete   – called after submit or skip (permanent, modal won't reappear)
export default function RatingModal({ order, onDismiss, onComplete }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const showToast = useToast()

  const [stars,         setStars]         = useState(0)
  const [feedback,      setFeedback]      = useState('')
  const [submitting,    setSubmitting]    = useState(false)
  const [submitted,     setSubmitted]     = useState(false)
  const [submittedStars, setSubmittedStars] = useState(0)
  const [skipping,      setSkipping]      = useState(false)
  const [elaborate,     setElaborate]     = useState('')
  const [elaborateSent, setElaborateSent] = useState(false)
  const [elaborating,   setElaborating]   = useState(false)

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

  // ── Submitted state ───────────────────────────────────────────────────────
  if (submitted) {
    const needsElaborate = submittedStars >= 2 && submittedStars <= 4
    return (
      <ModalShell onX={onComplete}>
        <p className="text-[13px] font-semibold text-ink-muted text-center">
          {t('rating.already.submitted', { stars: submittedStars })}
        </p>

        <p className="text-[14px] text-ink text-center leading-snug">
          {t(`rating.response.${submittedStars}`)}
        </p>

        {submittedStars === 1 && (
          <button
            onClick={() => { onComplete(); navigate('/support') }}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary-600 text-white text-[13px] font-semibold"
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
              rows={2}
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

        <button
          onClick={onComplete}
          className="w-full py-2.5 rounded-xl border border-edge text-[13px] font-semibold text-ink-muted"
        >
          {t('common.back')}
        </button>
      </ModalShell>
    )
  }

  // ── Rating prompt ─────────────────────────────────────────────────────────
  return (
    <ModalShell onX={onDismiss}>
      <div className="text-center">
        <p className="text-[17px] font-bold text-ink">{t('rating.prompt.title')}</p>
        <p className="text-[12px] text-ink-muted mt-1">{t('rating.prompt.subtitle')}</p>
      </div>

      <StarPicker value={stars} onChange={setStars} disabled={submitting} />

      <textarea
        value={feedback}
        onChange={e => setFeedback(e.target.value)}
        placeholder={t('rating.feedback.placeholder')}
        maxLength={1000}
        rows={3}
        className="w-full resize-none rounded-xl border border-edge bg-surface px-3 py-2 text-[13px] text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary-400"
      />

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
    </ModalShell>
  )
}

// ── Backdrop + card shell ─────────────────────────────────────────────────────
function ModalShell({ children, onX }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ type: 'spring', stiffness: 340, damping: 30 }}
        className="w-full max-w-sm bg-white rounded-[28px] shadow-2xl p-6 flex flex-col gap-4 relative"
      >
        <button
          onClick={onX}
          aria-label="Close"
          className="absolute top-4 end-4 w-8 h-8 flex items-center justify-center rounded-full text-ink-muted hover:bg-surface"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </motion.div>
    </div>
  )
}
