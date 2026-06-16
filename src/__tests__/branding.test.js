// Branding guard — the consumer/washer app must display as "MULU".
// Regression intent: the *display name* is MULU everywhere, while the bundle id
// (com.sparklego.app) must NEVER change — renaming it breaks installs and the
// Play Store listing. i18n KEYS (newToWash, etc.) are code identifiers and stay;
// only their human-facing VALUES are rebranded. We deliberately do NOT assert a
// global absence of "Wash" — washer/washing/"a wash" are domain vocabulary.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = (p) => resolve(__dirname, '../../', p) // repo root from src/__tests__
const src  = (p) => resolve(__dirname, '../', p)    // src/ from src/__tests__
const read = (p) => readFileSync(p, 'utf-8')
const json = (p) => JSON.parse(read(p))

describe('branding — main app display name is MULU', () => {
  it('index.html <title> is MULU', () => {
    const html = read(root('index.html'))
    expect(html.match(/<title>(.*?)<\/title>/)?.[1]).toBe('MULU')
  })

  it('capacitor appName is MULU and appId is unchanged', () => {
    const cfg = json(root('capacitor.config.json'))
    expect(cfg.appName).toBe('MULU')
    // Bundle id must NOT change — guards against an accidental rename.
    expect(cfg.appId).toBe('com.sparklego.app')
  })

  it('PWA manifest name + short_name are MULU', () => {
    const mf = json(root('public/manifest.json'))
    expect(mf.name).toBe('MULU')
    expect(mf.short_name).toBe('MULU')
  })

  it('en + he brand strings use MULU, not Wash', () => {
    const en = json(src('i18n/locales/en.json'))
    const he = json(src('i18n/locales/he.json'))
    expect(en.signup.subtitle).toBe('Join MULU')
    expect(en.auth.newToWash).toBe('New to MULU?') // key unchanged, value rebranded
    expect(he.signup.subtitle).toBe('מצטרפים ל-MULU')
    expect(en.signup.subtitle).not.toMatch(/Wash/)
    expect(he.signup.subtitle).not.toMatch(/Wash/)
  })
})
