import { useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical, Flag, Ban } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../ui/Toast.jsx'
import { reportMessage, blockUser } from '../../lib/moderation.js'

// Per-message moderation menu (report, and optionally block) shown on a
// counterpart's chat bubble. Used by OrderChatSheet (allowBlock) and the support
// chat MessageBubble (report only). Renders nothing for own messages.
export default function MessageActions({
  reporterId,
  reportedUserId,
  context,
  orderId = null,
  messageId = null,
  allowBlock = false,
  onBlocked,
}) {
  const { t } = useTranslation()
  const showToast = useToast()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!reportedUserId || reportedUserId === reporterId) return null

  async function handleReport() {
    setBusy(true)
    const { error } = await reportMessage({
      reporter_id: reporterId,
      reported_user_id: reportedUserId,
      context,
      order_id: orderId,
      message_id: messageId,
      reason: 'reported_from_chat',
    })
    setBusy(false)
    setOpen(false)
    showToast(error ? t('common.error') : t('moderation.reported'), error ? 'error' : 'success')
  }

  async function handleBlock() {
    setBusy(true)
    const { error } = await blockUser(reporterId, reportedUserId)
    setBusy(false)
    setOpen(false)
    if (error) { showToast(t('common.error'), 'error'); return }
    showToast(t('moderation.blocked'), 'success')
    onBlocked?.(reportedUserId)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={t('moderation.actions')}
        className="text-ink-muted/50 hover:text-ink-muted p-1"
      >
        <MoreVertical className="h-3.5 w-3.5" />
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-[140] flex items-end justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-surface-elevated rounded-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <button
              onClick={handleReport}
              disabled={busy}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-start text-sm text-ink hover:bg-surface disabled:opacity-50"
            >
              <Flag className="h-4 w-4 text-danger-500" />
              {t('moderation.report')}
            </button>
            {allowBlock && (
              <button
                onClick={handleBlock}
                disabled={busy}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-start text-sm text-ink hover:bg-surface border-t border-edge disabled:opacity-50"
              >
                <Ban className="h-4 w-4 text-danger-500" />
                {t('moderation.block')}
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="w-full px-4 py-3.5 text-sm text-ink-muted border-t border-edge"
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
