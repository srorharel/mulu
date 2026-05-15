import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings, LogOut, CheckCircle, Sparkles } from 'lucide-react'
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

  const load = useCallback(async () => {
    const { data } = await fetchPendingApprovals()
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

// ── Dashboard ──────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { t } = useTranslation()
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  const { conversationId: urlConvId } = useParams()

  const { unassigned, mine, all, loading, reload } = useAgentQueue(profile?.id)
  const [selectedConv, setSelectedConv] = useState(null)
  const [tab, setTab] = useState('conversations') // 'conversations' | 'approvals'
  const [pendingCount, setPendingCount] = useState(0)

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

      {/* Body — switches between conversation panes and approvals */}
      {tab === 'approvals' ? (
        <div className="flex flex-1 overflow-hidden">
          <ApprovalsView />
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
