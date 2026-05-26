import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const configPath = resolve(__dirname, '../../../vercel.json')
const config = JSON.parse(readFileSync(configPath, 'utf-8'))

describe('vercel.json', () => {
  it('has SPA fallback rewrite', () => {
    const fallback = config.rewrites?.find(
      (r) => r.source === '/(.*)' && r.destination === '/index.html'
    )
    expect(fallback).toBeDefined()
  })

  it('outputs to dist', () => {
    expect(config.outputDirectory).toBe('dist')
  })

  it('uses vite framework', () => {
    expect(config.framework).toBe('vite')
  })
})
