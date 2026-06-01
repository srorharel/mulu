import { describe, it, expect, vi, beforeEach } from 'vitest'

// Capture the select string + .eq filter to assert against.
let lastSelect = ''
let lastEqArgs = null
let returnedRows = []

vi.mock('../lib/supabase.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn((sel) => {
        lastSelect = sel
        return {
          eq: vi.fn((col, val) => {
            lastEqArgs = [col, val]
            return {
              order: vi.fn().mockResolvedValue({ data: returnedRows, error: null }),
            }
          }),
        }
      }),
    })),
  },
}))

import { fetchPendingApprovals } from '../lib/approvals.js'

describe('fetchPendingApprovals', () => {
  beforeEach(() => {
    lastSelect = ''
    lastEqArgs = null
    returnedRows = []
  })

  it('includes decline_count in the select (regression: missing-column crash)', async () => {
    await fetchPendingApprovals()
    expect(lastSelect).toMatch(/\bdecline_count\b/)
  })

  it('includes is_underground_parking in the select (ADR-035 — drives the location-unavailable state)', async () => {
    await fetchPendingApprovals()
    expect(lastSelect).toMatch(/\bis_underground_parking\b/)
  })

  it('filters to pending_approval status', async () => {
    await fetchPendingApprovals()
    expect(lastEqArgs).toEqual(['status', 'pending_approval'])
  })

  it('returns the rows produced by Supabase (smoke test, no missing-column error)', async () => {
    returnedRows = [{ id: 'o1', status: 'pending_approval', decline_count: 0 }]
    const { data, error } = await fetchPendingApprovals()
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data[0].decline_count).toBe(0)
  })
})
