import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

describe('Leaflet z-index override', () => {
  const css = readFileSync(
    resolve(__dirname, '../index.css'),
    'utf8',
  )

  it('caps all Leaflet panes below the modal layer', () => {
    expect(css).toMatch(/\.leaflet-pane\s*,/)
    expect(css).toMatch(/z-index:\s*[1-9]\s*!important/)
  })

  it('does not set any Leaflet z-index above 9', () => {
    const leafletRules = css.match(/\.leaflet-[\w-]+\s*\{[^}]*z-index:\s*(\d+)/g) || []
    for (const rule of leafletRules) {
      const match = rule.match(/z-index:\s*(\d+)/)
      if (match) {
        expect(Number(match[1])).toBeLessThan(10)
      }
    }
  })
})
