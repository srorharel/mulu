// Branding guard — the agent support app must display as "MULU Support".
// Regression intent: display name is "MULU Support" while the bundle id
// (com.sparklego.support) must NEVER change. The auth storageKey
// (wash-support-auth) is intentionally NOT touched — renaming it logs every
// agent out — so this guard only covers user-visible display strings.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = (p) => resolve(__dirname, '../../', p) // support-app/ from src/__tests__
const src  = (p) => resolve(__dirname, '../', p)    // support-app/src/
const read = (p) => readFileSync(p, 'utf-8')
const json = (p) => JSON.parse(read(p))

describe('branding — support app display name is MULU Support', () => {
  it('index.html <title> is "MULU Support"', () => {
    const html = read(root('index.html'))
    expect(html).toMatch(/<title>MULU Support<\/title>/)
  })

  it('capacitor appName is "MULU Support" and appId is unchanged', () => {
    const cfg = json(root('capacitor.config.json'))
    expect(cfg.appName).toBe('MULU Support')
    // Bundle id must NOT change — guards against an accidental rename.
    expect(cfg.appId).toBe('com.sparklego.support')
  })

  it('footer copyright is rebranded to MULU (he + en)', () => {
    const res = read(src('i18n/resources.js'))
    expect(res).toMatch(/© 2026 MULU/)
    expect(res).not.toMatch(/© 2026 Wash/)
  })
})
