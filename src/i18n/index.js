import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { z } from 'zod'
import en from './locales/en.json'
import he from './locales/he.json'

export const LOCALE_STORAGE_KEY = 'wash_locale'

// Migrate saved locale from old key so existing users keep their preference.
try {
  const old = localStorage.getItem('sparklego_locale')
  if (old && !localStorage.getItem(LOCALE_STORAGE_KEY)) {
    localStorage.setItem(LOCALE_STORAGE_KEY, old)
  }
  if (old) localStorage.removeItem('sparklego_locale')
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
