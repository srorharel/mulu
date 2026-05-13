import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { getAttachmentSignedUrl } from '../../lib/support.js'
import AttachmentPreview from './AttachmentPreview.jsx'

function formatTime(iso) {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function MessageBubble({ message, isOwn, showSeen, seenAt }) {
  const { t } = useTranslation()
  const isAgent  = message.sender_role === 'agent'
  const isSystem = message.sender_role === 'system'
  const [imgUrl, setImgUrl] = useState(null)

  const senderName = isAgent
    ? (message.sender?.agent_display_name || t('support.agentBadge'))
    : (message.sender?.full_name || '')

  useEffect(() => {
    if (!message.attachment_path) return
    getAttachmentSignedUrl(message.attachment_path).then(url => setImgUrl(url))
  }, [message.attachment_path])

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-ink-muted/60 bg-surface-elevated px-3 py-1 rounded-full">
          {message.body}
        </span>
      </div>
    )
  }

  return (
    <div className={`flex flex-col gap-0.5 ${isOwn ? 'items-end' : 'items-start'}`}>
      {!isOwn && (
        <div className="flex items-center gap-1.5 px-1 mb-0.5">
          <span className="text-xs font-medium text-ink-muted">{senderName}</span>
          {isAgent && (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 dark:text-indigo-300 px-1.5 py-0.5 rounded-full">
              {t('support.agentBadge')}
            </span>
          )}
        </div>
      )}

      <div
        className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 ${
          isOwn
            ? 'bg-accent text-white rounded-br-sm'
            : 'bg-glass border border-glass-border backdrop-blur-sm text-ink rounded-bl-sm'
        }`}
      >
        {message.body && (
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{message.body}</p>
        )}
        {imgUrl && (
          <AttachmentPreview url={imgUrl} className={message.body ? 'mt-2' : ''} />
        )}
      </div>

      <div className={`flex items-center gap-1.5 px-1 mt-0.5 ${isOwn ? 'flex-row-reverse' : ''}`}>
        <span className="text-[11px] text-ink-muted/50">{formatTime(message.created_at)}</span>
        {isOwn && showSeen && seenAt && (
          <span className="text-[11px] text-ink-muted/60">
            {t('support.seen')} · {formatTime(seenAt)}
          </span>
        )}
      </div>
    </div>
  )
}
