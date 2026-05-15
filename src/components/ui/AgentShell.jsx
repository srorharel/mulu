import { Outlet, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../context/AuthContext.jsx'
import { useTheme } from '../../hooks/useTheme.js'

export default function AgentShell() {
  const { isDark }  = useTheme()
  const { signOut } = useAuth()
  const navigate    = useNavigate()
  const { t }       = useTranslation()

  async function handleSignOut() {
    await signOut()
    navigate('/', { replace: true })
  }

  return (
    <div data-layout="agent" className={`${isDark ? 'dark ' : ''}h-full bg-surface text-ink flex flex-col`}>
      <header className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-edge bg-glass backdrop-blur-xl">
        <span className="text-base font-bold text-ink">{t('agent.shell.title')}</span>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink transition-colors"
        >
          <LogOut className="h-4 w-4" />
          {t('common.signOut')}
        </button>
      </header>
      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  )
}
