import { AuthProvider } from './context/AuthContext.jsx'
import { AppRouter } from './router.jsx'

export default function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  )
}
