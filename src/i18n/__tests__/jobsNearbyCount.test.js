import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import i18next from 'i18next'

// Guard for the "raw i18n key in Hebrew" bug: washer.drawer.jobsNearbyCount is a
// pluralised count subtitle. Hebrew selects the `two` category for count===2, so
// jobsNearbyCount_two MUST exist — without it i18next renders the literal key.
// We assert every plural variant each language actually selects is present, and
// that i18next never returns the raw key for representative counts.

const __dirname = dirname(fileURLToPath(import.meta.url))
const localesDir = resolve(__dirname, '../locales')
const en = JSON.parse(readFileSync(resolve(localesDir, 'en.json'), 'utf-8'))
const he = JSON.parse(readFileSync(resolve(localesDir, 'he.json'), 'utf-8'))

const KEY = 'washer.drawer.jobsNearbyCount'

// The plural categories the runtime's Intl.PluralRules will actually request.
function requiredCategories(lng) {
  return new Intl.PluralRules(lng).resolvedOptions().pluralCategories
}

describe('i18n — washer.drawer.jobsNearbyCount plural completeness', () => {
  it.each([['en', en], ['he', he]])('%s defines every plural variant it selects, none equal to the key', (lng, bundle) => {
    const group = bundle.washer.drawer
    for (const cat of requiredCategories(lng)) {
      const variant = `jobsNearbyCount_${cat}`
      const value = group[variant]
      expect(value, `${lng}: missing ${variant}`).toBeTypeOf('string')
      expect(value.length, `${lng}: ${variant} is empty`).toBeGreaterThan(0)
      // The value must be a real translation, never the literal key (raw-key bug).
      expect(value).not.toBe(KEY)
      expect(value).not.toBe(variant)
    }
  })

  it('he carries _two and _many explicitly (robust across ICU versions)', () => {
    expect(he.washer.drawer.jobsNearbyCount_two).toBeTypeOf('string')
    expect(he.washer.drawer.jobsNearbyCount_many).toBeTypeOf('string')
  })

  it('resolves a real translation (never the raw key) for representative counts in both locales', async () => {
    const i18n = i18next.createInstance()
    await i18n.init({
      resources: { en: { translation: en }, he: { translation: he } },
      lng: 'he',
      fallbackLng: 'he',
      supportedLngs: ['en', 'he'],
      interpolation: { escapeValue: false },
    })

    for (const count of [1, 2, 3, 10, 20]) {
      const out = i18n.t(KEY, { count })
      expect(out, `he count=${count} returned the raw key`).not.toBe(KEY)
      expect(out).not.toContain('jobsNearbyCount')
    }

    await i18n.changeLanguage('en')
    for (const count of [1, 2, 5]) {
      const out = i18n.t(KEY, { count })
      expect(out).not.toBe(KEY)
      expect(out).not.toContain('jobsNearbyCount')
    }
  })
})
