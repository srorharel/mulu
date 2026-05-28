import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { resources } from './resources.js'
import { loadOverrides, subscribeContentOverrides } from '../../../src/lib/contentOverrides.js'
import { supabase } from '../lib/supabase.js'

const STORAGE_KEY = 'support_locale'

function resolveInitialLocale() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'he' || stored === 'en') return stored
  } catch { /* private browsing */ }
  return 'he'
}

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: resolveInitialLocale(),
    fallbackLng: 'he',
    supportedLngs: ['he', 'en'],
    interpolation: { escapeValue: false },
  })

const applyDir = (lng) => {
  if (typeof document === 'undefined') return
  document.documentElement.dir = lng === 'he' ? 'rtl' : 'ltr'
  document.documentElement.lang = lng
}
applyDir(i18n.language)
i18n.on('languageChanged', applyDir)

if (supabase) {
  loadOverrides({ supabase, app: 'support', locale: i18n.language, i18n })
  subscribeContentOverrides({ supabase, app: 'support', i18n })
}

export default i18n
