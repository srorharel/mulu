import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const viteConfigPath = resolve(__dirname, '../../../vite.config.js')
const source = readFileSync(viteConfigPath, 'utf-8')

describe('vite.config.js base path', () => {
  it('uses relative base for Capacitor WebView compatibility', () => {
    expect(source).toMatch(/base:\s*['"]\.\/['"]/)
  })
})
