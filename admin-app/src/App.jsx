import { AuthProvider } from './context/AuthContext.jsx'
import { BackgroundProvider } from './context/BackgroundContext.jsx'
import { AppRouter } from './router.jsx'

export default function App() {
  return (
    <AuthProvider>
      <BackgroundProvider>
        <AppRouter />
      </BackgroundProvider>
    </AuthProvider>
  )
}
