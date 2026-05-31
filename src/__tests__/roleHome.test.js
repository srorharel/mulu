// Regression guard for the "white page after logging in with the wrong user" bug.
// An unservable role (super_admin / admin / unknown) must resolve to a TERMINAL
// route that always renders — never a role-guarded route (/home, /washer,
// /support) that would re-reject it and cause an infinite redirect loop.
import { describe, it, expect } from 'vitest'
import { homeForRole, FALLBACK_HOME } from '../lib/roleHome.js'

describe('homeForRole — main app role landing', () => {
  it('routes servable roles to their real home', () => {
    expect(homeForRole('consumer')).toBe('/home')
    expect(homeForRole('washer')).toBe('/washer')
    expect(homeForRole('agent')).toBe('/support')
  })

  it('routes unservable roles to the terminal /profile (no redirect loop)', () => {
    expect(homeForRole('super_admin')).toBe('/profile')
    expect(homeForRole('admin')).toBe('/profile')
    expect(homeForRole('something_unexpected')).toBe('/profile')
    expect(FALLBACK_HOME).toBe('/profile')

    // The crux of the bug: these must NOT land on a role-guarded route.
    for (const role of ['super_admin', 'admin', 'something_unexpected']) {
      expect(['/home', '/washer', '/support']).not.toContain(homeForRole(role))
    }
  })

  it('treats a not-yet-loaded (null/undefined/empty) role as consumer default', () => {
    expect(homeForRole(undefined)).toBe('/home')
    expect(homeForRole(null)).toBe('/home')
    expect(homeForRole('')).toBe('/home')
  })
})
