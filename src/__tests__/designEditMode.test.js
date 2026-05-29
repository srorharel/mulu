import { describe, it, expect, beforeEach } from 'vitest'

const origLocation = window.location

beforeEach(() => {
  try { sessionStorage.clear() } catch { /* noop */ }
})

import { isDesignEditMode, exitDesignEditMode } from '../lib/designEditMode.js'

function setUrl(url) {
  delete window.location
  window.location = new URL(url)
}

afterAll?.(() => { window.location = origLocation })
import { afterAll } from 'vitest'
afterAll(() => { window.location = origLocation })

describe('isDesignEditMode', () => {
  it('returns false when no flag and no query param', () => {
    setUrl('http://localhost/')
    expect(isDesignEditMode()).toBe(false)
  })
  it('returns true when ?design_edit=1 is present and persists to sessionStorage', () => {
    setUrl('http://localhost/?design_edit=1')
    expect(isDesignEditMode()).toBe(true)
    // Subsequent calls return true even after URL changes (sessionStorage flag).
    setUrl('http://localhost/somewhere')
    expect(isDesignEditMode()).toBe(true)
  })
  it('exitDesignEditMode clears the flag', () => {
    setUrl('http://localhost/?design_edit=1')
    expect(isDesignEditMode()).toBe(true)
    exitDesignEditMode()
    setUrl('http://localhost/')
    expect(isDesignEditMode()).toBe(false)
  })
})
