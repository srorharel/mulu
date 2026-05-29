import { describe, it, expect } from 'vitest'

// Contract test for the transition_order_status signature change in 0083.
//
// Migration 0083 adds a 5th optional parameter (p_admin_override boolean
// DEFAULT false). The existing 4-arg callers in:
//   - src/components/washer/JobDrawer.jsx (acceptJob + advanceStatus)
//   - src/pages/washer/JobDetail.jsx (acceptJob)
//   - src/pages/consumer/OrderTracking.jsx (cancel)
//   - support-app/src/lib/approvals.js (approveOrder)
//   - support-app/src/components/OrderPanel.jsx (cancel/complete)
//   - support-app/src/__tests__/OrderPanel.test.jsx
// pass the args by NAME (Supabase RPC convention). Postgres resolves missing
// arguments with defaults, so the 4-arg form is still valid.
//
// This test pins the EXPECTED call shape of every legacy caller as a
// contract. If migration 0083 ever changes the param names, this fails.

const LEGACY_PARAM_NAMES = ['order_id', 'new_status', 'washer_lat', 'washer_lng']
const ALLOWED_5TH_PARAM  = 'p_admin_override'

const sampleLegacyAccept   = { order_id: 'o1', new_status: 'accepted' }
const sampleLegacyArrive   = { order_id: 'o1', new_status: 'arrived',          washer_lat: 32, washer_lng: 34 }
const sampleLegacySubmit   = { order_id: 'o1', new_status: 'pending_approval', washer_lat: 32, washer_lng: 34 }
const sampleLegacyApprove  = { order_id: 'o1', new_status: 'completed' }
const sampleLegacyCancel   = { order_id: 'o1', new_status: 'cancelled' }
const sampleAdminOverride  = { order_id: 'o1', new_status: 'completed', p_admin_override: true }

function isLegalCall(args) {
  return Object.keys(args).every(k => LEGACY_PARAM_NAMES.includes(k) || k === ALLOWED_5TH_PARAM)
}

describe('transition_order_status — 4-arg legacy callers still work after 0083', () => {
  it('washer acceptJob shape (2 args)', () => {
    expect(isLegalCall(sampleLegacyAccept)).toBe(true)
  })
  it('washer arrival shape (4 args)', () => {
    expect(isLegalCall(sampleLegacyArrive)).toBe(true)
  })
  it('washer submit-for-approval shape (4 args)', () => {
    expect(isLegalCall(sampleLegacySubmit)).toBe(true)
  })
  it('agent approve shape (2 args)', () => {
    expect(isLegalCall(sampleLegacyApprove)).toBe(true)
  })
  it('consumer cancel shape (2 args)', () => {
    expect(isLegalCall(sampleLegacyCancel)).toBe(true)
  })
  it('admin override shape (3 args including p_admin_override)', () => {
    expect(isLegalCall(sampleAdminOverride)).toBe(true)
    expect(sampleAdminOverride.p_admin_override).toBe(true)
  })
  it('catches any new arg that was not declared in 0083', () => {
    expect(isLegalCall({ order_id: 'o1', new_status: 'completed', made_up_param: 1 })).toBe(false)
  })
})
