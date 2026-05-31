import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FileText, Image, Megaphone, SlidersHorizontal, LogOut, Download, ClipboardList, Users as UsersIcon, Palette, Menu, History as HistoryIcon, MessagesSquare, Settings as SettingsIcon } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase.js'
import AdminBackground from '../components/AdminBackground.jsx'
import Content from './Content.jsx'
import Branding from './Branding.jsx'
import Broadcasts from './Broadcasts.jsx'
import Config from './Config.jsx'
import Jobs from './Jobs.jsx'
import Users from './Users.jsx'
import Chats from './Chats.jsx'
import DesignEditor from './DesignEditor.jsx'
import History from './History.jsx'
import Settings from './Settings.jsx'

const TABS = [
  { id: 'jobs',       icon: ClipboardList,      page: Jobs       },
  { id: 'users',      icon: UsersIcon,          page: Users      },
  { id: 'chats',      icon: MessagesSquare,     page: Chats      },
  { id: 'content',    icon: FileText,           page: Content    },
  { id: 'branding',   icon: Image,              page: Branding   },
  { id: 'broadcasts', icon: Megaphone,          page: Broadcasts },
  { id: 'design',     icon: Palette,            page: DesignEditor },
  { id: 'config',     icon: SlidersHorizontal,  page: Config     },
  { id: 'history',    icon: HistoryIcon,        page: History    },
  { id: 'appearance', icon: SettingsIcon,       page: Settings   },
]

// Export every row of every config-shaped table as one JSON file. Lives on
// the Dashboard so it's reachable from any tab, matching the user spec.
export async function buildBrandingConfigExport(client) {
  const [b, c, p, pt] = await Promise.all([
    client.from('app_branding').select('*'),
    client.from('app_config').select('*'),
    client.from('pricing_config').select('*'),
    client.from('payout_tier_config').select('*'),
  ])
  return {
    exported_at: new Date().toISOString(),
    app_branding:       b.data ?? [],
    app_config:         c.data ?? [],
    pricing_config:     p.data ?? [],
    payout_tier_config: pt.data ?? [],
  }
}

// Shared rail body. Rendered twice: once in the persistent desktop aside
// (lg+), once inside the mobile slide-in drawer. `onNavigate` lets the drawer
// close itself after a tab is picked; the desktop rail passes a no-op.
function Rail({ activeId, onNavigate, profile, i18n, t, toggleLocale, onExport, exporting, exportError, signOut }) {
  const navigate = useNavigate()
  function go(id) {
    navigate(`/${id}`, { replace: true })
    onNavigate?.()
  }
  return (
    <>
      <div className="px-5 py-4 border-b border-edge">
        <div className="flex items-center justify-between">
          <span className="text-[14px] font-extrabold tracking-[-0.3px]">
            MULU<span className="text-admin-deep">/admin</span>
          </span>
          <button
            onClick={toggleLocale}
            className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-subtle hover:text-ink px-2 py-1 -me-1"
          >
            {i18n.language === 'he' ? 'EN' : 'HE'}
          </button>
        </div>
        <p className="text-[10.5px] text-ink-subtle mt-1 truncate">
          {profile?.full_name ?? '—'}
        </p>
      </div>

      <nav className="flex-1 overflow-y-auto py-3">
        {TABS.map(({ id, icon: Icon }) => {
          const isActive = activeId === id
          return (
            <button
              key={id}
              onClick={() => go(id)}
              className={`w-full flex items-center gap-3 px-5 py-3 lg:py-2.5 text-[13.5px] transition-colors ${
                isActive
                  ? 'bg-admin-soft text-admin-deep font-semibold border-s-2 border-admin'
                  : 'text-ink-muted hover:bg-surface-elevated-2 hover:text-ink'
              }`}
            >
              <Icon size={16} strokeWidth={isActive ? 2.5 : 2} />
              <span>{t(`dashboard.tabs.${id}`)}</span>
            </button>
          )
        })}
      </nav>

      <div className="border-t border-edge p-3 flex flex-col gap-1">
        <button
          onClick={onExport}
          disabled={exporting}
          className="w-full flex items-center gap-2 px-3 py-2.5 lg:py-2 text-[12.5px] text-ink-muted hover:text-ink hover:bg-surface-elevated-2 rounded-xl transition-colors disabled:opacity-50"
          title="Export app_branding + app_config + pricing_config + payout_tier_config as one JSON file"
        >
          <Download size={14} />
          <span>{exporting ? 'Exporting…' : 'Export branding + config'}</span>
        </button>
        {exportError && (
          <p className="text-[10.5px] text-danger font-mono px-3 truncate" title={exportError}>{exportError}</p>
        )}
        <button
          onClick={signOut}
          className="w-full flex items-center gap-2 px-3 py-2.5 lg:py-2 text-[13px] text-ink-muted hover:text-danger hover:bg-danger/10 rounded-xl transition-colors"
        >
          <LogOut size={14} />
          <span>{t('common.signOut')}</span>
        </button>
      </div>
    </>
  )
}

export default function Dashboard() {
  const { t, i18n } = useTranslation()
  const { profile, signOut } = useAuth()
  const { tab: urlTab } = useParams()
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const activeId = TABS.find(x => x.id === urlTab) ? urlTab : 'jobs'
  const ActivePage = TABS.find(x => x.id === activeId).page

  // Close the drawer with Escape (mirrors the ConfirmDialog backdrop pattern).
  useEffect(() => {
    if (!drawerOpen) return
    function onKey(e) { if (e.key === 'Escape') setDrawerOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawerOpen])

  function toggleLocale() {
    const next = i18n.language === 'he' ? 'en' : 'he'
    i18n.changeLanguage(next)
  }

  async function handleExportBrandingConfig() {
    setExporting(true); setExportError(null)
    try {
      const payload = await buildBrandingConfigExport(supabase)
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `branding_config_${ts}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setExportError(e.message)
    } finally {
      setExporting(false)
    }
  }

  const railProps = {
    activeId, profile, i18n, t, toggleLocale,
    onExport: handleExportBrandingConfig, exporting, exportError, signOut,
  }

  return (
    <div className="relative flex h-screen overflow-hidden text-ink">
      {/* Personal background layer — fixed, behind everything (z-0). */}
      <AdminBackground />

      {/* Persistent rail — desktop only. Solid surface stays legible over any bg. */}
      <aside className="relative z-10 hidden lg:flex w-[240px] shrink-0 border-e border-edge bg-surface-elevated flex-col">
        <Rail {...railProps} />
      </aside>

      {/* Slide-in drawer — mobile only. */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <button
            aria-label="Close menu"
            className="admin-backdrop absolute inset-0 bg-black/40"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="admin-drawer-panel relative w-[270px] max-w-[82%] h-full bg-surface-elevated border-e border-edge flex flex-col shadow-2xl">
            <Rail {...railProps} onNavigate={() => setDrawerOpen(false)} />
          </aside>
        </div>
      )}

      <div className="relative z-10 flex-1 min-w-0 flex flex-col">
        {/* Mobile top app bar — hidden on desktop. */}
        <header className="lg:hidden flex items-center gap-2 h-14 shrink-0 border-b border-edge bg-surface-elevated px-3">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="h-11 w-11 -ms-1 flex items-center justify-center rounded-xl text-ink-muted hover:text-ink hover:bg-surface-elevated-2"
          >
            <Menu size={20} />
          </button>
          <div className="flex-1 min-w-0">
            <span className="text-[13px] font-extrabold tracking-[-0.3px]">
              MULU<span className="text-admin-deep">/admin</span>
            </span>
            <p className="text-[11px] text-ink-muted leading-tight truncate">{t(`dashboard.tabs.${activeId}`)}</p>
          </div>
          <button
            onClick={toggleLocale}
            className="h-11 min-w-[44px] px-2 flex items-center justify-center text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle hover:text-ink rounded-xl"
          >
            {i18n.language === 'he' ? 'EN' : 'HE'}
          </button>
        </header>

        <main className="flex-1 overflow-y-auto min-w-0">
          <ActivePage />
        </main>
      </div>
    </div>
  )
}
