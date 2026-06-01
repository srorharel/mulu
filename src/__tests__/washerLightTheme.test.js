// @vitest-environment node
//
// Washer light-mode dimming guard (DESIGN.md §3/§14).
// When a washer opts into light mode, the non-map washer shell must render on
// DIMMED cool-neutral surfaces instead of the bright shared light tokens, to cut
// outdoor glare. Two regression intents:
//   1. The scoped override block exists and overrides the surface tokens to
//      non-white values, scoped via [data-layout="washer"]:not(.dark) so the
//      always-dark map shell is excluded.
//   2. The GLOBAL :root light values are UNCHANGED — they're shared by consumer
//      GlassCard and other consumer surfaces; dimming them would break consumer
//      light mode.
// Pure file read (no DOM) — asserts on the CSS source text directly.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// The shared src/test/setup.js beforeEach clears session/localStorage (must not
// be removed — see CLAUDE.md). Those DOM globals don't exist under the node
// environment this guard runs in, so provide no-op shims to satisfy that hook.
globalThis.sessionStorage ??= { clear() {} }
globalThis.localStorage ??= { clear() {} }

const __dirname = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(resolve(__dirname, '../index.css'), 'utf-8')

// Isolate the body of a `selector { ... }` block from the CSS source.
function blockBody(source, selector) {
  const start = source.indexOf(selector)
  if (start === -1) return null
  const open = source.indexOf('{', start)
  const close = source.indexOf('}', open)
  if (open === -1 || close === -1) return null
  return source.slice(open + 1, close)
}

// Pull the value of a custom property from a block body.
function cssVar(body, name) {
  const m = body.match(new RegExp(`${name}\\s*:\\s*([^;]+);`))
  return m ? m[1].trim() : null
}

const WHITEISH = /#fff\b|#ffffff\b|#fafafa\b/i

describe('washer light theme — dimmed surfaces', () => {
  it('defines a [data-layout="washer"]:not(.dark) override block', () => {
    expect(css).toMatch(/\[data-layout="washer"\]:not\(\.dark\)\s*\{/)
  })

  it('overrides --color-surface and --color-surface-elevated to non-white values', () => {
    const body = blockBody(css, '[data-layout="washer"]:not(.dark)')
    expect(body).not.toBeNull()

    const surface = cssVar(body, '--color-surface')
    const elevated = cssVar(body, '--color-surface-elevated')

    expect(surface).toBeTruthy()
    expect(elevated).toBeTruthy()

    // Must be dimmed, not bright white / near-white.
    expect(surface).not.toMatch(WHITEISH)
    expect(elevated).not.toMatch(WHITEISH)
  })

  it('keeps the global :root light --color-surface as #fafafa (consumer unchanged)', () => {
    const rootBody = blockBody(css, ':root')
    expect(rootBody).not.toBeNull()
    expect(cssVar(rootBody, '--color-surface')).toBe('#fafafa')
    expect(cssVar(rootBody, '--color-surface-elevated')).toBe('#ffffff')
  })
})
