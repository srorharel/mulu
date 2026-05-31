import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf-8')

describe('index.html viewport', () => {
  it('includes viewport-fit=cover', () => {
    expect(html).toMatch(/viewport-fit=cover/)
  })

  it('has a theme-color meta tag', () => {
    expect(html).toMatch(/name="theme-color"/)
  })

  it('has the MULU Support title', () => {
    expect(html).toMatch(/<title>MULU Support<\/title>/)
  })
})
