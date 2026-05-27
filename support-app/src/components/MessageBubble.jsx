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
        <span className="text-[11px] text-ink-muted bg-surface-elevated border border-edge px-3 py-1 rounded-full flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
          {message.body}
        </span>
      </div>
    )
  }

  return (
    <div className={`flex flex-col gap-0.5 ${isOwn ? 'items-end' : 'items-start'} mt-1`}>
      {!isOwn && (
        <div className="flex items-center gap-1.5 px-1 mb-0.5">
          <span className="text-[11px] font-medium text-ink-subtle">{senderName}</span>
        </div>
      )}

      <div
        className={`max-w-[78%] text-[13.5px] leading-[1.45] px-3.5 py-2.5 ${
          isOwn
            ? 'rounded-2xl rounded-ee-sm text-white'
            : isAgent
              ? 'rounded-2xl rounded-es-sm border border-agent/30 text-ink bg-agent/16'
              : 'rounded-2xl rounded-es-sm border border-edge text-ink bg-surface-elevated'
        }`}
        style={isOwn ? {
          background: `linear-gradient(135deg, var(--color-agent), var(--color-agent-deep))`,
          boxShadow: '0 4px 14px rgba(63,181,143,0.18)',
        } : {}}
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
        <span className="text-[11px] text-ink-subtle">{formatTime(message.created_at)}</span>
        {isOwn && showSeen && seenAt && (
          <span className="text-[11px] text-ink-subtle">
            {t('chat.seen')} · {formatTime(seenAt)}
          </span>
        )}
      </div>
    </div>
  )
}
