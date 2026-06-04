import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext.jsx'
import { supabase } from '../../lib/supabase.js'
import MessageActions from './MessageActions.jsx'
import { listMyBlocks, unblockUser } from '../../lib/moderation.js'

const SPRING = { type: 'spring', stiffness: 300, damping: 30 }
const CHAR_LIMIT = 2000
const CHAR_WARNING = 200
const READ_ONLY_STATUSES = new Set(['pending_approval', 'completed', 'cancelled'])

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function ChatBubble({ message, isOwn, senderName, actions }) {
  return (
    <div className={`flex flex-col gap-0.5 ${isOwn ? 'items-end' : 'items-start'}`}>
      {!isOwn && (
        <span className="text-xs font-medium text-ink-muted px-1 mb-0.5">{senderName}</span>
      )}
      <div className={`flex items-center gap-1 ${isOwn ? 'flex-row-reverse' : ''}`}>
        <div className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 ${
          isOwn
            ? 'bg-accent text-white rounded-ee-sm'
            : 'bg-glass border border-glass-border backdrop-blur-sm text-ink rounded-es-sm'
        }`}>
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{message.body}</p>
        </div>
        {actions}
      </div>
      <span className="text-[11px] text-ink-muted/50 px-1">{formatTime(message.created_at)}</span>
    </div>
  )
}

// orderId      — the order being chatted about
// orderStatus  — current order status (controls read-only mode)
// otherPartyName — display name of the other person in the chat
export default function OrderChatSheet({ open, orderId, orderStatus, otherPartyName, onClose }) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [messages, setMessages] = useState([])
  const [loading, setLoading]   = useState(false)
  const [text, setText]         = useState('')
  const [sending, setSending]   = useState(false)
  const [blockedSet, setBlockedSet] = useState(() => new Set())
  const scrollRef  = useRef(null)
  const textareaRef = useRef(null)

  // Load the user's block list when the sheet opens.
  useEffect(() => {
    if (!open || !user) return
    let active = true
    listMyBlocks().then(set => { if (active) setBlockedSet(set) })
    return () => { active = false }
  }, [open, user])

  // 1:1 chat: the counterpart is the first non-own sender. Derived from the
  // unfiltered list so a blocked counterpart is still detectable.
  const counterpartId    = messages.find(m => m.sender_id !== user?.id)?.sender_id ?? null
  const counterpartBlocked = !!counterpartId && blockedSet.has(counterpartId)
  const visibleMessages  = messages.filter(m => !blockedSet.has(m.sender_id))

  async function handleUnblock() {
    if (!counterpartId || !user) return
    const { error } = await unblockUser(user.id, counterpartId)
    if (!error) setBlockedSet(prev => { const n = new Set(prev); n.delete(counterpartId); return n })
  }

  const isReadOnly   = READ_ONLY_STATUSES.has(orderStatus)
  const charsLeft    = CHAR_LIMIT - text.length
  const showWarning  = !isReadOnly && charsLeft < CHAR_WARNING

  // Fetch messages + subscribe to realtime inserts
  useEffect(() => {
    if (!open || !orderId) return
    setLoading(true)

    supabase
      .from('order_messages')
      .select('id, order_id, sender_id, body, created_at, read_at')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setMessages(data ?? [])
        setLoading(false)
        markRead()
      })

    const channel = supabase
      .channel(`order-chat:${orderId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'order_messages', filter: `order_id=eq.${orderId}` },
        (payload) => {
          setMessages(prev => {
            const exists = prev.some(m => m.id === payload.new.id)
            return exists ? prev : [...prev, payload.new]
          })
          if (payload.new.sender_id !== user?.id) markRead()
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [open, orderId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current && messages.length > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  // Auto-grow textarea up to 4 lines
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`
  }, [text])

  async function markRead() {
    if (!orderId || !user) return
    await supabase
      .from('order_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('order_id', orderId)
      .is('read_at', null)
      .neq('sender_id', user.id)
  }

  async function handleSend() {
    const body = text.trim()
    if (!body || sending || isReadOnly || body.length > CHAR_LIMIT) return
    setSending(true)
    const { data, error } = await supabase
      .from('order_messages')
      .insert({ order_id: orderId, sender_id: user.id, body })
      .select('id, order_id, sender_id, body, created_at, read_at')
      .single()
    setSending(false)
    if (!error && data) {
      setMessages(prev => {
        const exists = prev.some(m => m.id === data.id)
        return exists ? prev : [...prev, data]
      })
      setText('')
      textareaRef.current?.focus()
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

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
              <span className="font-semibold text-ink text-sm">{t('chat.title')}</span>
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

              {!loading && visibleMessages.length === 0 && (
                <div className="flex-1 flex items-center justify-center">
                  <p className="text-sm text-ink-muted">{t('chat.emptyState')}</p>
                </div>
              )}

              {visibleMessages.map(msg => {
                const isOwn = msg.sender_id === user?.id
                return (
                  <ChatBubble
                    key={msg.id}
                    message={msg}
                    isOwn={isOwn}
                    senderName={otherPartyName}
                    actions={!isOwn ? (
                      <MessageActions
                        reporterId={user?.id}
                        reportedUserId={msg.sender_id}
                        context="order_chat"
                        orderId={orderId}
                        messageId={msg.id}
                        allowBlock
                        onBlocked={(id) => setBlockedSet(prev => new Set(prev).add(id))}
                      />
                    ) : null}
                  />
                )
              })}
            </div>

            {/* Read-only banner, blocked banner, or composer */}
            {isReadOnly ? (
              <div className="px-4 py-3 border-t border-edge text-center shrink-0">
                <p className="text-xs text-ink-muted">{t('chat.readOnly')}</p>
              </div>
            ) : counterpartBlocked ? (
              <div className="px-4 py-3 border-t border-edge flex items-center justify-between gap-3 shrink-0">
                <p className="text-xs text-ink-muted">{t('moderation.blockedBanner')}</p>
                <button
                  onClick={handleUnblock}
                  className="text-xs font-semibold text-accent shrink-0"
                >
                  {t('moderation.unblock')}
                </button>
              </div>
            ) : (
              <div className="border-t border-edge bg-surface-elevated px-3 py-2 shrink-0">
                {showWarning && (
                  <p className="text-xs text-ink-muted/60 text-end mb-1">
                    {t('chat.charsRemaining', { count: charsLeft })}
                  </p>
                )}
                <div className="flex items-end gap-2">
                  <textarea
                    ref={textareaRef}
                    value={text}
                    onChange={e => setText(e.target.value.slice(0, CHAR_LIMIT))}
                    onKeyDown={handleKeyDown}
                    placeholder={t('chat.placeholder')}
                    rows={1}
                    className="flex-1 resize-none rounded-xl border border-edge bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted/50 outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition"
                    style={{ maxHeight: 96 }}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!text.trim() || sending}
                    className="shrink-0 rounded-xl p-2 bg-accent text-white disabled:opacity-40 transition-opacity"
                    style={{ minHeight: 44, minWidth: 44 }}
                    aria-label={t('chat.send')}
                  >
                    <Send className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
