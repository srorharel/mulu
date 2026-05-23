import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Hash } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext.jsx'
import { useSupportConversation } from '../../hooks/useSupportConversation.js'
import { sendMessage, markRead, uploadAttachment } from '../../lib/support.js'
import { supabase } from '../../lib/supabase.js'
import { useToast } from '../ui/Toast.jsx'
import MessageBubble from './MessageBubble.jsx'
import MessageComposer from './MessageComposer.jsx'
import TypingIndicator from './TypingIndicator.jsx'

const SPRING = { type: 'spring', stiffness: 300, damping: 30 }

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
    if (d !== lastDate) {
      groups.push({ type: 'divider', date: d, key: `div-${d}` })
      lastDate = d
    }
    groups.push({ type: 'message', msg, key: msg.id })
  }
  return groups
}

export default function SupportChatSheet({ open, convId, onClose }) {
  const { t } = useTranslation()
  const { user, profile } = useAuth()
  const showToast = useToast()
  const { conversation, messages, loading } = useSupportConversation(open ? convId : null)
  const [typingLabel, setTypingLabel] = useState(null)
  const scrollRef = useRef(null)
  const presenceChannelRef = useRef(null)
  const typingTimerRef = useRef(null)

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current && messages.length > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  // Mark read when sheet opens
  useEffect(() => {
    if (open && convId) {
      markRead(convId).catch(() => {})
    }
  }, [open, convId])

  // Typing presence channel
  useEffect(() => {
    if (!open || !convId || !user) return

    const channel = supabase.channel(`typing:${convId}`, {
      config: { presence: { key: user.id } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const others = Object.entries(state)
          .filter(([key]) => key !== user.id)
          .flatMap(([, arr]) => arr)
          .filter(p => p.typing)

        if (others.length > 0) {
          const name = others[0].name || t('support.agentBadge')
          setTypingLabel(t('support.typing', { name }))
        } else {
          setTypingLabel(null)
        }
      })
      .subscribe()

    presenceChannelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      presenceChannelRef.current = null
      setTypingLabel(null)
    }
  }, [open, convId, user, t])

  function handleTyping(isTyping) {
    presenceChannelRef.current?.track({
      typing: isTyping,
      name: profile?.full_name || '',
    })
    clearTimeout(typingTimerRef.current)
    if (isTyping) {
      typingTimerRef.current = setTimeout(() => {
        presenceChannelRef.current?.track({ typing: false, name: profile?.full_name || '' })
      }, 2000)
    }
  }

  async function handleSend({ body, attachment }) {
    let attachmentPath = null

    if (attachment) {
      const { data, error } = await uploadAttachment(convId, attachment)
      if (error) { showToast(t('support.errors.uploadFailed'), 'error'); return }
      attachmentPath = data.path
    }

    await sendMessage(convId, { body, attachmentPath })
    await markRead(convId).catch(() => {})
  }

  const isClosed = conversation?.status === 'closed'

  const agentName = conversation?.agent?.agent_display_name
    || conversation?.agent?.full_name
    || null

  const headerTitle = agentName || t('support.waitingForAgent')
  const orderRef = conversation?.order_id?.slice(0, 8)

  const items = groupByDate(messages)

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          <motion.div
            key="sheet"
            className="fixed inset-x-0 bottom-0 z-[70] flex flex-col bg-surface-elevated rounded-t-3xl overflow-hidden"
            style={{ height: '90dvh' }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={SPRING}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-2 pb-1 shrink-0">
              <div className="h-1 w-10 rounded-full bg-edge" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-edge shrink-0">
              <div className="flex flex-col">
                <span className="font-semibold text-ink text-sm">{headerTitle}</span>
                {orderRef && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <Hash className="h-3 w-3 text-ink-muted/50" />
                    <span className="text-xs text-ink-muted/60">{orderRef}</span>
                  </div>
                )}
              </div>

              <button
                onClick={onClose}
                className="rounded-full p-2 text-ink-muted hover:bg-surface transition-colors"
                style={{ minHeight: 44, minWidth: 44 }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Message list */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3"
            >
              {loading && (
                <div className="flex-1 flex items-center justify-center">
                  <div className="h-7 w-7 animate-spin rounded-full border-4 border-accent border-t-transparent" />
                </div>
              )}

              {!loading && messages.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center py-8">
                  <p className="text-sm text-ink-muted">{t('support.waitingForAgent')}</p>
                  <p className="text-xs text-ink-muted/50">{t('support.emptyDesc')}</p>
                </div>
              )}

              {items.map(item =>
                item.type === 'divider' ? (
                  <DateDivider key={item.key} date={item.date} />
                ) : (
                  <MessageBubble
                    key={item.key}
                    message={item.msg}
                    isOwn={item.msg.sender_id === user?.id}
                    showSeen={item.msg.sender_id === user?.id && messages[messages.length - 1]?.id === item.msg.id}
                    seenAt={
                      item.msg.sender_role === 'consumer'
                        ? conversation?.agent_last_read_at
                        : conversation?.opener_last_read_at
                    }
                  />
                ),
              )}

              {typingLabel && <TypingIndicator label={typingLabel} />}
            </div>

            {isClosed ? (
              <div className="px-4 py-3 border-t border-edge text-center shrink-0">
                <p className="text-xs text-ink-muted">{t('support.conversationClosed')}</p>
              </div>
            ) : (
              <MessageComposer onSend={handleSend} onTyping={handleTyping} disabled={isClosed} />
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
