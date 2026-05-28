import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

// Mock supabase with mutable state so each test sets the live fixture.
let state
function makeBuilder(table) {
  return {
    select: () => makeBuilder(table),
    order: () => Promise.resolve({ data: state.tables[table] ?? [], error: null }),
    update: (patch) => ({
      eq: (col, val) => {
        const t = state.tables[table] ?? []
        for (const r of t) if (r[col] === val) Object.assign(r, patch)
        return Promise.resolve({ error: null })
      },
    }),
    delete: () => ({
      eq: (col, val) => {
        state.tables[table] = (state.tables[table] ?? []).filter(r => r[col] !== val)
        state.deleted.push({ table, col, val })
        return Promise.resolve({ error: null })
      },
    }),
  }
}

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    from: (t) => makeBuilder(t),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  },
}))

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => ({ profile: { id: 'super', full_name: 'Super', role: 'super_admin' } }),
}))

beforeEach(() => {
  state = {
    tables: {
      app_config: [
        { key: 'pricing_source',           value: { value: 'hardcoded' }, value_type: 'string', updated_at: null, editor: null },
        { key: 'arrival_geofence_meters',  value: { value: 250 },          value_type: 'number', updated_at: '2026-05-29T00:00:00Z', editor: { full_name: 'Sara' } },
        { key: 'nearby_job_radius_meters', value: { value: 15000 },        value_type: 'number', updated_at: null, editor: null },
      ],
      pricing_config: [
        { category: 'private', consumer_price: 100, worker_price: 60, platform_fee: 40, updated_at: null, editor: null },
        { category: 'jeep',    consumer_price: 200, worker_price: 80, platform_fee: 40, updated_at: null, editor: null },
      ],
      payout_tier_config: [
        { tier: 1, payout: 40, updated_at: null, editor: null },
        { tier: 2, payout: 99, updated_at: null, editor: null },
      ],
    },
    deleted: [],
  }
})

import Config from '../pages/Config.jsx'

describe('Config — per-row reset', () => {
  function rowByKey(container, key) {
    return container.querySelector(`[data-config-key="${key}"]`)
  }

  it('disables reset for app_config rows that are already at the seeded default', async () => {
    const { container } = render(<Config />)
    await waitFor(() => expect(screen.getByText('nearby_job_radius_meters')).toBeTruthy())
    const row = rowByKey(container, 'nearby_job_radius_meters')
    expect(row).toBeTruthy()
    const resetBtn = within(row).getByTitle('Reset to default')
    expect(resetBtn).toBeDisabled()
  })

  it('enables reset on app_config rows that drift from the seed and resets them via UPDATE', async () => {
    const { container } = render(<Config />)
    await waitFor(() => expect(screen.getByText('arrival_geofence_meters')).toBeTruthy())
    const row = rowByKey(container, 'arrival_geofence_meters')
    expect(row).toBeTruthy()
    const resetBtn = within(row).getByTitle('Reset to default')
    expect(resetBtn).not.toBeDisabled()
    fireEvent.click(resetBtn)
    await waitFor(() => expect(screen.getByText(/Reset arrival_geofence_meters/)).toBeTruthy())
    expect(screen.getByText(/Restores the seeded default value \(100\)/)).toBeTruthy()
    fireEvent.click(screen.getByText('Reset'))
    await waitFor(() => {
      const row2 = state.tables.app_config.find(r => r.key === 'arrival_geofence_meters')
      expect(row2.value.value).toBe(100)
    })
  })

  it('BLOCKS reset on pricing_config when pricing_source = config', async () => {
    state.tables.app_config[0].value.value = 'config'
    render(<Config />)
    await waitFor(() => expect(screen.getByText('jeep')).toBeTruthy())
    // Click reset on jeep
    const row = screen.getByText('jeep').closest('tr')
    const resetBtn = within(row).getByTitle('Reset to seeded value')
    fireEvent.click(resetBtn)
    await waitFor(() => expect(screen.getByText('Reset blocked')).toBeTruthy())
    expect(screen.getByText(/Pricing source is 'config'/)).toBeTruthy()
    // No delete actually happened
    expect(state.deleted.filter(d => d.table === 'pricing_config')).toEqual([])
  })

  it('ALLOWS reset on pricing_config when pricing_source = hardcoded (drift row is deleted)', async () => {
    render(<Config />)
    await waitFor(() => expect(screen.getByText('jeep')).toBeTruthy())
    const row = screen.getByText('jeep').closest('tr')
    const resetBtn = within(row).getByTitle('Reset to seeded value')
    expect(resetBtn).not.toBeDisabled()
    fireEvent.click(resetBtn)
    await waitFor(() => expect(screen.getByText(/Reset pricing for jeep/)).toBeTruthy())
    fireEvent.click(screen.getByText('Reset'))
    await waitFor(() => {
      expect(state.deleted.filter(d => d.table === 'pricing_config' && d.val === 'jeep')).toHaveLength(1)
    })
  })

  it('ALLOWS reset on payout_tier_config when pricing_source = hardcoded', async () => {
    render(<Config />)
    await waitFor(() => expect(screen.getByText('2')).toBeTruthy())
    // tier 2 has 99 (drift)
    const rows = screen.getAllByRole('row')
    const tier2Row = rows.find(r => within(r).queryByText('99'))
    expect(tier2Row).toBeTruthy()
    const resetBtn = within(tier2Row).getByTitle('Reset to seeded value')
    fireEvent.click(resetBtn)
    await waitFor(() => expect(screen.getByText(/Reset tier 2 payout/)).toBeTruthy())
    fireEvent.click(screen.getByText('Reset'))
    await waitFor(() => {
      expect(state.deleted.filter(d => d.table === 'payout_tier_config' && d.val === 2)).toHaveLength(1)
    })
  })
})
