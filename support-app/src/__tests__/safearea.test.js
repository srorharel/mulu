import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const css = readFileSync(resolve(__dirname, '../index.css'), 'utf-8')

describe('safe-area CSS variables', () => {
  it('declares --safe-top using env(safe-area-inset-top)', () => {
    expect(css).toMatch(/--safe-top:\s*env\(safe-area-inset-top/)
  })

  it('declares --safe-bottom using env(safe-area-inset-bottom)', () => {
    expect(css).toMatch(/--safe-bottom:\s*env\(safe-area-inset-bottom/)
  })
})
