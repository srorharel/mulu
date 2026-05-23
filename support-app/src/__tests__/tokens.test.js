import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import tailwindConfig from '../../tailwind.config.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

function walkSrc(dir, results = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      walkSrc(full, results)
    } else if (/\.(jsx?|css)$/.test(entry)) {
      results.push(full)
    }
  }
  return results
}

describe('Design tokens', () => {
  it('tailwind config exports the agent color token', () => {
    const { colors } = tailwindConfig.theme.extend
    expect(colors).toBeDefined()
    expect(colors.agent?.DEFAULT).toBe('#3FB58F')
    expect(colors.agent?.deep).toBe('#1F7A5E')
    expect(colors.agent?.soft).toBeDefined()
  })

  it('tailwind config exports surface-elevated and surface-elevated-2 tokens', () => {
    const { colors } = tailwindConfig.theme.extend
    expect(colors.surface?.elevated).toBe('#15171f')
    expect(colors.surface?.['elevated-2']).toBe('#1a1d27')
  })

  it('tailwind config exports edge, ink, accent, danger, warning, success tokens', () => {
    const { colors } = tailwindConfig.theme.extend
    expect(colors.edge?.DEFAULT).toBe('#23262f')
    expect(colors.ink?.DEFAULT).toBe('#f4f5f7')
    expect(colors.accent?.DEFAULT).toBe('#7DD9A2')
    expect(colors.danger?.DEFAULT).toBe('#ef4444')
    expect(colors.warning?.DEFAULT).toBe('#f59e0b')
    expect(colors.success?.DEFAULT).toBe('#22c55e')
  })

  it('no source file under src/ references the old violet #7C3AED', () => {
    const files = walkSrc(ROOT)
    const violations = []
    for (const file of files) {
      const content = readFileSync(file, 'utf8')
      if (content.includes('#7C3AED') || content.includes('#7c3aed')) {
        violations.push(file.replace(ROOT + '/', ''))
      }
    }
    expect(violations, `Files still reference violet #7C3AED: ${violations.join(', ')}`).toHaveLength(0)
  })

  it("no source file under src/ contains the literal string 'violet' as a color class", () => {
    const files = walkSrc(ROOT)
    const VIOLET_CLASS_RE = /\b(?:bg|text|border|ring)-(?:violet|indigo)-[0-9]+/g
    const violations = []
    for (const file of files) {
      const content = readFileSync(file, 'utf8')
      if (VIOLET_CLASS_RE.test(content)) {
        violations.push(file.replace(ROOT + '/', ''))
      }
      VIOLET_CLASS_RE.lastIndex = 0
    }
    expect(violations, `Files use violet/indigo color classes: ${violations.join(', ')}`).toHaveLength(0)
  })
})
