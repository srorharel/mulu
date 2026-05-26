import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { AuthProvider } from './context/AuthContext.jsx'
import { AppRouter } from './router.jsx'

export default function App() {
  const { i18n } = useTranslation()

  useEffect(() => {
    document.documentElement.dir = i18n.language === 'he' ? 'rtl' : 'ltr'
    document.documentElement.lang = i18n.language
  }, [i18n.language])

  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  )
}
