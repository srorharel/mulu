import { describe, it, expect } from 'vitest'
import { relativeTime } from '../lib/relativeTime.js'

describe('relativeTime', () => {
  it('returns empty string for null/undefined', () => {
    expect(relativeTime(null)).toBe('')
    expect(relativeTime(undefined)).toBe('')
  })

  it('returns empty string for invalid date string', () => {
    expect(relativeTime('not a date')).toBe('')
  })

  it('formats a recent past timestamp in past tense', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const out = relativeTime(fiveMinAgo, 'en')
    expect(out).toMatch(/(5 minutes ago|min ago)/)
  })

  it('formats a recent future timestamp in future tense', () => {
    const inFiveMin = new Date(Date.now() + 5 * 60 * 1000).toISOString()
    const out = relativeTime(inFiveMin, 'en')
    expect(out).toMatch(/(in 5 minutes|min)/)
  })

  it('accepts Date instances as well as strings', () => {
    const d = new Date(Date.now() - 60 * 60 * 1000)
    const out = relativeTime(d, 'en')
    expect(out).toMatch(/(hour|hr)/)
  })
})
