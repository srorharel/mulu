import { describe, it, expect } from 'vitest'
import { mapTiles, routeColor, mapThemeClass } from '../mapTheme'

describe('mapTheme', () => {
  it('uses dark_all tiles in dark mode', () => {
    expect(mapTiles(true).url).toContain('dark_all')
  })
  it('uses light_all tiles in light mode', () => {
    expect(mapTiles(false).url).toContain('light_all')
  })
  it('keeps carto subdomains + attribution on both themes', () => {
    for (const d of [true, false]) {
      expect(mapTiles(d).subdomains).toBe('abcd')
      expect(mapTiles(d).attribution).toMatch(/CARTO/)
    }
  })
  it('route color pops per theme (mint on dark, deep green on light)', () => {
    expect(routeColor(true)).toBe('#7DD9A2')
    expect(routeColor(false)).toBe('#26B55F')
  })
  it('emits a theme class hook for marker CSS', () => {
    expect(mapThemeClass(true)).toBe('map-dark')
    expect(mapThemeClass(false)).toBe('map-light')
  })
})
