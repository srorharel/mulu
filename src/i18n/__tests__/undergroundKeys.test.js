import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// ADR-035 i18n completeness: every new underground key must exist in BOTH
// locales with a real (non-empty, non-key) value. Mirrors the jobsNearbyCount
// guard's intent.

const __dirname  = dirname(fileURLToPath(import.meta.url))
const localesDir = resolve(__dirname, '../locales')
const en = JSON.parse(readFileSync(resolve(localesDir, 'en.json'), 'utf-8'))
const he = JSON.parse(readFileSync(resolve(localesDir, 'he.json'), 'utf-8'))

const NEW_KEYS = [
  'consumer.home.requiredField',
  'consumer.home.underground.label',
  'consumer.home.underground.hint',
  'consumer.home.underground.notesRequired',
  'consumer.tracking.underground',
  'washer.drawer.underground.badge',
  'washer.drawer.underground.accessHint',
  'washer.drawer.underground.queued',
  'washer.drawer.underground.syncing',
  'washer.drawer.underground.synced',
]

const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj)

// Detect bidi / zero-width control characters by code point so the test source
// itself stays free of irregular whitespace (U+200B–200F, 202A–202E, 2066–2069, FEFF).
function hasBidiControl(s) {
  for (const ch of s) {
    const c = ch.codePointAt(0)
    if ((c >= 0x200B && c <= 0x200F) ||
        (c >= 0x202A && c <= 0x202E) ||
        (c >= 0x2066 && c <= 0x2069) ||
        c === 0xFEFF) return true
  }
  return false
}

describe('i18n — underground keys present + real in both locales', () => {
  it.each(NEW_KEYS)('en defines %s', (key) => {
    const v = get(en, key)
    expect(v, `en missing ${key}`).toBeTypeOf('string')
    expect(v.length).toBeGreaterThan(0)
    expect(v).not.toBe(key)
  })

  it.each(NEW_KEYS)('he defines %s', (key) => {
    const v = get(he, key)
    expect(v, `he missing ${key}`).toBeTypeOf('string')
    expect(v.length).toBeGreaterThan(0)
    expect(v).not.toBe(key)
  })

  it('he values carry no bidi/zero-width control characters', () => {
    for (const key of NEW_KEYS) {
      expect(hasBidiControl(get(he, key)), `${key} contains a bidi/zero-width control char`).toBe(false)
    }
  })
})
