import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { resources } from './resources.js'
import { loadOverrides, subscribeContentOverrides } from '../../../src/lib/contentOverrides.js'
import { supabase } from '../lib/supabase.js'

const STORAGE_KEY = 'admin_locale'

function resolveInitialLocale() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'he' || stored === 'en') return stored
  } catch { /* private browsing */ }
  return 'en'
}

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: resolveInitialLocale(),
    fallbackLng: 'en',
    supportedLngs: ['en', 'he'],
    interpolation: { escapeValue: false },
  })

i18n.on('languageChanged', (lng) => {
  try { localStorage.setItem(STORAGE_KEY, lng) } catch { /* ignore */ }
})

if (supabase) {
  loadOverrides({ supabase, app: 'admin', locale: i18n.language, i18n })
  subscribeContentOverrides({ supabase, app: 'admin', i18n })
}

export default i18n
