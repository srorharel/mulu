import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings, LogOut, CheckCircle, Sparkles, TicketCheck } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useAgentQueue } from '../hooks/useAgentQueue.js'
import { claimConversation } from '../lib/support.js'
import { fetchPendingApprovals } from '../lib/approvals.js'
import { supabase } from '../lib/supabase.js'
import AgentStatusToggle from '../components/AgentStatusToggle.jsx'
import QueueList from '../components/QueueList.jsx'
import ChatPane from '../components/ChatPane.jsx'
import OrderPanel from '../components/OrderPanel.jsx'
import UserPanel from '../components/UserPanel.jsx'
import ApprovalRow from '../components/ApprovalRow.jsx'

// ── Approvals view ─────────────────────────────────────────────────────────────

function ApprovalsView() {
  const { t } = useTranslation()
  const [orders,  setOrders]  = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)

  const load = useCallback(async () => {
    const { data, error } = await fetchPendingApprovals()
    if (error) {
      console.error('fetchPendingApprovals failed:', error)
      setLoadError(error.message)
    } else {
      setLoadError(null)
    }
    setOrders(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const ch = supabase
      .channel('approvals-view')
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: 'status=eq.pending_approval' },
        load
      )
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  function handleApproved(id) {
    setOrders(prev => prev.filter(o => o.id !== id))
  }

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
    </div>
  )

  if (loadError) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
      <p className="font-semibold text-danger-500">{t('approvals.error.title')}</p>
      <p className="text-xs text-ink-muted font-mono">{loadError}</p>
      <button onClick={load} className="btn-ghost text-sm">{t('approvals.error.retry')}</button>
    </div>
  )

  if (orders.length === 0) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
      <Sparkles className="h-12 w-12 text-accent/40" />
      <p className="font-semibold text-ink">{t('approvals.empty.title')}</p>
      <p className="text-sm text-ink-muted">{t('approvals.empty.subtitle')}</p>
    </div>
  )

  return (
    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
      {orders.map(order => (
        <ApprovalRow key={order.id} order={order} onApproved={handleApproved} />
      ))}
    </div>
  )
}

// ── Tickets view ───────────────────────────────────────────────────────────────

function TicketsView() {
  const { t } = useTranslation()
  const [tickets,  setTickets]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('support_tickets')
      .select(`
        *,
        consumer:consumer_id ( id, full_name, email ),
        washer:washer_id     ( id, full_name )
      `)
      .order('created_at', { ascending: false })
    if (error) console.error('support_tickets fetch failed:', error)
    setTickets(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const ch = supabase
      .channel('tickets-view')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  async function updateStatus(id, status) {
    await supabase
      .from('support_tickets')
      .update({ status, resolved_at: status === 'resolved' ? new Date().toISOString() : null })
      .eq('id', id)
    load()
  }

  const STATUS_COLOR = {
    open:        'bg-danger-50 text-danger-500',
    in_progress: 'bg-warning-50 text-warning-600',
    resolved:    'bg-success-50 text-success-600',
  }

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent" />
    </div>
  )

  if (tickets.length === 0) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
      <TicketCheck className="h-12 w-12 text-accent/40" />
      <p className="font-semibold text-ink">{t('support.tickets.empty')}</p>
    </div>
  )

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Ticket list */}
      <div className="w-80 min-w-60 border-e border-edge overflow-y-auto flex flex-col divide-y divide-edge">
        {tickets.map(ticket => (
          <button
            key={ticket.id}
            onClick={() => setSelected(ticket)}
            className={`text-start p-3 hover:bg-surface-elevated transition-colors ${
              selected?.id === ticket.id ? 'bg-surface-elevated' : ''
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${STATUS_COLOR[ticket.status] ?? ''}`}>
                {t(`support.tickets.status.${ticket.status}`)}
              </span>
              <span className="text-[10px] text-ink-muted">
                {t(`support.tickets.reason.${ticket.reason}`)}
              </span>
            </div>
            <p className="text-xs font-semibold text-ink truncate">
              {ticket.consumer?.full_name ?? ticket.consumer?.email ?? '—'}
            </p>
            {ticket.initial_feedback && (
              <p className="text-[11px] text-ink-muted truncate mt-0.5">
                {ticket.initial_feedback}
              </p>
            )}
            <p className="text-[10px] text-ink-muted/60 mt-1">
              {new Date(ticket.created_at).toLocaleDateString()}
            </p>
          </button>
        ))}
      </div>

      {/* Ticket detail panel */}
      {selected ? (
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-ink">
                {selected.consumer?.full_name ?? selected.consumer?.email ?? '—'}
              </p>
              <p className="text-xs text-ink-muted">
                {t(`support.tickets.reason.${selected.reason}`)} · {new Date(selected.created_at).toLocaleString()}
              </p>
            </div>
            <span className={`text-[10px] px-2 py-1 rounded-full font-semibold shrink-0 ${STATUS_COLOR[selected.status] ?? ''}`}>
              {t(`support.tickets.status.${selected.status}`)}
            </span>
          </div>

          {selected.washer && (
            <div className="text-xs text-ink-muted">
              Washer: <span className="font-semibold text-ink">{selected.washer.full_name}</span>
            </div>
          )}

          {selected.initial_feedback && (
            <div className="rounded-xl bg-surface border border-edge p-3">
              <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-1">Feedback</p>
              <p className="text-sm text-ink whitespace-pre-wrap">{selected.initial_feedback}</p>
            </div>
          )}

          <div className="text-xs text-ink-muted">
            Order ID: <span className="font-mono text-ink">{selected.order_id?.slice(0, 8)}…</span>
          </div>

          {/* Status actions */}
          <div className="flex gap-2 flex-wrap">
            {selected.status !== 'in_progress' && selected.status !== 'resolved' && (
              <button
                onClick={() => { updateStatus(selected.id, 'in_progress'); setSelected(s => ({ ...s, status: 'in_progress' })) }}
                className="px-3 py-1.5 rounded-xl bg-warning-50 text-warning-600 text-xs font-semibold"
              >
                {t('support.tickets.status.in_progress')}
              </button>
            )}
            {selected.status !== 'resolved' && (
              <button
                onClick={() => { updateStatus(selected.id, 'resolved'); setSelected(s => ({ ...s, status: 'resolved' })) }}
                className="px-3 py-1.5 rounded-xl bg-success-50 text-success-600 text-xs font-semibold"
              >
                {t('support.tickets.status.resolved')}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-ink-muted text-sm">
          Select a ticket
        </div>
      )}
    </div>
  )
}

// ── Dashboard ──────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { t } = useTranslation()
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  const { conversationId: urlConvId } = useParams()

  const { unassigned, mine, all, loading, reload } = useAgentQueue(profile?.id)
  const [selectedConv, setSelectedConv] = useState(null)
  const [tab, setTab] = useState('conversations') // 'conversations' | 'approvals' | 'tickets'
  const [pendingCount, setPendingCount] = useState(0)
  const [ticketCount,  setTicketCount]  = useState(0)

  // Count pending approvals for tab badge
  useEffect(() => {
    async function countPending() {
      const { count } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending_approval')
      setPendingCount(count ?? 0)
    }
    countPending()
    const ch = supabase.channel('pending-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, countPending)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  // Count open tickets for tab badge
  useEffect(() => {
    async function countTickets() {
      const { count } = await supabase
        .from('support_tickets')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'open')
      setTicketCount(count ?? 0)
    }
    countTickets()
    const ch = supabase.channel('ticket-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, countTickets)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  // Auto-select conversation from URL on page load / refresh.
  useEffect(() => {
    if (!urlConvId || loading || selectedConv?.id === urlConvId || !all.length) return
    const conv = all.find(c => c.id === urlConvId)
    if (!conv) return
    if (!conv.assigned_agent_id) {
      claimConversation(conv.id).then(() => reload())
    }
    setSelectedConv({ ...conv, assigned_agent_id: conv.assigned_agent_id || profile?.id })
  }, [urlConvId, loading, all]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSelect(conv) {
    if (!conv.assigned_agent_id) {
      await claimConversation(conv.id)
      reload()
    }
    setSelectedConv({ ...conv, assigned_agent_id: conv.assigned_agent_id || profile?.id })
    navigate(`/conversations/${conv.id}`, { replace: true })
  }

  const latestConv = selectedConv
    ? (all.find(c => c.id === selectedConv.id) ?? selectedConv)
    : null

  const showOrderPanel = latestConv?.order_id

  return (
    <div className="flex flex-col h-screen">
      {/* Top bar */}
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-edge bg-surface-elevated shrink-0">
        <div className="flex items-center gap-3">
          <span className="font-bold text-ink text-sm">Wash Support</span>
          <AgentStatusToggle />
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 rounded-xl bg-surface border border-edge p-1">
          <button
            onClick={() => setTab('conversations')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              tab === 'conversations' ? 'bg-accent-muted text-accent' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {t('queue.title')}
            {all.length > 0 && <span className="ms-1 opacity-60">({all.length})</span>}
          </button>
          <button
            onClick={() => setTab('approvals')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              tab === 'approvals' ? 'bg-accent-muted text-accent' : 'text-ink-muted hover:text-ink'
            }`}
          >
            <CheckCircle className="h-3.5 w-3.5" />
            {t('approvals.tabs.title')}
            {pendingCount > 0 && (
              <span className="flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-accent text-white text-[10px] font-bold">
                {pendingCount > 9 ? '9+' : pendingCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('tickets')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              tab === 'tickets' ? 'bg-accent-muted text-accent' : 'text-ink-muted hover:text-ink'
            }`}
          >
            <TicketCheck className="h-3.5 w-3.5" />
            {t('support.tickets.title')}
            {ticketCount > 0 && (
              <span className="flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-danger-500 text-white text-[10px] font-bold">
                {ticketCount > 9 ? '9+' : ticketCount}
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-muted">
            {profile?.agent_display_name || profile?.full_name}
          </span>
          <button onClick={() => navigate('/settings')} className="btn-ghost p-2 rounded-xl" style={{ minHeight: 36, minWidth: 36 }}>
            <Settings className="h-4 w-4" />
          </button>
          <button onClick={signOut} className="btn-ghost p-2 rounded-xl text-danger-500" style={{ minHeight: 36, minWidth: 36 }}>
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Body — switches between conversation panes, approvals, and tickets */}
      {tab === 'approvals' ? (
        <div className="flex flex-1 overflow-hidden">
          <ApprovalsView />
        </div>
      ) : tab === 'tickets' ? (
        <div className="flex flex-1 overflow-hidden">
          <TicketsView />
        </div>
      ) : (
        <div className="flex flex-1 overflow-hidden">
          {/* Left rail: Queue */}
          <QueueList
            unassigned={unassigned}
            mine={mine}
            all={all}
            agentId={profile?.id}
            selectedId={latestConv?.id}
            onSelect={handleSelect}
            loading={loading}
          />

          {/* Center: Chat */}
          <ChatPane
            conversation={latestConv}
            onConvUpdate={reload}
          />

          {/* Right rail: Order or User context */}
          <div className="flex flex-col" style={{ width: 320, minWidth: 260, borderInlineStart: '1px solid var(--color-edge)' }}>
            <div className="px-4 py-2.5 border-b border-edge shrink-0">
              <p className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
                {showOrderPanel ? t('order.title') : t('user.title')}
              </p>
            </div>
            {showOrderPanel ? (
              <OrderPanel orderId={latestConv?.order_id} conversationStatus={latestConv?.status} />
            ) : (
              <UserPanel openerId={latestConv?.opener_id} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
