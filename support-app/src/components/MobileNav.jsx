import { useState, useEffect } from 'react'
import { Menu, X, Inbox, MessageSquare, CheckSquare, Ticket, ShieldCheck, Flag, Settings, LogOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import useBrandAsset from '../hooks/useBrandAsset.js'
import { supabase } from '../lib/supabase.js'
import Editable from './editable/Editable.jsx'

// Mobile navigation: a compact top bar with a hamburger that opens a slide-out
// side drawer. Replaces the old bottom MobileTabBar — the 8-item bar was cramped
// and scrolled horizontally on phones. Desktop keeps the LeftRail icon sidebar.
// NOTE: "legal" is intentionally absent here — legal-doc publishing is admin-only.

const NAV_ITEMS = [
  { id: 'conv',                Icon: MessageSquare, labelKey: 'nav.conversations' },
  { id: 'unassigned',          Icon: Inbox,         labelKey: 'nav.unassigned' },
  { id: 'approvals',           Icon: CheckSquare,   labelKey: 'nav.approvals' },
  { id: 'tickets',             Icon: Ticket,        labelKey: 'nav.tickets' },
  { id: 'washerVerifications', Icon: ShieldCheck,   labelKey: 'nav.washerVerifications' },
  { id: 'reports',             Icon: Flag,          labelKey: 'nav.reports' },
]

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

function CountBadge({ count }) {
  if (!count) return null
  return (
    <span className="min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center text-[11px] font-bold text-white bg-danger">
      {count > 99 ? '99+' : count}
    </span>
  )
}

export default function MobileNav({
  activeTab,
  onTabChange,
  counts = {},
  profile,
  onSettings,
  onSignOut,
}) {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const logoSrc = useBrandAsset('support_logo', '/wash-logo.png', supabase)

  // Close the drawer on Escape.
  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Slide off the start edge (RTL → right, LTR → left).
  const closedTransform = i18n.dir() === 'rtl' ? 'translateX(100%)' : 'translateX(-100%)'

  const activeItem  = NAV_ITEMS.find(i => i.id === activeTab)
  const title       = activeTab === 'settings'
    ? t('nav.settings')
    : (activeItem ? t(activeItem.labelKey) : t('nav.conversations'))
  const totalPending = Object.values(counts).reduce((a, b) => a + (b || 0), 0)

  const displayName = profile?.agent_display_name || profile?.full_name || ''
  const hue         = nameToHue(displayName)
  const initials    = nameInitials(displayName) || '?'

  function pick(id) {
    setOpen(false)
    onTabChange(id)
  }

  return (
    <>
      {/* Top bar (mobile only) */}
      <Editable id="support.dashboard.mobileNav">
      <header
        className="md:hidden flex items-center gap-3 px-3 border-b border-edge bg-surface-elevated shrink-0"
        style={{ paddingTop: 'max(0.625rem, env(safe-area-inset-top))', paddingBottom: '0.625rem' }}
      >
        <button
          onClick={() => setOpen(true)}
          className="relative shrink-0 p-1.5 -ms-1 rounded-lg text-ink-muted hover:text-ink transition-colors"
          aria-label={t('nav.menu')}
        >
          <Menu size={22} />
          {totalPending > 0 && (
            <span
              className="absolute top-0.5 end-0.5 w-2 h-2 rounded-full bg-danger border border-surface-elevated"
              aria-hidden
            />
          )}
        </button>
        <h1 className="flex-1 min-w-0 text-base font-bold text-ink truncate">{title}</h1>
        <img
          src={logoSrc}
          alt="MULU"
          className="w-8 h-8 rounded-lg object-contain shrink-0"
          onError={e => { e.currentTarget.style.display = 'none' }}
        />
      </header>
      </Editable>

      {/* Drawer overlay (mobile only) */}
      <div
        className={`md:hidden fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`}
        aria-hidden={!open}
      >
        {/* Backdrop */}
        <div
          onClick={() => setOpen(false)}
          className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
        />

        {/* Sliding panel */}
        <nav
          className="absolute inset-y-0 start-0 w-[280px] max-w-[82%] bg-surface-elevated border-e border-edge shadow-2xl flex flex-col transition-transform duration-200 ease-out"
          style={{
            transform: open ? 'translateX(0)' : closedTransform,
            paddingTop: 'env(safe-area-inset-top)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}
          role="dialog"
          aria-modal="true"
          aria-label={t('nav.label')}
        >
          {/* Identity + close */}
          <div className="flex items-center gap-3 px-4 py-4 border-b border-edge">
            <div className="relative shrink-0">
              <div
                className="flex items-center justify-center rounded-full text-white font-bold border-2 border-surface-elevated"
                style={{
                  width: 40, height: 40, fontSize: 14,
                  background: `linear-gradient(135deg, hsl(${hue} 50% 55%), hsl(${(hue + 40) % 360} 50% 35%))`,
                }}
              >
                {initials}
              </div>
              <span
                className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface-elevated"
                style={{ background: 'var(--color-success)' }}
                aria-hidden
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-ink truncate">{displayName || t('role.agent')}</p>
              <p className="text-xs text-ink-subtle truncate">{t('role.agent')}</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="shrink-0 p-1.5 rounded-lg text-ink-muted hover:text-ink transition-colors"
              aria-label={t('common.close')}
            >
              <X size={20} />
            </button>
          </div>

          {/* Primary nav */}
          <div className="flex-1 overflow-y-auto py-2">
            {NAV_ITEMS.map(({ id, Icon, labelKey }) => {
              const isActive = activeTab === id
              const count    = counts[id]
              return (
                <button
                  key={id}
                  onClick={() => pick(id)}
                  aria-current={isActive ? 'page' : undefined}
                  className="w-full flex items-center gap-3 px-4 py-3 text-start transition-colors"
                  style={{
                    background: isActive ? 'var(--color-agent-soft)' : 'transparent',
                    color: isActive ? 'var(--color-agent)' : 'var(--color-ink)',
                  }}
                >
                  <Icon size={20} className="shrink-0" />
                  <span className="flex-1 text-sm font-semibold">{t(labelKey)}</span>
                  <CountBadge count={count} />
                </button>
              )
            })}
          </div>

          {/* Settings + sign out */}
          <div className="border-t border-edge py-2">
            <button
              onClick={() => { setOpen(false); onSettings?.() }}
              aria-current={activeTab === 'settings' ? 'page' : undefined}
              className="w-full flex items-center gap-3 px-4 py-3 text-start transition-colors"
              style={{ color: activeTab === 'settings' ? 'var(--color-agent)' : 'var(--color-ink)' }}
            >
              <Settings size={20} className="shrink-0" />
              <span className="flex-1 text-sm font-semibold">{t('nav.settings')}</span>
            </button>
            {onSignOut && (
              <button
                onClick={() => { setOpen(false); onSignOut() }}
                className="w-full flex items-center gap-3 px-4 py-3 text-start text-danger transition-colors"
              >
                <LogOut size={18} className="shrink-0" />
                <span className="flex-1 text-sm font-semibold">{t('common.signOut')}</span>
              </button>
            )}
          </div>
        </nav>
      </div>
    </>
  )
}
