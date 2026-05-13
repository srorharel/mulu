import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { getAttachmentSignedUrl } from '../lib/support.js'

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function MessageBubble({ message, isOwn, showSeen, seenAt }) {
  const { t } = useTranslation()
  const isAgent  = message.sender_role === 'agent'
  const isSystem = message.sender_role === 'system'
  const [imgUrl, setImgUrl] = useState(null)

  const senderName = isAgent
    ? (message.sender?.agent_display_name || t('chat.agentBadge'))
    : (message.sender?.full_name || '')

  useEffect(() => {
    if (!message.attachment_path) return
    getAttachmentSignedUrl(message.attachment_path).then(url => setImgUrl(url))
  }, [message.attachment_path])

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-ink-muted/60 bg-surface px-3 py-1 rounded-full border border-edge">
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
        </div>
      )}

      <div
        className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isOwn
            ? 'bg-indigo-600 text-white rounded-br-sm'
            : isAgent
              ? 'bg-indigo-600/20 border border-indigo-500/30 text-ink rounded-bl-sm'
              : 'bg-glass border border-glass-border text-ink rounded-bl-sm'
        }`}
      >
        {message.body && (
          <p className="whitespace-pre-wrap break-words">{message.body}</p>
        )}
        {imgUrl && (
          <img
            src={imgUrl}
            alt=""
            className={`rounded-xl max-w-full object-cover ${message.body ? 'mt-2' : ''}`}
            style={{ maxHeight: 220 }}
          />
        )}
      </div>

      <div className={`flex items-center gap-1.5 px-1 mt-0.5 ${isOwn ? 'flex-row-reverse' : ''}`}>
        <span className="text-[11px] text-ink-muted/50">{formatTime(message.created_at)}</span>
        {isOwn && showSeen && seenAt && (
          <span className="text-[11px] text-ink-muted/50">
            {t('chat.seen')} · {formatTime(seenAt)}
          </span>
        )}
      </div>
    </div>
  )
}
