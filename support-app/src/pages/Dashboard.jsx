import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { useAgentQueue } from '../hooks/useAgentQueue.js'
import { claimConversation } from '../lib/support.js'
import AgentStatusToggle from '../components/AgentStatusToggle.jsx'
import QueueList from '../components/QueueList.jsx'
import ChatPane from '../components/ChatPane.jsx'
import OrderPanel from '../components/OrderPanel.jsx'
import UserPanel from '../components/UserPanel.jsx'

export default function Dashboard() {
  const { t } = useTranslation()
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  const { unassigned, mine, all, loading, reload } = useAgentQueue(profile?.id)
  const [selectedConv, setSelectedConv] = useState(null)

  async function handleSelect(conv) {
    if (!conv.assigned_agent_id) {
      await claimConversation(conv.id)
      reload()
    }
    setSelectedConv({ ...conv, assigned_agent_id: conv.assigned_agent_id || profile?.id })
  }

  // Sync selected conversation with latest queue data
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

        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-muted">
            {profile?.agent_display_name || profile?.full_name}
          </span>
          <button
            onClick={() => navigate('/settings')}
            className="btn-ghost p-2 rounded-xl"
            style={{ minHeight: 36, minWidth: 36 }}
          >
            <Settings className="h-4 w-4" />
          </button>
          <button
            onClick={signOut}
            className="btn-ghost p-2 rounded-xl text-danger-500"
            style={{ minHeight: 36, minWidth: 36 }}
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Three-pane body */}
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
            <OrderPanel orderId={latestConv?.order_id} />
          ) : (
            <UserPanel openerId={latestConv?.opener_id} />
          )}
        </div>
      </div>
    </div>
  )
}
