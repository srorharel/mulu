import { useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCheck, RotateCcw } from 'lucide-react'
import { useConversationStream } from '../hooks/useConversationStream.js'
import { useTypingPresence } from '../hooks/useTypingPresence.js'
import {
  sendAgentMessage, claimConversation, releaseConversation,
  resolveConversation, markAgentRead, uploadAttachment,
} from '../lib/support.js'
import { useAuth } from '../context/AuthContext.jsx'
import MessageBubble from './MessageBubble.jsx'
import MessageComposer from './MessageComposer.jsx'
import TypingIndicator from './TypingIndicator.jsx'

function DateDivider({ date }) {
  return (
    <div className="flex items-center gap-3 my-3">
      <div className="flex-1 h-px bg-edge" />
      <span className="text-[11px] text-ink-muted/50 font-medium">
        {new Date(date).toLocaleDateString([], { month: 'short', day: 'numeric' })}
      </span>
      <div className="flex-1 h-px bg-edge" />
    </div>
  )
}

function groupByDate(messages) {
  const groups = []
  let lastDate = null
  for (const msg of messages) {
    const d = msg.created_at.slice(0, 10)
    if (d !== lastDate) { groups.push({ type: 'divider', date: d, key: `div-${d}` }); lastDate = d }
    groups.push({ type: 'message', msg, key: msg.id })
  }
  return groups
}

export default function ChatPane({ conversation, onConvUpdate }) {
  const { t } = useTranslation()
  const { profile } = useAuth()
  const convId = conversation?.id || null

  const { messages, loading } = useConversationStream(convId)
  const { typingLabel, trackTyping } = useTypingPresence(
    convId,
    profile?.id,
    profile?.agent_display_name || profile?.full_name,
  )

  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current && messages.length > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  useEffect(() => {
    if (convId) markAgentRead(convId).catch(() => {})
  }, [convId, messages.length])

  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-sm text-ink-muted">{t('chat.empty')}</p>
      </div>
    )
  }

  const isClosed  = conversation.status === 'closed'
  const isResolved = conversation.status === 'resolved'
  const isAssignedToMe = conversation.assigned_agent_id === profile?.id

  async function handleSend({ body, attachment }) {
    let attachmentPath = null
    if (attachment) {
      const { data, error } = await uploadAttachment(convId, attachment)
      if (error) return
      attachmentPath = data.path
    }
    if (!isAssignedToMe && !isClosed) {
      await claimConversation(convId)
    }
    await sendAgentMessage(convId, { body, attachmentPath, agentId: profile.id })
    await markAgentRead(convId).catch(() => {})
    onConvUpdate?.()
  }

  async function handleResolve() {
    await resolveConversation(convId)
    onConvUpdate?.()
  }

  async function handleRelease() {
    await releaseConversation(convId)
    onConvUpdate?.()
  }

  const items = groupByDate(messages)

  const openerName = conversation.opener?.full_name || '—'
  const agentName  = conversation.agent?.agent_display_name || conversation.agent?.full_name || null

  return (
    <div className="flex-1 flex flex-col min-w-0 border-e border-edge">
      {/* Chat header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-edge shrink-0">
        <div>
          <p className="font-semibold text-ink text-sm">{openerName}</p>
          <p className="text-xs text-ink-muted">
            {agentName ? agentName : t('chat.waitingForAgent')}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {!isClosed && isAssignedToMe && (
            <>
              {!isResolved && (
                <button
                  onClick={handleResolve}
                  className="flex items-center gap-1.5 text-xs font-semibold text-accent border border-accent/30 bg-accent-muted rounded-lg px-2.5 py-1.5 hover:bg-accent/20 transition-colors"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  {t('chat.resolve')}
                </button>
              )}
              <button
                onClick={handleRelease}
                className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted border border-edge rounded-lg px-2.5 py-1.5 hover:bg-surface-elevated transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t('chat.release')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
        {loading && (
          <div className="flex items-center justify-center h-20">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-accent border-t-transparent" />
          </div>
        )}

        {items.map(item =>
          item.type === 'divider' ? (
            <DateDivider key={item.key} date={item.date} />
          ) : (
            <MessageBubble
              key={item.key}
              message={item.msg}
              isOwn={item.msg.sender_id === profile?.id}
              showSeen={item.msg.sender_id === profile?.id && messages[messages.length - 1]?.id === item.msg.id}
              seenAt={
                item.msg.sender_role === 'agent'
                  ? conversation.opener_last_read_at
                  : conversation.agent_last_read_at
              }
            />
          )
        )}

        {typingLabel && <TypingIndicator label={typingLabel} />}
      </div>

      {isClosed ? (
        <div className="px-4 py-3 border-t border-edge text-center shrink-0">
          <p className="text-xs text-ink-muted">{t('chat.closed')}</p>
        </div>
      ) : (
        <MessageComposer onSend={handleSend} onTyping={trackTyping} disabled={isClosed} />
      )}
    </div>
  )
}
