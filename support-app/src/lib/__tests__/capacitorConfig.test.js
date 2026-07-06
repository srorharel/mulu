import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const configPath = resolve(__dirname, '../../../capacitor.config.json')
const config = JSON.parse(readFileSync(configPath, 'utf-8'))

describe('capacitor.config.json', () => {
  it('has the correct appId for support app', () => {
    expect(config.appId).toBe('com.muluwash.support')
  })

  it('does not duplicate the main app appId', () => {
    expect(config.appId).not.toBe('com.muluwash.app')
  })

  it('points webDir to dist', () => {
    expect(config.webDir).toBe('dist')
  })

  it('uses https androidScheme', () => {
    expect(config.server?.androidScheme).toBe('https')
  })
})
