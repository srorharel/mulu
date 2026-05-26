import { Inbox, MessageSquare, CheckSquare, Ticket, Settings, ShieldCheck } from 'lucide-react'

const TABS = [
  { id: 'conv',                Icon: MessageSquare, label: 'Chat' },
  { id: 'unassigned',          Icon: Inbox,         label: 'Queue' },
  { id: 'approvals',           Icon: CheckSquare,   label: 'Approvals' },
  { id: 'tickets',             Icon: Ticket,        label: 'Tickets' },
  { id: 'washerVerifications', Icon: ShieldCheck,   label: 'Verify' },
  { id: 'settings',            Icon: Settings,      label: 'Settings' },
]

function Badge({ count }) {
  if (!count) return null
  return (
    <span className="absolute -top-1 -end-1 min-w-[16px] h-[16px] px-0.5 rounded-full flex items-center justify-center text-[9px] font-bold text-white bg-danger">
      {count > 99 ? '99+' : count}
    </span>
  )
}

export default function MobileTabBar({ activeTab, onTabChange, counts = {} }) {
  return (
    <nav
      className="md:hidden flex items-end justify-around border-t border-edge bg-surface-elevated shrink-0"
      style={{ paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom))' }}
    >
      {TABS.map(({ id, Icon, label }) => {
        const isActive = activeTab === id
        return (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className="relative flex flex-col items-center gap-0.5 pt-2 pb-1 px-2 min-w-[48px] transition-colors"
            style={{ color: isActive ? 'var(--color-agent)' : 'var(--color-ink-subtle)' }}
          >
            <div className="relative">
              <Icon size={20} />
              <Badge count={counts[id]} />
            </div>
            <span className="text-[10px] font-semibold">{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
