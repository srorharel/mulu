import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FileText, Image, Megaphone, SlidersHorizontal, LogOut, Download } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase.js'
import Content from './Content.jsx'
import Branding from './Branding.jsx'
import Broadcasts from './Broadcasts.jsx'
import Config from './Config.jsx'

const TABS = [
  { id: 'content',    icon: FileText,           page: Content    },
  { id: 'branding',   icon: Image,              page: Branding   },
  { id: 'broadcasts', icon: Megaphone,          page: Broadcasts },
  { id: 'config',     icon: SlidersHorizontal,  page: Config     },
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

export default function Dashboard() {
  const { t, i18n } = useTranslation()
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const { tab: urlTab } = useParams()
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(null)

  const activeId = TABS.find(x => x.id === urlTab) ? urlTab : 'content'
  const ActivePage = TABS.find(x => x.id === activeId).page

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

  return (
    <div className="flex h-screen bg-surface overflow-hidden text-ink">
      <aside className="w-[240px] shrink-0 border-e border-edge bg-surface-elevated flex flex-col">
        <div className="px-5 py-4 border-b border-edge">
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-extrabold tracking-[-0.3px]">
              wash<span className="text-admin-deep">/admin</span>
            </span>
            <button
              onClick={toggleLocale}
              className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-subtle hover:text-ink"
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
                onClick={() => navigate(`/${id}`, { replace: true })}
                className={`w-full flex items-center gap-3 px-5 py-2.5 text-[13.5px] transition-colors ${
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
            onClick={handleExportBrandingConfig}
            disabled={exporting}
            className="w-full flex items-center gap-2 px-3 py-2 text-[12.5px] text-ink-muted hover:text-ink hover:bg-surface-elevated-2 rounded-xl transition-colors disabled:opacity-50"
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
            className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-ink-muted hover:text-danger hover:bg-danger/10 rounded-xl transition-colors"
          >
            <LogOut size={14} />
            <span>{t('common.signOut')}</span>
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <ActivePage />
      </main>
    </div>
  )
}
