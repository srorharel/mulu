import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { AuthProvider } from './context/AuthContext.jsx'
import { AppRouter } from './router.jsx'
import { DesignOverridesProvider } from './context/DesignOverridesContext.jsx'
import DesignEditOverlay from './components/editable/DesignEditOverlay.jsx'

export default function App() {
  const { i18n } = useTranslation()

  useEffect(() => {
    document.documentElement.dir = i18n.language === 'he' ? 'rtl' : 'ltr'
    document.documentElement.lang = i18n.language
  }, [i18n.language])

  return (
    <AuthProvider>
      <DesignOverridesProvider app="support">
        <AppRouter />
        <DesignEditOverlay app="support" />
      </DesignOverridesProvider>
    </AuthProvider>
  )
}
