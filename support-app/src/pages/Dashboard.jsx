import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, TicketCheck, ShieldCheck, ArrowLeft, X } from 'lucide-react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useAgentQueue } from '../hooks/useAgentQueue.js'
import { claimConversation } from '../lib/support.js'
import { fetchPendingApprovals } from '../lib/approvals.js'
import { fetchPendingVerifications } from '../lib/washerVerifications.js'
import { supabase } from '../lib/supabase.js'
import LeftRail from '../components/LeftRail.jsx'
import MobileNav from '../components/MobileNav.jsx'
import ReportsView from '../components/ReportsView.jsx'
import QueueList from '../components/QueueList.jsx'
import UnassignedView from '../components/UnassignedView.jsx'
import ChatPane from '../components/ChatPane.jsx'
import OrderPanel from '../components/OrderPanel.jsx'
import UserPanel from '../components/UserPanel.jsx'
import ApprovalRow from '../components/ApprovalRow.jsx'
import WasherVerificationRow from '../components/WasherVerificationRow.jsx'
import Pill from '../components/Pill.jsx'
import Editable from '../components/editable/Editable.jsx'

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
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-agent border-t-transparent" />
    </div>
  )

  if (loadError) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
      <p className="font-semibold text-danger">{t('approvals.error.title')}</p>
      <p className="text-xs text-ink-muted font-mono">{loadError}</p>
      <button onClick={load} className="btn-ghost text-sm">{t('approvals.error.retry')}</button>
    </div>
  )

  if (orders.length === 0) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
      <Sparkles className="h-12 w-12 text-agent/40" />
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

// ── Washer Verifications view ──────────────────────────────────────────────────

function WasherVerificationsView() {
  const { t } = useTranslation()
  const [verifications, setVerifications] = useState([])
  const [loading, setLoading]             = useState(true)
  const [loadError, setLoadError]         = useState(null)

  const load = useCallback(async () => {
    const { data, error } = await fetchPendingVerifications()
    if (error) {
      console.error('fetchPendingVerifications failed:', error)
      setLoadError(true)
    } else {
      setLoadError(null)
    }
    setVerifications(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const ch = supabase
      .channel('washer-verifications-view')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'washer_verifications' }, load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [load])

  function handleReviewed(id) {
    setVerifications(prev => prev.filter(v => v.id !== id))
  }

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-agent border-t-transparent" />
    </div>
  )

  if (loadError) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
      <p className="font-semibold text-danger">{t('washerVerifications.error.title')}</p>
      <button onClick={load} className="btn-ghost text-sm">{t('washerVerifications.error.retry')}</button>
    </div>
  )

  if (verifications.length === 0) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
      <ShieldCheck className="h-12 w-12 text-agent/40" />
      <p className="font-semibold text-ink">{t('washerVerifications.empty.title')}</p>
      <p className="text-sm text-ink-muted">{t('washerVerifications.empty.subtitle')}</p>
    </div>
  )

  return (
    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
      {verifications.map(v => (
        <WasherVerificationRow key={v.id} verification={v} onReviewed={handleReviewed} />
      ))}
    </div>
  )
}

// ── Tickets view ───────────────────────────────────────────────────────────────

const STATUS_PILL = {
  open:        'danger',
  in_progress: 'warning',
  resolved:    'success',
}

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
        consumer:consumer_id ( id, full_name ),
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

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-agent border-t-transparent" />
    </div>
  )

  if (tickets.length === 0) return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
      <TicketCheck className="h-12 w-12 text-agent/40" />
      <p className="font-semibold text-ink">{t('support.tickets.empty')}</p>
    </div>
  )

  // Mobile: if a ticket is selected, show detail full-screen
  if (selected) {
    return (
      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
        {/* Ticket list — hidden on mobile when detail is shown */}
        <div className="hidden md:flex w-80 min-w-60 border-e border-edge overflow-y-auto flex-col divide-y divide-edge bg-surface-elevated">
          {tickets.map(ticket => (
            <TicketListItem key={ticket.id} ticket={ticket} selected={selected} onSelect={setSelected} />
          ))}
        </div>

        {/* Ticket detail */}
        <div className="flex-1 overflow-y-auto p-4 md:p-5 flex flex-col gap-4">
          <button onClick={() => setSelected(null)} className="md:hidden flex items-center gap-1.5 text-sm text-ink-muted mb-1 -ms-1">
            <ArrowLeft size={16} /> {t('tickets.back')}
          </button>
          <TicketDetail ticket={selected} updateStatus={updateStatus} setSelected={setSelected} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
      {/* Ticket list — full-width on mobile */}
      <div className="flex md:w-80 md:min-w-60 border-e border-edge overflow-y-auto flex-col divide-y divide-edge bg-surface-elevated flex-1 md:flex-none">
        {tickets.map(ticket => (
          <TicketListItem key={ticket.id} ticket={ticket} selected={selected} onSelect={setSelected} />
        ))}
      </div>

      {/* Placeholder — desktop only */}
      <div className="hidden md:flex flex-1 items-center justify-center text-ink-muted text-sm">
        {t('tickets.selectTicket')}
      </div>
    </div>
  )
}

function TicketListItem({ ticket, selected, onSelect }) {
  const { t } = useTranslation()
  return (
    <Editable id="support.tickets.row">
    <button
      key={ticket.id}
      onClick={() => onSelect(ticket)}
      className={`text-start p-3 hover:bg-surface-elevated-2 transition-colors ${
        selected?.id === ticket.id ? 'bg-surface-elevated-2' : ''
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <Pill color={STATUS_PILL[ticket.status] ?? 'subtle'}>
          {t(`support.tickets.status.${ticket.status}`)}
        </Pill>
        {ticket.reason === 'low_rating' && (
          <span className="text-[10px] text-warning font-semibold">{t('tickets.autoCreated')}</span>
        )}
      </div>
      <p className="text-xs font-semibold text-ink truncate">
        {ticket.consumer?.full_name ?? '—'}
      </p>
      {ticket.initial_feedback && (
        <p className="text-[11px] text-ink-muted truncate mt-0.5">
          {ticket.initial_feedback}
        </p>
      )}
      <p className="text-[10px] text-ink-subtle mt-1">
        {new Date(ticket.created_at).toLocaleDateString()}
      </p>
    </button>
    </Editable>
  )
}

function TicketDetail({ ticket, updateStatus, setSelected }) {
  const { t, i18n } = useTranslation()
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-ink">
            {ticket.consumer?.full_name ?? '—'}
          </p>
          <p className="text-xs text-ink-muted">
            {t(`support.tickets.reason.${ticket.reason}`)} · {new Date(ticket.created_at).toLocaleString()}
          </p>
        </div>
        <Pill color={STATUS_PILL[ticket.status] ?? 'subtle'}>
          {t(`support.tickets.status.${ticket.status}`)}
        </Pill>
      </div>

      {ticket.washer && (
        <div className="text-xs text-ink-muted">
          {t('tickets.washer')}: <span className="font-semibold text-ink">{ticket.washer.full_name}</span>
        </div>
      )}

      {ticket.initial_feedback && (
        <div className="rounded-xl bg-surface border border-edge p-3">
          <p className={`text-xs font-semibold text-ink-muted ${i18n.language === 'en' ? 'uppercase tracking-wide' : 'font-bold'} mb-1`}>{t('tickets.feedback')}</p>
          <p className="text-sm text-ink whitespace-pre-wrap">{ticket.initial_feedback}</p>
        </div>
      )}

      <div className="text-xs text-ink-muted">
        {t('tickets.orderId')}: <span className="font-mono text-ink">{ticket.order_id?.slice(0, 8)}…</span>
      </div>

      <div className="flex gap-2 flex-wrap">
        {ticket.status !== 'in_progress' && ticket.status !== 'resolved' && (
          <button
            onClick={() => { updateStatus(ticket.id, 'in_progress'); setSelected(s => ({ ...s, status: 'in_progress' })) }}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold border border-warning/40 text-warning hover:bg-warning/10 transition-colors"
          >
            {t('support.tickets.status.in_progress')}
          </button>
        )}
        {ticket.status !== 'resolved' && (
          <button
            onClick={() => { updateStatus(ticket.id, 'resolved'); setSelected(s => ({ ...s, status: 'resolved' })) }}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white transition-colors"
            style={{ background: 'var(--color-agent)' }}
          >
            {t('support.tickets.status.resolved')}
          </button>
        )}
      </div>
    </>
  )
}

// ── Mobile context drawer ─────────────────────────────────────────────────────

function MobileContextDrawer({ children, onClose }) {
  const { t } = useTranslation()
  return (
    <div className="md:hidden fixed inset-0 z-40 flex flex-col bg-surface">
      <div className="flex items-center justify-between px-4 py-3 border-b border-edge shrink-0">
        <span className="text-sm font-semibold text-ink">{t('common.details')}</span>
        <button onClick={onClose} className="p-1.5 rounded-lg text-ink-muted hover:text-ink">
          <X size={20} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}

// ── Dashboard ──────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const { conversationId: urlConvId } = useParams()

  const { conversations, unassigned, mine, others, all, loading, fetchError, reload } = useAgentQueue(profile?.id)
  const [selectedConv, setSelectedConv] = useState(null)
  const [showMobileInfo, setShowMobileInfo] = useState(false)

  // Derive active tab from URL path so /unassigned URL stays in sync
  const isUnassignedPath = location.pathname === '/unassigned'
  const [nonRouteTab, setNonRouteTab] = useState(isUnassignedPath ? 'unassigned' : 'conv')
  const tab = isUnassignedPath ? 'unassigned' : nonRouteTab

  const [pendingCount,       setPendingCount]       = useState(0)
  const [ticketCount,        setTicketCount]        = useState(0)
  const [verificationCount,  setVerificationCount]  = useState(0)
  const [reportCount,        setReportCount]        = useState(0)

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

  // Count pending washer verifications for tab badge
  useEffect(() => {
    async function countVerifications() {
      const { count } = await supabase
        .from('washer_verifications')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending_review')
      setVerificationCount(count ?? 0)
    }
    countVerifications()
    const ch = supabase.channel('washer-verification-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'washer_verifications' }, countVerifications)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  // Count open content reports for the tab badge
  useEffect(() => {
    async function countReports() {
      const { count } = await supabase
        .from('content_reports')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'open')
      setReportCount(count ?? 0)
    }
    countReports()
    const ch = supabase.channel('reports-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'content_reports' }, countReports)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  // Auto-select conversation from URL on page load / refresh.
  useEffect(() => {
    if (!urlConvId || loading || selectedConv?.id === urlConvId || !conversations.length) return
    const conv = conversations.find(c => c.id === urlConvId)
    if (!conv) return
    if (!conv.assigned_agent_id) {
      claimConversation(conv.id).then(() => reload())
    }
    setSelectedConv({ ...conv, assigned_agent_id: conv.assigned_agent_id || profile?.id })
  }, [urlConvId, loading, conversations]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSelect(conv) {
    if (!conv.assigned_agent_id) {
      await claimConversation(conv.id)
      reload()
    }
    setSelectedConv({ ...conv, assigned_agent_id: conv.assigned_agent_id || profile?.id })
    navigate(`/conversations/${conv.id}`, { replace: true })
  }

  async function handleClaim(conv) {
    await claimConversation(conv.id)
    reload()
    navigate(`/conversations/${conv.id}`)
  }

  function handleTabChange(newTab) {
    if (newTab === 'settings') {
      navigate('/settings')
      return
    }
    if (newTab === 'unassigned') {
      navigate('/unassigned', { replace: true })
    } else {
      if (tab === 'unassigned') navigate('/', { replace: true })
      setNonRouteTab(newTab)
    }
  }

  function handleChatBack() {
    setSelectedConv(null)
    navigate('/', { replace: true })
  }

  const latestConv = selectedConv
    ? (conversations.find(c => c.id === selectedConv.id) ?? selectedConv)
    : null

  const showOrderPanel = latestConv?.order_id

  const badgeCounts = {
    unassigned: unassigned.length,
    conv: mine.length + others.length,
    approvals: pendingCount,
    tickets: ticketCount,
    washerVerifications: verificationCount,
    reports: reportCount,
  }

  // On mobile, when a conversation is selected, show chat full-screen
  const mobileShowChat = !!selectedConv && tab === 'conv'

  return (
    <div className="flex flex-col md:flex-row h-screen bg-surface overflow-hidden">
      {/* Desktop sidebar */}
      <LeftRail
        activeTab={tab}
        onTabChange={handleTabChange}
        unassignedCount={unassigned.length}
        convCount={mine.length + others.length}
        approvalCount={pendingCount}
        ticketCount={ticketCount}
        washerVerificationCount={verificationCount}
        reportCount={reportCount}
        profile={profile}
        onSettings={() => navigate('/settings')}
        onSignOut={signOut}
      />

      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Mobile top bar + slide-out menu — hidden under the full-screen chat (which has its own header) */}
        {!mobileShowChat && (
          <MobileNav
            activeTab={tab}
            onTabChange={handleTabChange}
            counts={badgeCounts}
            profile={profile}
            onSettings={() => navigate('/settings')}
            onSignOut={signOut}
          />
        )}

        {tab === 'unassigned' ? (
          <div className="flex flex-1 overflow-hidden">
            <UnassignedView conversations={unassigned} onClaim={handleClaim} />
          </div>
        ) : tab === 'approvals' ? (
          <div className="flex flex-1 overflow-hidden">
            <ApprovalsView />
          </div>
        ) : tab === 'tickets' ? (
          <div className="flex flex-1 overflow-hidden">
            <TicketsView />
          </div>
        ) : tab === 'washerVerifications' ? (
          <div className="flex flex-1 overflow-hidden">
            <WasherVerificationsView />
          </div>
        ) : tab === 'reports' ? (
          <div className="flex flex-1 overflow-hidden">
            <ReportsView />
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            {/* Queue list — hidden on mobile when chat is open */}
            <div className={`${mobileShowChat ? 'hidden md:flex' : 'flex'} flex-1 md:flex-none min-w-0`}>
              <QueueList
                mine={mine}
                others={others}
                agentId={profile?.id}
                selectedId={latestConv?.id}
                onSelect={handleSelect}
                loading={loading}
                fetchError={fetchError}
                onRetry={reload}
              />
            </div>

            {/* Chat — full-screen on mobile, flex on desktop */}
            <div className={`${mobileShowChat ? 'flex' : 'hidden md:flex'} flex-1 min-w-0`}>
              <ChatPane
                conversation={latestConv}
                onConvUpdate={reload}
                onBack={handleChatBack}
                onInfoToggle={() => setShowMobileInfo(true)}
                onOrderChipClick={() => {
                  if (window.innerWidth < 768) {
                    setShowMobileInfo(true)
                  } else {
                    document.getElementById('order-panel-rail')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }
                }}
              />
            </div>

            {/* Right rail — desktop only */}
            <div
              id="order-panel-rail"
              className="hidden md:flex flex-col border-s border-edge bg-surface-elevated overflow-y-auto"
              style={{ width: 360, flexShrink: 0 }}
            >
              {showOrderPanel ? (
                <OrderPanel
                  orderId={latestConv?.order_id}
                  conversationStatus={latestConv?.status}
                  openerRole={latestConv?.opener_role || latestConv?.opener?.role}
                />
              ) : (
                <UserPanel openerId={latestConv?.opener_id} />
              )}
            </div>

            {/* Mobile context drawer */}
            {showMobileInfo && latestConv && (
              <MobileContextDrawer onClose={() => setShowMobileInfo(false)}>
                {showOrderPanel ? (
                  <OrderPanel
                    orderId={latestConv?.order_id}
                    conversationStatus={latestConv?.status}
                    openerRole={latestConv?.opener_role || latestConv?.opener?.role}
                  />
                ) : (
                  <UserPanel openerId={latestConv?.opener_id} />
                )}
              </MobileContextDrawer>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
