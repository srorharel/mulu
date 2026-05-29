import { describe, it, expect } from 'vitest'
import { rowsToMap, overridesToStyle } from '../lib/designOverrides.js'

describe('designOverrides.rowsToMap', () => {
  it('groups rows by id with property → value map', () => {
    const m = rowsToMap([
      { id: 'a.b', property: 'color',   value: { value: '#fff' } },
      { id: 'a.b', property: 'padding', value: { value: 16 } },
      { id: 'c',   property: 'bg',      value: { value: 'red' } },
    ])
    expect(m.get('a.b')).toEqual({ color: '#fff', padding: 16 })
    expect(m.get('c')).toEqual({ bg: 'red' })
  })
  it('returns empty map for empty rows', () => {
    expect(rowsToMap([]).size).toBe(0)
    expect(rowsToMap(undefined).size).toBe(0)
  })
})

describe('designOverrides.overridesToStyle', () => {
  it('returns undefined for falsy input', () => {
    expect(overridesToStyle(null)).toBeUndefined()
    expect(overridesToStyle({})).toBeUndefined()
  })
  it('maps color and bg', () => {
    expect(overridesToStyle({ color: '#f00', bg: '#fff' })).toEqual({
      color: '#f00', backgroundColor: '#fff',
    })
  })
  it('maps text_size to em', () => {
    expect(overridesToStyle({ text_size: 1.2 })).toEqual({ fontSize: '1.2em' })
  })
  it('maps padding and border_radius to px', () => {
    expect(overridesToStyle({ padding: 16, border_radius: 8 })).toEqual({
      padding: '16px', borderRadius: '8px',
    })
  })
  it('combines offset_x/offset_y into transform translate', () => {
    expect(overridesToStyle({ offset_x: 10, offset_y: -5 })).toEqual({
      transform: 'translate(10px, -5px)',
    })
    expect(overridesToStyle({ offset_x: 10 })).toEqual({ transform: 'translate(10px, 0px)' })
  })
})
