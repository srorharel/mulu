import { describe, it, expect, beforeEach } from 'vitest'
import i18next from 'i18next'
import { resources } from '../i18n/resources.js'
import { loadOverrides } from '../lib/contentOverrides.js'

// Regression: 2026-05 — installed support APK kept showing bundled strings
// even after the super_admin had set an override row in content_overrides.
// Root cause was that the APK pre-dated the P2 commit that wired
// loadOverrides into support-app/src/i18n/index.js. The wiring is currently
// in place; these tests pin the contract so the wire-up cannot silently
// regress again.

beforeEach(() => {
  try { localStorage.clear() } catch { /* private browsing */ }
})

function makeI18n(lng = 'he') {
  // Deep-clone the bundled resources: i18next.addResourceBundle mutates the
  // store-data object by reference, which would leak between tests because
  // the `resources` module export is a singleton.
  const fresh = JSON.parse(JSON.stringify(resources))
  const inst = i18next.createInstance()
  inst.init({
    resources: fresh,
    lng,
    fallbackLng: 'he',
    supportedLngs: ['he', 'en'],
    interpolation: { escapeValue: false },
  })
  return inst
}

function makeSupabase(rows) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ data: rows, error: null }),
        }),
      }),
    }),
  }
}

describe('support-app content_overrides merge', () => {
  it('returns the bundled value before loadOverrides has run', () => {
    const i18n = makeI18n('he')
    expect(i18n.t('nav.unassigned')).toBe('לא מוקצה')
  })

  it('returns the overridden value after loadOverrides merges DB rows', async () => {
    const i18n = makeI18n('he')
    const supabase = makeSupabase([
      { key: 'nav.unassigned', value: 'בהמתנה', updated_at: '2026-05-29T00:00:00Z' },
    ])
    const r = await loadOverrides({ supabase, app: 'support', locale: 'he', i18n })
    expect(r.applied).toBe(true)
    expect(i18n.t('nav.unassigned')).toBe('בהמתנה')
  })

  it('overrides deep-merge: other keys in the same namespace are NOT clobbered', async () => {
    const i18n = makeI18n('he')
    const supabase = makeSupabase([
      { key: 'nav.unassigned', value: 'OVERRIDE', updated_at: '2026-05-29T00:00:00Z' },
    ])
    await loadOverrides({ supabase, app: 'support', locale: 'he', i18n })
    expect(i18n.t('nav.unassigned')).toBe('OVERRIDE')
    // Sibling key still bundled
    expect(i18n.t('nav.conversations')).toBe('שיחות')
    // Sibling namespace untouched
    expect(i18n.t('login.title')).toBe('כניסה לצוות התמיכה')
  })

  it('empty override set leaves the bundled values intact (no-op merge)', async () => {
    const i18n = makeI18n('he')
    const supabase = makeSupabase([])
    await loadOverrides({ supabase, app: 'support', locale: 'he', i18n })
    expect(i18n.t('nav.unassigned')).toBe('לא מוקצה')
    expect(i18n.t('login.title')).toBe('כניסה לצוות התמיכה')
  })

  it('English locale: bundle + override resolve in EN namespace independently of HE', async () => {
    const i18n = makeI18n('en')
    const supabase = makeSupabase([
      { key: 'nav.unassigned', value: 'In queue', updated_at: '2026-05-29T00:00:00Z' },
    ])
    await loadOverrides({ supabase, app: 'support', locale: 'en', i18n })
    expect(i18n.t('nav.unassigned')).toBe('In queue')
  })
})
