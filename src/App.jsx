import { useTranslation } from 'react-i18next'
import { AuthProvider } from './context/AuthContext.jsx'
import { AppRouter } from './router.jsx'
import { isSupabaseConfigured } from './lib/supabase.js'
import { ToastProvider } from './components/ui/Toast.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { useDirection } from './hooks/useDirection.js'

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
  useDirection()
  return (
    <ErrorBoundary>
      <EnvBanner />
      <AuthProvider>
        <ToastProvider>
          <AppRouter />
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  )
}
