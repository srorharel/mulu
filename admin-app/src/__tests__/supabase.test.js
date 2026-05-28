import { describe, it, expect } from 'vitest'
import { normalizeEnv } from '../lib/supabase.js'

// Regression: 2026-05 — admin-app deployment failed login with
// "Invalid path specified in request URL". Cause: the Vercel env var for
// VITE_SUPABASE_URL was pasted with formatting noise (trailing slash or
// quotes), so supabase-js produced a malformed `${url}/auth/v1/token`
// path that the Supabase gateway rejected. Fix: normalize the env value
// before handing it to createClient. These tests pin the shape so the
// normalization can't silently regress.

describe('normalizeEnv (supabase env-var hardening)', () => {
  it('returns a clean URL unchanged', () => {
    expect(normalizeEnv('https://abc.supabase.co')).toBe('https://abc.supabase.co')
  })

  it('strips a single trailing slash', () => {
    expect(normalizeEnv('https://abc.supabase.co/')).toBe('https://abc.supabase.co')
  })

  it('strips multiple trailing slashes', () => {
    expect(normalizeEnv('https://abc.supabase.co///')).toBe('https://abc.supabase.co')
  })

  it('strips surrounding double quotes', () => {
    expect(normalizeEnv('"https://abc.supabase.co"')).toBe('https://abc.supabase.co')
  })

  it('strips surrounding single quotes', () => {
    expect(normalizeEnv("'https://abc.supabase.co'")).toBe('https://abc.supabase.co')
  })

  it('strips leading and trailing whitespace', () => {
    expect(normalizeEnv('  https://abc.supabase.co  ')).toBe('https://abc.supabase.co')
  })

  it('strips quotes AND trailing slash together (worst-case Vercel paste)', () => {
    expect(normalizeEnv('"https://abc.supabase.co/"')).toBe('https://abc.supabase.co')
  })

  it('returns the input unchanged for non-strings (null, undefined)', () => {
    expect(normalizeEnv(undefined)).toBe(undefined)
    expect(normalizeEnv(null)).toBe(null)
  })

  it('preserves the empty string (so the !url guard still triggers)', () => {
    expect(normalizeEnv('')).toBe('')
  })

  it('does NOT strip an internal slash (path inside the URL stays intact)', () => {
    // Not a supported config, but normalization must not silently mangle
    // anything other than the suffix.
    expect(normalizeEnv('https://abc.supabase.co/extra')).toBe('https://abc.supabase.co/extra')
  })

  it('normalizes the anon key the same way (rare but consistent)', () => {
    expect(normalizeEnv('"eyJ.PAYLOAD.sig"')).toBe('eyJ.PAYLOAD.sig')
  })
})
