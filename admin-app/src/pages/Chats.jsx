import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MessagesSquare, Search, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import {
  fetchConversations, subscribeConversations,
  CONVERSATION_STATUSES, conversationStatusClass, roleBadgeClass,
  partyOf, agentNameOf,
} from '../lib/adminChats.js'
import { relativeTime } from '../lib/relativeTime.js'
import PageHeader from '../components/PageHeader.jsx'
import MessageThread from '../components/chats/MessageThread.jsx'

const KIND_FILTERS = ['all', 'consumer', 'washer', 'unassigned']

export default function Chats() {
  const { t } = useTranslation()
  const [rows, setRows]       = useState([])
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState(null)
  const [kind, setKind]       = useState('all')
  const [status, setStatus]   = useState('all')
  const [query, setQuery]     = useState('')
  const [selectedId, setSelectedId] = useState(null)

  async function load() {
    setBusy(true); setError(null)
    try { setRows(await fetchConversations()) }
    catch (e) { setError(e.message) }
    finally   { setBusy(false) }
  }

  useEffect(() => { load() }, [])

  // Live list: reorder / update as conversations change.
  useEffect(() => {
    const ch = subscribeConversations(load)
    return () => { supabase.removeChannel(ch) }
  }, [])

  const filtered = useMemo(() => {
    let r = rows
    if (kind === 'consumer')   r = r.filter(c => (c.opener_role || c.opener?.role) === 'consumer')
    if (kind === 'washer')     r = r.filter(c => (c.opener_role || c.opener?.role) === 'washer')
    if (kind === 'unassigned') r = r.filter(c => !c.assigned_agent_id)
    if (status !== 'all')      r = r.filter(c => c.status === status)
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      r = r.filter(c =>
        (c.opener?.full_name || '').toLowerCase().includes(q) ||
        (c.counterparty?.full_name || '').toLowerCase().includes(q) ||
        (c.opener?.phone || '').toLowerCase().includes(q),
      )
    }
    return r
  }, [rows, kind, status, query])

  const selected = useMemo(
    () => rows.find(c => c.id === selectedId) || null,
    [rows, selectedId],
  )

  return (
    <div className="h-full flex">
      {/* ── List pane (full-width on mobile; fixed rail on desktop) ── */}
      <section className={`${selectedId ? 'hidden lg:flex' : 'flex'} flex-col w-full lg:w-[360px] lg:shrink-0 border-e border-edge min-w-0`}>
        <PageHeader
          dense
          icon={MessagesSquare}
          title={t('dashboard.tabs.chats')}
          right={
            <span className="text-[11px] text-ink-muted tabular-nums">
              {rows.length} total · {filtered.length} shown
            </span>
          }
        >
          {/* Search — full-width on mobile */}
          <div className="flex items-center gap-2 bg-surface rounded-xl border border-edge px-3 mb-2">
            <Search size={14} className="text-ink-subtle" />
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search participant name / phone"
              className="flex-1 bg-transparent outline-none text-sm py-2"
            />
          </div>

          {/* Kind filter — horizontal scroll on mobile */}
          <div className="flex gap-1 overflow-x-auto no-scrollbar bg-surface rounded-xl p-1 border border-edge mb-1.5">
            {KIND_FILTERS.map(k => (
              <FilterPill key={k} active={kind === k} onClick={() => setKind(k)} label={k} />
            ))}
          </div>

          {/* Status filter — horizontal scroll on mobile */}
          <div className="flex gap-1 overflow-x-auto no-scrollbar bg-surface rounded-xl p-1 border border-edge">
            <FilterPill active={status === 'all'} onClick={() => setStatus('all')} label="all status" />
            {CONVERSATION_STATUSES.map(s => (
              <FilterPill key={s} active={status === s} onClick={() => setStatus(s)} label={s} />
            ))}
          </div>

          {error && (
            <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded-xl border border-danger/30 bg-danger/10 text-danger text-xs">
              <AlertCircle size={14} className="shrink-0 mt-0.5" /><span className="font-mono">{error}</span>
            </div>
          )}
        </PageHeader>

        <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5">
          {filtered.map(c => (
            <ConversationRow
              key={c.id}
              conversation={c}
              active={c.id === selectedId}
              onOpen={() => setSelectedId(c.id)}
            />
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-12 text-center text-ink-subtle text-sm">
              {busy ? t('common.loading') : 'No conversations match this filter.'}
            </p>
          )}
        </div>
      </section>

      {/* ── Thread pane (full-screen on mobile when a row is selected) ── */}
      <section className={`${selectedId ? 'flex' : 'hidden lg:flex'} flex-1 min-w-0`}>
        <MessageThread conversation={selected} onBack={() => setSelectedId(null)} />
      </section>
    </div>
  )
}

function FilterPill({ active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap px-2.5 py-1.5 lg:py-1 text-[11px] font-semibold uppercase tracking-wider rounded-lg transition-colors ${
        active ? 'bg-admin-soft text-admin-deep' : 'text-ink-muted hover:text-ink'
      }`}
    >
      {label}
    </button>
  )
}

function ConversationRow({ conversation, active, onOpen }) {
  const party     = partyOf(conversation)
  const agentName = agentNameOf(conversation)
  const preview   = (conversation.last_message_body || '').trim() || 'No messages yet'
  return (
    <button
      onClick={onOpen}
      className={`w-full text-start rounded-xl border p-3 transition-colors ${
        active
          ? 'border-admin/40 bg-admin-soft'
          : 'border-edge bg-surface-elevated hover:bg-surface-elevated-2'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="font-medium text-ink truncate flex-1 text-[13.5px]">{party.name}</span>
        {party.role && (
          <span className={`shrink-0 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider rounded border ${roleBadgeClass(party.role)}`}>
            {party.role}
          </span>
        )}
      </div>
      <p className="text-[12px] text-ink-muted truncate mt-1">{preview}</p>
      <div className="flex items-center gap-2 mt-1.5">
        <span className={`px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider rounded border ${conversationStatusClass(conversation.status)}`}>
          {conversation.status}
        </span>
        <span className="text-[10.5px] text-ink-subtle truncate">
          {agentName ? agentName : 'unassigned'}
        </span>
        <span className="ms-auto shrink-0 text-[10.5px] text-ink-subtle tabular-nums">
          {conversation.last_message_at ? relativeTime(conversation.last_message_at) : ''}
        </span>
      </div>
    </button>
  )
}
