import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { useLegalAcknowledgment } from '../../hooks/useLegalAcknowledgment.js'
import { useToast } from '../ui/Toast.jsx'
import Markdown from './Markdown.jsx'

// Global acknowledgment gate. Mounted once at the router level (covers consumer
// + washer; renders nothing for agents/super_admins). When the user has one or
// more unacknowledged current documents, it shows them one at a time and records
// each acknowledgment. There is no dismiss — acknowledgment is the only exit, by
// design (this is a compliance gate, not an informational toast).
export default function LegalUpdateModal() {
  const { t, i18n } = useTranslation()
  const showToast = useToast()
  const { pending, acknowledge } = useLegalAcknowledgment()
  const [busy, setBusy] = useState(false)

  if (!pending.length) return null

  const doc = pending[0]
  const dir = (doc.locale === 'he' || i18n.language === 'he') ? 'rtl' : 'ltr'

  async function handleAck() {
    setBusy(true)
    const { error } = await acknowledge(doc.doc_type, doc.version)
    setBusy(false)
    if (error) showToast(error.message, 'error')
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 340, damping: 30 }}
        dir={dir}
        role="dialog"
        aria-modal="true"
        aria-label={doc.title}
        className="w-full max-w-md bg-white dark:bg-surface-elevated rounded-[28px] shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: 'min(90dvh, 720px)' }}
      >
        <div className="px-6 pt-5 pb-3 shrink-0 border-b border-edge">
          <p className="text-[11px] font-semibold text-primary-600 dark:text-accent uppercase tracking-wide">
            {t('legal.modal.badge')}
          </p>
          <p className="text-[18px] font-bold text-ink leading-tight mt-1">{doc.title}</p>
          {pending.length > 1 && (
            <p className="text-xs text-ink-muted mt-1">{t('legal.modal.queue', { count: pending.length })}</p>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-3">
          <Markdown content={doc.content} />
        </div>

        <div className="px-6 pb-6 pt-3 shrink-0 border-t border-edge">
          <button
            onClick={handleAck}
            disabled={busy}
            className="w-full py-3 rounded-xl bg-primary-600 text-white text-sm font-semibold disabled:opacity-50"
          >
            {busy ? '…' : t('legal.modal.acknowledge')}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body
  )
}
