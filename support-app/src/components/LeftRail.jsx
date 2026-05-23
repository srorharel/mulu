import { Inbox, MessageSquare, CheckSquare, Ticket, Settings, LogOut } from 'lucide-react'

function nameToHue(name = '') {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

function nameInitials(name = '') {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('')
}

const TABS = [
  { id: 'unassigned', Icon: Inbox,         label: 'Unassigned',   inactiveBadge: 'var(--color-warning)' },
  { id: 'conv',       Icon: MessageSquare, label: 'Conversations', inactiveBadge: 'var(--color-danger)'  },
  { id: 'approvals',  Icon: CheckSquare,   label: 'Approvals',     inactiveBadge: 'var(--color-danger)'  },
  { id: 'tickets',    Icon: Ticket,        label: 'Tickets',       inactiveBadge: 'var(--color-danger)'  },
]

function Badge({ count, active, inactiveBadge }) {
  if (!count) return null
  return (
    <span
      className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-surface"
      style={{ background: active ? 'var(--color-agent)' : inactiveBadge }}
      aria-label={`${count} items`}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

export default function LeftRail({
  activeTab,
  onTabChange,
  unassignedCount = 0,
  convCount = 0,
  approvalCount = 0,
  ticketCount = 0,
  profile,
  onSettings,
  onSignOut,
}) {
  const counts = { unassigned: unassignedCount, conv: convCount, approvals: approvalCount, tickets: ticketCount }
  const displayName = profile?.agent_display_name || profile?.full_name || ''
  const hue = nameToHue(displayName)
  const initials = nameInitials(displayName) || '?'

  return (
    <aside
      className="flex flex-col items-center shrink-0 bg-surface border-r border-edge py-3.5"
      style={{ width: 68 }}
      aria-label="Navigation"
    >
      {/* Logo */}
      <div className="mb-5 flex items-center justify-center" style={{ width: 40, height: 40 }}>
        <img
          src="/wash-logo.png"
          alt="Wash"
          className="w-9 h-9 rounded-xl object-contain"
          onError={e => { e.currentTarget.style.display = 'none' }}
        />
      </div>

      {/* Tab buttons */}
      <nav className="flex flex-col gap-1.5 flex-1" aria-label="Primary">
        {TABS.map(({ id, Icon, label, inactiveBadge }) => {
          const isActive = activeTab === id
          const count    = counts[id]
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              title={label}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              className="relative flex items-center justify-center rounded-xl transition-colors"
              style={{
                width: 44, height: 44,
                background: isActive ? 'var(--color-agent-soft)' : 'transparent',
                border: isActive
                  ? '1px solid rgba(63,181,143,0.3)'
                  : '1px solid transparent',
                color: isActive ? 'var(--color-agent)' : 'var(--color-ink-subtle)',
              }}
            >
              <Icon size={20} />
              <Badge count={count} active={isActive} inactiveBadge={inactiveBadge} />
              {/* Active indicator strip */}
              {isActive && (
                <span
                  className="absolute rounded-r-sm"
                  style={{
                    left: -8, top: '25%', bottom: '25%',
                    width: 3,
                    background: 'var(--color-agent)',
                  }}
                  aria-hidden
                />
              )}
            </button>
          )
        })}
      </nav>

      {/* Bottom: settings + avatar */}
      <div className="flex flex-col items-center gap-3 mt-auto">
        <button
          onClick={onSettings}
          title="Settings"
          aria-label="Settings"
          className="flex items-center justify-center rounded-xl transition-colors hover:bg-surface-elevated"
          style={{
            width: 36, height: 36,
            color: activeTab === 'settings' ? 'var(--color-agent)' : 'var(--color-ink-subtle)',
          }}
        >
          <Settings size={18} />
        </button>

        {onSignOut && (
          <button
            onClick={onSignOut}
            title="Sign out"
            aria-label="Sign out"
            className="flex items-center justify-center rounded-xl transition-colors hover:bg-surface-elevated"
            style={{ width: 36, height: 36, color: 'var(--color-ink-subtle)' }}
          >
            <LogOut size={16} />
          </button>
        )}

        {/* Agent avatar with online dot */}
        <div className="relative" title={displayName || 'Agent'}>
          <div
            className="flex items-center justify-center rounded-full text-white font-bold shrink-0 border-2 border-surface"
            style={{
              width: 36, height: 36,
              fontSize: 13,
              background: `linear-gradient(135deg, hsl(${hue} 50% 55%), hsl(${(hue + 40) % 360} 50% 35%))`,
            }}
          >
            {initials}
          </div>
          <span
            className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface"
            style={{ background: 'var(--color-success)' }}
            aria-hidden
          />
        </div>
      </div>
    </aside>
  )
}
