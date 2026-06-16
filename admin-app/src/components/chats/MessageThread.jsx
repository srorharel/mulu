import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Car, Eye, Paperclip, AlertCircle } from 'lucide-react'
import {
  fetchMessages, fetchSenderBrief, subscribeMessages,
  attachmentPublicUrl, roleBadgeClass, partyOf, agentNameOf,
} from '../../lib/adminChats.js'
import { supabase } from '../../lib/supabase.js'

function nameToHue(name = '') {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}
function initialsOf(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
}
function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Insert { type:'divider' } markers between calendar days.
function withDateDividers(messages) {
  const out = []
  let lastDay = null
  for (const m of messages) {
    const day = (m.created_at || '').slice(0, 10)
    if (day !== lastDay) { out.push({ type: 'divider', key: `div-${day}`, day }); lastDay = day }
    out.push({ type: 'message', key: m.id, msg: m })
  }
  return out
}

export default function MessageThread({ conversation, onBack }) {
  const convId = conversation?.id || null
  const [messages, setMessages] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)
  const scrollRef = useRef(null)

  // Fetch history + subscribe to live inserts for the open conversation only.
  useEffect(() => {
    if (!convId) { setMessages([]); setLoading(false); return }
    let cancelled = false
    setLoading(true); setError(null); setMessages([])

    fetchMessages(convId)
      .then(rows => { if (!cancelled) { setMessages(rows); setLoading(false) } })
      .catch(e => { if (!cancelled) { setError(e.message); setLoading(false) } })

    const ch = subscribeMessages(convId, async (payload) => {
      if (cancelled) return
      const sender = await fetchSenderBrief(payload.new.sender_id)
      setMessages(prev => prev.some(m => m.id === payload.new.id)
        ? prev
        : [...prev, { ...payload.new, sender }])
    })

    return () => { cancelled = true; supabase.removeChannel(ch) }
  }, [convId])

  // Stick to the bottom as messages arrive.
  useEffect(() => {
    if (scrollRef.current && messages.length > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  if (!conversation) {
    return (
      <div className="flex-1 hidden lg:flex items-center justify-center text-center px-8">
        <div>
          <Eye size={28} className="mx-auto text-ink-subtle mb-2" />
          <p className="text-sm text-ink-muted">Select a conversation to read its history.</p>
        </div>
      </div>
    )
  }

  const party     = partyOf(conversation)
  const agentName = agentNameOf(conversation)
  const hue       = nameToHue(party.name)
  const items     = withDateDividers(messages)

  return (
    <div className="flex-1 min-w-0 flex flex-col bg-surface">
      {/* Header */}
      <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-3 border-b border-edge bg-surface-elevated shrink-0">
        {onBack && (
          <button
            onClick={onBack}
            aria-label="Back to conversations"
            className="lg:hidden shrink-0 h-10 w-10 -ms-1 flex items-center justify-center rounded-xl text-ink-muted hover:text-ink hover:bg-surface-elevated-2"
          >
            <ArrowLeft size={20} />
          </button>
        )}
        <div
          className="flex items-center justify-center rounded-full text-white font-bold shrink-0"
          style={{ width: 40, height: 40, fontSize: 13, background: `linear-gradient(135deg, hsl(${hue} 50% 55%), hsl(${(hue + 40) % 360} 50% 35%))` }}
        >
          {initialsOf(party.name) || '?'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[15px] font-bold text-ink truncate">{party.name}</span>
            {party.role && (
              <span className={`text-[9.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${roleBadgeClass(party.role)}`}>
                {party.role}
              </span>
            )}
            {conversation.order_id && (
              <span className="flex items-center gap-1 text-[11.5px] text-ink-subtle">
                <Car size={12} /> #{conversation.order_id.slice(0, 8)}
              </span>
            )}
          </div>
          <p className="text-[11.5px] text-ink-subtle mt-0.5 truncate">
            {agentName ? <>Agent: <span className="text-ink-muted font-medium">{agentName}</span></> : 'Unassigned'}
            {' · '}{conversation.status}
          </p>
        </div>
      </div>

      {/* Read-only banner — the core guarantee of this section. */}
      <div className="flex items-center gap-1.5 px-3 sm:px-5 py-1.5 text-[11px] text-admin-deep bg-admin-soft border-b border-admin/20 shrink-0">
        <Eye size={12} className="shrink-0" />
        <span>Read-only view. Replies happen in the Support app.</span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 sm:px-5 py-4 flex flex-col gap-1">
        {loading && (
          <div className="flex items-center justify-center h-20">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-admin border-t-transparent" />
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-xl border border-danger/30 bg-danger/10 text-danger text-xs">
            <AlertCircle size={14} className="shrink-0 mt-0.5" /><span className="font-mono">{error}</span>
          </div>
        )}
        {!loading && !error && messages.length === 0 && (
          <p className="text-center text-ink-subtle text-sm py-12">No messages in this conversation.</p>
        )}

        {items.map(item =>
          item.type === 'divider'
            ? <DateDivider key={item.key} day={item.day} />
            : <MessageRow key={item.key} message={item.msg} />,
        )}
      </div>
    </div>
  )
}

function DateDivider({ day }) {
  return (
    <div className="flex items-center gap-3 my-3">
      <div className="flex-1 h-px bg-edge" />
      <span className="text-[11px] text-ink-subtle font-semibold uppercase tracking-[0.05em]">
        {new Date(day).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
      </span>
      <div className="flex-1 h-px bg-edge" />
    </div>
  )
}

// Agent messages align right on amber; consumer/washer align left on neutral;
// system messages render as a centered pill. Mirrors a normal chat view but is
// purely presentational — there is no compose affordance anywhere.
function MessageRow({ message }) {
  const isAgent  = message.sender_role === 'agent'
  const isSystem = message.sender_role === 'system'
  const senderName = isAgent
    ? (message.sender?.agent_display_name || message.sender?.full_name || 'Agent')
    : (message.sender?.full_name || message.sender_role || '')
  const attachmentUrl = message.attachment_path ? attachmentPublicUrl(message.attachment_path) : null

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-[11px] text-ink-muted bg-surface-elevated border border-edge px-3 py-1 rounded-full">
          {message.body}
        </span>
      </div>
    )
  }

  return (
    <div className={`flex flex-col gap-0.5 mt-1 ${isAgent ? 'items-end' : 'items-start'}`}>
      <div className="flex items-center gap-1.5 px-1">
        <span className="text-[11px] font-medium text-ink-subtle">{senderName}</span>
        {isAgent && <span className="text-[9px] font-bold uppercase tracking-wider text-admin-deep">agent</span>}
      </div>
      <div
        className={`max-w-[80%] text-[13.5px] leading-[1.45] px-3.5 py-2.5 border ${
          isAgent
            ? 'rounded-2xl rounded-ee-sm bg-admin-soft border-admin/30 text-ink'
            : 'rounded-2xl rounded-es-sm bg-surface-elevated border-edge text-ink'
        }`}
      >
        {message.body && <p className="whitespace-pre-wrap break-words">{message.body}</p>}
        {message.attachment_path && (
          attachmentUrl ? (
            <a
              href={attachmentUrl}
              target="_blank"
              rel="noreferrer"
              className={`inline-flex items-center gap-1.5 text-[12.5px] font-medium underline decoration-dotted underline-offset-2 hover:opacity-80 ${message.body ? 'mt-2' : ''} text-admin-deep`}
            >
              <Paperclip size={13} /> Attachment
            </a>
          ) : (
            <span className={`inline-flex items-center gap-1.5 text-[12.5px] text-ink-muted ${message.body ? 'mt-2' : ''}`}>
              <Paperclip size={13} /> Attachment
            </span>
          )
        )}
      </div>
      <span className="text-[11px] text-ink-subtle px-1">{formatTime(message.created_at)}</span>
    </div>
  )
}
