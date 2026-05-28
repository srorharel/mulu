import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { FileText, Image, Megaphone, SlidersHorizontal, LogOut } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
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

export default function Dashboard() {
  const { t, i18n } = useTranslation()
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const { tab: urlTab } = useParams()

  const activeId = TABS.find(x => x.id === urlTab) ? urlTab : 'content'
  const ActivePage = TABS.find(x => x.id === activeId).page

  function toggleLocale() {
    const next = i18n.language === 'he' ? 'en' : 'he'
    i18n.changeLanguage(next)
  }

  return (
    <div className="flex h-screen bg-surface overflow-hidden text-ink">
      {/* Side rail */}
      <aside className="w-[240px] shrink-0 border-e border-edge bg-surface-elevated flex flex-col">
        <div className="px-5 py-4 border-b border-edge">
          <div className="flex items-center justify-between">
            <span className="text-[14px] font-extrabold tracking-[-0.3px]">
              wash<span className="text-admin">/admin</span>
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
                    ? 'bg-admin-soft text-admin font-semibold border-s-2 border-admin'
                    : 'text-ink-muted hover:bg-surface-elevated-2 hover:text-ink'
                }`}
              >
                <Icon size={16} strokeWidth={isActive ? 2.5 : 2} />
                <span>{t(`dashboard.tabs.${id}`)}</span>
              </button>
            )
          })}
        </nav>

        <div className="border-t border-edge p-3">
          <button
            onClick={signOut}
            className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-ink-muted hover:text-danger hover:bg-danger/10 rounded-xl transition-colors"
          >
            <LogOut size={14} />
            <span>{t('common.signOut')}</span>
          </button>
        </div>
      </aside>

      {/* Active page */}
      <main className="flex-1 overflow-y-auto">
        <ActivePage />
      </main>
    </div>
  )
}
