import { useTranslation } from 'react-i18next'
import { AuthProvider } from './context/AuthContext.jsx'
import { AppRouter } from './router.jsx'
import { isSupabaseConfigured } from './lib/supabase.js'
import { ToastProvider } from './components/ui/Toast.jsx'
import { CallProvider } from './context/CallContext.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { ImpersonationBanner, SuspendedTakeover } from './components/AdminBanners.jsx'
import { DesignOverridesProvider } from './context/DesignOverridesContext.jsx'
import DesignEditOverlay from './components/editable/DesignEditOverlay.jsx'

function EnvBanner() {
  const { t } = useTranslation()
  if (isSupabaseConfigured) return null
  return (
    <div className="bg-amber-500 text-amber-950 text-sm px-4 py-2.5 text-center font-medium">
      {t('app.setupRequired')}
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <EnvBanner />
      <AuthProvider>
        <DesignOverridesProvider app="main">
          <ImpersonationBanner />
          <ToastProvider>
            {/* In-app calling — inert unless VITE_ENABLE_INAPP_CALLS. */}
            <CallProvider>
              <AppRouter />
            </CallProvider>
          </ToastProvider>
          <SuspendedTakeover />
          <DesignEditOverlay app="main" />
        </DesignOverridesProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}
