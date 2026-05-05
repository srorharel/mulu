import { AuthProvider } from './context/AuthContext.jsx'
import { AppRouter } from './router.jsx'
import { isSupabaseConfigured } from './lib/supabase.js'
import { ToastProvider } from './components/ui/Toast.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

function EnvBanner() {
  if (isSupabaseConfigured) return null
  return (
    <div className="bg-amber-500 text-amber-950 text-sm px-4 py-2.5 text-center font-medium">
      Setup required: copy{' '}
      <code className="bg-amber-400/60 rounded px-1">.env.example</code> to{' '}
      <code className="bg-amber-400/60 rounded px-1">.env</code> and add your Supabase
      credentials. See the README for instructions.
    </div>
  )
}

export default function App() {
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
