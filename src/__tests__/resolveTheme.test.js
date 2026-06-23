import { describe, it, expect } from 'vitest'
import { resolveTheme } from '../lib/resolveTheme.js'

// Pins the post-2026-06 default: LIGHT for everyone unless a user explicitly
// opts into dark. There is no role-based dark default. If a future change
// reintroduces washer-defaults-to-dark, this suite fails on purpose.
describe('resolveTheme', () => {
  it('returns null when there is no profile yet (caller falls back to cache/system)', () => {
    expect(resolveTheme(null)).toBe(null)
    expect(resolveTheme(undefined)).toBe(null)
  })

  it('honors an explicit dark preference for any role', () => {
    expect(resolveTheme({ role: 'washer',   display_preference: 'dark' })).toBe('dark')
    expect(resolveTheme({ role: 'consumer', display_preference: 'dark' })).toBe('dark')
  })

  it('honors an explicit light preference for any role', () => {
    expect(resolveTheme({ role: 'washer',   display_preference: 'light' })).toBe('light')
    expect(resolveTheme({ role: 'consumer', display_preference: 'light' })).toBe('light')
  })

  it('defaults EVERY role to light when no preference is set', () => {
    expect(resolveTheme({ role: 'washer' })).toBe('light')
    expect(resolveTheme({ role: 'consumer' })).toBe('light')
    expect(resolveTheme({ role: 'agent' })).toBe('light')
    expect(resolveTheme({ role: 'super_admin' })).toBe('light')
    expect(resolveTheme({})).toBe('light')
  })

  it('does not default a washer to dark', () => {
    expect(resolveTheme({ role: 'washer', display_preference: null })).toBe('light')
  })
})
