import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../lib/supabase.js'
import i18n, { LOCALE_STORAGE_KEY } from '../i18n/index.js'

export function useLocale() {
  const { user, profile, refreshProfile } = useAuth()

  const [locale, setLocaleState] = useState(
    () => i18n.language === 'he' ? 'he' : 'en'
  )

  useEffect(() => {
    if (!profile) return
    setLocaleState(profile.locale ?? (i18n.language === 'he' ? 'he' : 'en'))
  }, [profile?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function setLocale(lang) {
    setLocaleState(lang)
    await i18n.changeLanguage(lang)
    try { localStorage.setItem(LOCALE_STORAGE_KEY, lang) } catch { /* private browsing */ }
    if (!user) return { error: null }
    const { error } = await supabase
      .from('profiles')
      .update({ locale: lang })
      .eq('id', user.id)
    if (!error) await refreshProfile()
    return { error: error ?? null }
  }

  return { locale, setLocale }
}
