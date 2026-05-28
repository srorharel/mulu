import { describe, it, expect, vi } from 'vitest'
import { rowsToNested } from '../pages/Content.jsx'
import { buildBrandingConfigExport } from '../pages/Dashboard.jsx'

describe('rowsToNested (content export format)', () => {
  it('inflates dotted keys to nested objects', () => {
    expect(rowsToNested([
      { key: 'common.save',    value: 'Save'    },
      { key: 'common.cancel',  value: 'Cancel'  },
      { key: 'auth.login',     value: 'Sign in' },
    ])).toEqual({
      common: { save: 'Save', cancel: 'Cancel' },
      auth:   { login: 'Sign in' },
    })
  })

  it('handles a single-segment key', () => {
    expect(rowsToNested([{ key: 'tagline', value: 'On-demand wash' }])).toEqual({ tagline: 'On-demand wash' })
  })

  it('handles deeply nested keys', () => {
    expect(rowsToNested([{ key: 'a.b.c.d', value: 'X' }])).toEqual({ a: { b: { c: { d: 'X' } } } })
  })

  it('preserves later values when keys collide on the leaf', () => {
    expect(rowsToNested([
      { key: 'a.b', value: 'first' },
      { key: 'a.b', value: 'second' },
    ])).toEqual({ a: { b: 'second' } })
  })
})

describe('buildBrandingConfigExport (dashboard export shape)', () => {
  function mockClient(tableData) {
    return {
      from: (table) => ({
        select: () => Promise.resolve({ data: tableData[table] ?? [], error: null }),
      }),
    }
  }

  it('returns one object with all four tables plus exported_at', async () => {
    const client = mockClient({
      app_branding:       [{ slug: 'main_logo', url: 'https://x/y.png' }],
      app_config:         [{ key: 'pricing_source', value: { value: 'hardcoded' } }],
      pricing_config:     [{ category: 'private', consumer_price: 100, worker_price: 60, platform_fee: 40 }],
      payout_tier_config: [{ tier: 1, payout: 40 }],
    })
    const out = await buildBrandingConfigExport(client)
    expect(out.app_branding).toHaveLength(1)
    expect(out.app_config).toHaveLength(1)
    expect(out.pricing_config).toHaveLength(1)
    expect(out.payout_tier_config).toHaveLength(1)
    expect(out.exported_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('handles missing tables gracefully (returns [])', async () => {
    const out = await buildBrandingConfigExport(mockClient({}))
    expect(out.app_branding).toEqual([])
    expect(out.app_config).toEqual([])
    expect(out.pricing_config).toEqual([])
    expect(out.payout_tier_config).toEqual([])
  })

  it('returns a serializable JSON value', async () => {
    const out = await buildBrandingConfigExport(mockClient({}))
    expect(() => JSON.stringify(out)).not.toThrow()
  })
})
