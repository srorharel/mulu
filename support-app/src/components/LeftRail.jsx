import { Inbox, MessageSquare, CheckSquare, Ticket, Settings, LogOut, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import useBrandAsset from '../../../src/hooks/useBrandAsset.js'
import { supabase } from '../lib/supabase.js'

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
  { id: 'unassigned',          Icon: Inbox,        labelKey: 'nav.unassigned',          inactiveBadge: 'var(--color-warning)' },
  { id: 'conv',                Icon: MessageSquare, labelKey: 'nav.conversations',       inactiveBadge: 'var(--color-danger)'  },
  { id: 'approvals',           Icon: CheckSquare,  labelKey: 'nav.approvals',            inactiveBadge: 'var(--color-danger)'  },
  { id: 'tickets',             Icon: Ticket,       labelKey: 'nav.tickets',              inactiveBadge: 'var(--color-danger)'  },
  { id: 'washerVerifications', Icon: ShieldCheck,  labelKey: 'nav.washerVerifications',  inactiveBadge: 'var(--color-warning)' },
]

function Badge({ count, active, inactiveBadge, t }) {
  if (!count) return null
  return (
    <span
      className="absolute -top-1 -end-1 min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-surface"
      style={{ background: active ? 'var(--color-agent)' : inactiveBadge }}
      aria-label={t('nav.badgeItems', { count })}
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
  washerVerificationCount = 0,
  profile,
  onSettings,
  onSignOut,
}) {
  const { t } = useTranslation()
  const logoSrc = useBrandAsset('support_logo', '/wash-logo.png', supabase)
  const counts = { unassigned: unassignedCount, conv: convCount, approvals: approvalCount, tickets: ticketCount, washerVerifications: washerVerificationCount }
  const displayName = profile?.agent_display_name || profile?.full_name || ''
  const hue = nameToHue(displayName)
  const initials = nameInitials(displayName) || '?'

  return (
    <aside
      className="hidden md:flex flex-col items-center shrink-0 bg-surface border-r border-edge py-3.5"
      style={{ width: 68 }}
      aria-label={t('nav.label')}
    >
      {/* Logo */}
      <div className="mb-5 flex items-center justify-center" style={{ width: 40, height: 40 }}>
        <img
          src={logoSrc}
          alt="Wash"
          className="w-9 h-9 rounded-xl object-contain"
          onError={e => { e.currentTarget.style.display = 'none' }}
        />
      </div>

      {/* Tab buttons */}
      <nav className="flex flex-col gap-1.5 flex-1" aria-label={t('nav.ariaPrimary')}>
        {TABS.map(({ id, Icon, labelKey, inactiveBadge }) => {
          const isActive = activeTab === id
          const count    = counts[id]
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              title={t(labelKey)}
              aria-label={t(labelKey)}
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
              <Badge count={count} active={isActive} inactiveBadge={inactiveBadge} t={t} />
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
          title={t('nav.settings')}
          aria-label={t('nav.settings')}
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
            title={t('common.signOut')}
            aria-label={t('common.signOut')}
            className="flex items-center justify-center rounded-xl transition-colors hover:bg-surface-elevated"
            style={{ width: 36, height: 36, color: 'var(--color-ink-subtle)' }}
          >
            <LogOut size={16} />
          </button>
        )}

        {/* Agent avatar with online dot */}
        <div className="relative" title={displayName || t('role.agent')}>
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
