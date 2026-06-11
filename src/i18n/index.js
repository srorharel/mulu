import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { z } from 'zod'
import en from './locales/en.json'
import he from './locales/he.json'
import { loadOverrides, subscribeContentOverrides } from '../lib/contentOverrides.js'
import { supabase, isSupabaseConfigured } from '../lib/supabase.js'

// v2 (Jun 2026): deliberately a NEW key with NO migration from 'wash_locale' /
// 'sparklego_locale'. Devices from the SparkleGo era have 'en' persisted by the
// old default — importing it kept whole devices in English forever (and
// syncLocale would push 'en' back onto the profile). One-time reset: every
// device starts in Hebrew; choosing English in settings writes the v2 key.
export const LOCALE_STORAGE_KEY = 'wash_locale_v2'

try {
  localStorage.removeItem('sparklego_locale')
  localStorage.removeItem('wash_locale')
} catch { /* private browsing — ignore */ }

function resolveInitialLocale() {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
    if (stored === 'he' || stored === 'en') return stored
  } catch { /* localStorage blocked */ }
  return 'he'
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      he: { translation: he },
    },
    lng: resolveInitialLocale(),
    fallbackLng: 'he',
    supportedLngs: ['en', 'he'],
    interpolation: { escapeValue: false },
  })

const applyDir = (lng) => {
  if (typeof document === 'undefined') return
  document.documentElement.dir = lng === 'he' ? 'rtl' : 'ltr'
  document.documentElement.lang = lng
}
applyDir(i18n.language)
i18n.on('languageChanged', applyDir)

// Runtime content overrides (admin-app edits propagate live).
// Non-blocking: applies cached bundle synchronously, then refreshes in bg.
if (isSupabaseConfigured) {
  loadOverrides({ supabase, app: 'main', locale: i18n.language, i18n })
  subscribeContentOverrides({ supabase, app: 'main', i18n })
}

// Global zod error map — evaluated at validation time so messages follow language changes.
z.setErrorMap((issue, ctx) => {
  if (issue.code === 'too_small') {
    if (issue.type === 'string' && Number(issue.minimum) <= 1) {
      return { message: i18n.t('validation.required') }
    }
    return { message: i18n.t('validation.tooShort', { count: Number(issue.minimum) }) }
  }
  if (issue.code === 'invalid_string' && issue.validation === 'email') {
    return { message: i18n.t('validation.invalidEmail') }
  }
  if (issue.code === 'invalid_type' && issue.received === 'undefined') {
    return { message: i18n.t('validation.required') }
  }
  // Custom refinements that pass a translation key as the message
  if (issue.code === 'custom') {
    const msg = issue.message ?? ''
    if (msg.startsWith('validation.')) return { message: i18n.t(msg) }
  }
  return { message: ctx.defaultError }
})

export default i18n
