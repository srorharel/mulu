// Guard: the main Vercel project (Root Dir = repo root) MUST ship a SPA catch-all
// rewrite, or every non-root route (/login, /home, refreshes, auth callbacks)
// 404s on the deployed site. Regression test for the "404 on login" bug.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const cfg = JSON.parse(readFileSync(resolve(__dirname, '../../vercel.json'), 'utf-8'))

describe('vercel.json — SPA rewrite', () => {
  it('defines a rewrites array', () => {
    expect(Array.isArray(cfg.rewrites)).toBe(true)
    expect(cfg.rewrites.length).toBeGreaterThan(0)
  })

  it('has a catch-all rewrite whose destination is /index.html', () => {
    const spa = cfg.rewrites.find((r) => r.destination === '/index.html')
    expect(spa).toBeTruthy()
    // Catch-all source so deep links and refreshes fall through to the SPA.
    expect(spa.source).toBe('/(.*)')
  })
})
