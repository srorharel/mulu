import { describe, it, expect } from 'vitest'
import { resources } from '../i18n/resources.js'

// ADR-035: the agent "location unavailable (underground)" label must exist in
// BOTH support locales with a real value (never the raw key), and the Hebrew
// value must carry no bidi/zero-width control characters.

// Detect bidi / zero-width control chars by code point so the source stays free
// of irregular whitespace (U+200B–200F, 202A–202E, 2066–2069, FEFF).
function hasBidiControl(s) {
  for (const ch of s) {
    const c = ch.codePointAt(0)
    if ((c >= 0x200B && c <= 0x200F) ||
        (c >= 0x202A && c <= 0x202E) ||
        (c >= 0x2066 && c <= 0x2069) ||
        c === 0xFEFF) return true
  }
  return false
}

describe('support i18n — approvals.location.underground completeness', () => {
  it.each(['he', 'en'])('%s defines approvals.location.underground', (lng) => {
    const v = resources[lng].translation.approvals.location.underground
    expect(v, `${lng} missing approvals.location.underground`).toBeTypeOf('string')
    expect(v.length).toBeGreaterThan(0)
    expect(v).not.toBe('approvals.location.underground')
  })

  it('keeps the generic notRecorded label distinct from the underground one', () => {
    const he = resources.he.translation.approvals.location
    const en = resources.en.translation.approvals.location
    expect(he.underground).not.toBe(he.notRecorded)
    expect(en.underground).not.toBe(en.notRecorded)
  })

  it('he value has no bidi/zero-width control characters', () => {
    expect(hasBidiControl(resources.he.translation.approvals.location.underground)).toBe(false)
  })
})

describe('support i18n — orderActions.underground (agent toggle) completeness', () => {
  const KEYS = ['mark', 'unmark', 'badge', 'confirmTitle', 'confirmBodyMark', 'confirmBodyUnmark', 'confirmYes', 'confirmNo']

  it.each(['he', 'en'])('%s defines every orderActions.underground key + the toasts', (lng) => {
    const u = resources[lng].translation.orderActions.underground
    for (const k of KEYS) {
      expect(u[k], `${lng} missing orderActions.underground.${k}`).toBeTypeOf('string')
      expect(u[k].length).toBeGreaterThan(0)
    }
    const toasts = resources[lng].translation.orderActions.toasts
    expect(toasts.marked).toBeTypeOf('string')
    expect(toasts.regular).toBeTypeOf('string')
  })

  it('he values carry no bidi/zero-width control characters', () => {
    const u = resources.he.translation.orderActions.underground
    for (const k of KEYS) expect(hasBidiControl(u[k]), `orderActions.underground.${k}`).toBe(false)
  })
})
