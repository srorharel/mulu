import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadOverrides, _internals } from '../../../src/lib/contentOverrides.js'

const { rowsToBundle } = _internals

function makeI18n() {
  const calls = []
  return {
    calls,
    addResourceBundle: (lng, ns, resources, deep, overwrite) => {
      calls.push({ lng, ns, resources, deep, overwrite })
    },
  }
}

function makeSupabase(rows, err = null) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ data: rows, error: err }),
        }),
      }),
    }),
  }
}

describe('contentOverrides', () => {
  beforeEach(() => {
    try { localStorage.clear() } catch { /* noop */ }
  })

  it('rowsToBundle inflates dotted keys into a nested object', () => {
    const out = rowsToBundle([
      { key: 'a.b.c', value: 'X' },
      { key: 'a.b.d', value: 'Y' },
      { key: 'a.e',   value: 'Z' },
    ])
    expect(out).toEqual({ a: { b: { c: 'X', d: 'Y' }, e: 'Z' } })
  })

  it('rowsToBundle handles a single-segment key', () => {
    const out = rowsToBundle([{ key: 'foo', value: 'Bar' }])
    expect(out).toEqual({ foo: 'Bar' })
  })

  it('loadOverrides applies fetched rows via addResourceBundle with deep+overwrite', async () => {
    const i18n = makeI18n()
    const supabase = makeSupabase([
      { key: 'common.save', value: 'CUSTOM SAVE', updated_at: '2026-01-01' },
    ])
    const r = await loadOverrides({ supabase, app: 'main', locale: 'en', i18n })
    expect(r.applied).toBe(true)
    expect(i18n.calls.length).toBeGreaterThanOrEqual(1)
    const last = i18n.calls[i18n.calls.length - 1]
    expect(last.lng).toBe('en')
    expect(last.ns).toBe('translation')
    expect(last.deep).toBe(true)
    expect(last.overwrite).toBe(true)
    expect(last.resources).toEqual({ common: { save: 'CUSTOM SAVE' } })
  })

  it('loadOverrides applies cached bundle synchronously before network', async () => {
    // Pre-seed the cache as if a prior boot had already loaded overrides.
    localStorage.setItem(
      'wash_content_overrides:v1:main:en',
      JSON.stringify({ bundle: { common: { save: 'CACHED' } }, version: 'v1' })
    )
    const i18n = makeI18n()
    // Delay the network so we can confirm the cache landed first.
    const slowSupabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => new Promise(res => setTimeout(() => res({ data: [], error: null }), 50)),
          }),
        }),
      }),
    }
    const p = loadOverrides({ supabase: slowSupabase, app: 'main', locale: 'en', i18n })
    // Cache should have been applied synchronously already.
    expect(i18n.calls[0].resources).toEqual({ common: { save: 'CACHED' } })
    await p
  })

  it('loadOverrides reports applied=false when supabase fails AND no cache', async () => {
    const i18n = makeI18n()
    const failingSupabase = makeSupabase(null, { message: 'boom' })
    const r = await loadOverrides({ supabase: failingSupabase, app: 'main', locale: 'en', i18n })
    expect(r.applied).toBe(false)
    expect(r.reason).toBe('fetch-error')
  })

  it('loadOverrides returns missing-args when supabase or i18n is null', async () => {
    const r1 = await loadOverrides({ supabase: null, app: 'main', locale: 'en', i18n: makeI18n() })
    expect(r1.applied).toBe(false)
    const r2 = await loadOverrides({ supabase: makeSupabase([]), app: 'main', locale: 'en', i18n: null })
    expect(r2.applied).toBe(false)
  })
})
