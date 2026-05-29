import { useRef, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCheck, RotateCcw, Car, ArrowLeft, Info } from 'lucide-react'
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
import Pill from './Pill.jsx'
import Editable from './editable/Editable.jsx'

function nameToHue(name = '') {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

function nameInitials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
}

function DateDivider({ date }) {
  return (
    <div className="flex items-center gap-3 my-3">
      <div className="flex-1 h-px bg-edge" />
      <span className="text-[11px] text-ink-subtle font-semibold uppercase tracking-[0.05em]">
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

export default function ChatPane({ conversation, onConvUpdate, onOrderChipClick, onBack, onInfoToggle }) {
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
  const [sendError, setSendError] = useState(null)

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

  const isClosed      = conversation.status === 'closed'
  const isResolved    = conversation.status === 'resolved'
  const isAssignedToMe = conversation.assigned_agent_id === profile?.id

  async function handleSend({ body, attachment }) {
    setSendError(null)
    let attachmentPath = null
    if (attachment) {
      const { data, error } = await uploadAttachment(convId, attachment)
      if (error) { setSendError(t('common.error')); return }
      attachmentPath = data.path
    }
    if (!isAssignedToMe && !isClosed) {
      await claimConversation(convId)
    }
    const { error: sendErr } = await sendAgentMessage(convId, { body, attachmentPath, agentId: profile.id })
    if (sendErr) { setSendError(t('common.error')); return }
    await markAgentRead(convId).catch(() => {})
    onConvUpdate?.()
  }

  async function handleResolve() {
    const { error } = await resolveConversation(convId)
    if (error) { setSendError(t('common.error')); return }
    onConvUpdate?.()
  }

  async function handleRelease() {
    const { error } = await releaseConversation(convId)
    if (error) { setSendError(t('common.error')); return }
    onConvUpdate?.()
  }

  const items = groupByDate(messages)

  const openerName  = conversation.opener?.full_name || '—'
  const openerRole  = conversation.opener?.role || conversation.opener_role
  const agentName   = conversation.agent?.agent_display_name || conversation.agent?.full_name || null
  const hue         = nameToHue(openerName)
  const initials    = nameInitials(openerName)

  const roleColor   = openerRole === 'washer' ? '#A78BFA' : openerRole === 'consumer' ? 'var(--color-accent)' : 'var(--color-ink-muted)'

  return (
    <div className="flex-1 flex flex-col min-w-0 border-r border-edge" style={{ background: 'var(--color-surface)' }}>
      {/* Chat header */}
      <Editable id="support.chatPane.header">
      <div className="flex items-center gap-2 md:gap-3.5 px-3 md:px-[22px] py-3 md:py-3.5 border-b border-edge bg-surface-elevated shrink-0">
        {/* Mobile back button */}
        {onBack && (
          <button onClick={onBack} className="md:hidden shrink-0 p-1.5 -ms-1 rounded-lg text-ink-muted hover:text-ink transition-colors" aria-label={t('chat.back')}>
            <ArrowLeft size={20} />
          </button>
        )}
        {/* Avatar */}
        <div
          className="flex items-center justify-center rounded-full text-white font-bold shrink-0"
          style={{
            width: 42, height: 42, fontSize: 14,
            background: `linear-gradient(135deg, hsl(${hue} 50% 55%), hsl(${(hue + 40) % 360} 50% 35%))`,
          }}
        >
          {initials || '?'}
        </div>

        {/* Name + role + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-[15px] font-bold text-ink">{openerName}</span>
            {openerRole && (
              <span
                className="text-[9.5px] font-bold uppercase px-1.5 py-0.5 rounded"
                style={{ color: roleColor, background: `${roleColor}1f`, letterSpacing: '0.04em' }}
              >
                {openerRole === 'consumer' ? t('role.consumer') : openerRole === 'washer' ? t('role.washer') : openerRole}
              </span>
            )}
            {conversation.order_id && (
              <button
                data-testid="order-chip"
                onClick={onOrderChipClick}
                className="flex items-center gap-1 text-[11.5px] text-ink-subtle hover:text-ink transition-colors rounded"
              >
                <Car size={12} />
                {t('chat.orderChip', { id: conversation.order_id.slice(0, 8) })}
              </button>
            )}
          </div>
          <p className="text-[12px] text-ink-subtle mt-0.5">
            {agentName
              ? <span className="text-success font-semibold">{t('chat.claimedBy', { name: agentName })}</span>
              : t('chat.waitingForAgent')
            }
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {!isClosed && isAssignedToMe && (
            <>
              {!isResolved && (
                <button
                  onClick={handleResolve}
                  className="flex items-center gap-1.5 text-[12px] font-bold text-white rounded-lg px-3 py-1.5 transition-colors"
                  style={{
                    background: 'var(--color-agent)',
                    boxShadow: '0 4px 12px rgba(63,181,143,0.3)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-agent-deep)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-agent)' }}
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  {t('chat.resolve')}
                </button>
              )}
              <button
                onClick={handleRelease}
                className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-muted border border-edge rounded-lg px-3 py-1.5 hover:bg-surface-elevated transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t('chat.release')}
              </button>
            </>
          )}
          {onInfoToggle && (
            <button onClick={onInfoToggle} className="md:hidden shrink-0 p-1.5 rounded-lg text-ink-muted hover:text-ink transition-colors" aria-label={t('chat.info')}>
              <Info size={20} />
            </button>
          )}
        </div>
      </div>
      </Editable>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-[22px] py-5 flex flex-col gap-1">
        {loading && (
          <div className="flex items-center justify-center h-20">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-agent border-t-transparent" />
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

      {sendError && (
        <p className="px-4 py-1 text-xs text-danger border-t border-edge shrink-0">{sendError}</p>
      )}

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
