import { Inbox, MessageSquare, CheckSquare, Ticket, Settings, ShieldCheck, Scale, Flag } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Editable from './editable/Editable.jsx'

const TABS = [
  { id: 'conv',                Icon: MessageSquare, labelKey: 'nav.chat' },
  { id: 'unassigned',          Icon: Inbox,         labelKey: 'nav.queue' },
  { id: 'approvals',           Icon: CheckSquare,   labelKey: 'nav.approvals' },
  { id: 'tickets',             Icon: Ticket,        labelKey: 'nav.tickets' },
  { id: 'washerVerifications', Icon: ShieldCheck,   labelKey: 'nav.verify' },
  { id: 'reports',             Icon: Flag,          labelKey: 'nav.reports' },
  { id: 'legal',               Icon: Scale,         labelKey: 'nav.legal' },
  { id: 'settings',            Icon: Settings,      labelKey: 'nav.settings' },
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
  const { t } = useTranslation()
  return (
    <Editable id="support.dashboard.tabBar">
    <nav
      className="md:hidden flex items-end justify-around overflow-x-auto border-t border-edge bg-surface-elevated shrink-0"
      style={{ paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom))' }}
    >
      {TABS.map(({ id, Icon, labelKey }) => {
        const isActive = activeTab === id
        return (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className="relative flex flex-col items-center gap-0.5 pt-2 pb-1 px-2 min-w-[48px] shrink-0 transition-colors"
            style={{ color: isActive ? 'var(--color-agent)' : 'var(--color-ink-subtle)' }}
          >
            <div className="relative">
              <Icon size={20} />
              <Badge count={counts[id]} />
            </div>
            <span className="text-[10px] font-semibold">{t(labelKey)}</span>
          </button>
        )
      })}
    </nav>
    </Editable>
  )
}
