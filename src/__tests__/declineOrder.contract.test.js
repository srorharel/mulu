import { describe, it, expect } from 'vitest'
import { latestMigrationDefining, normalize } from './helpers/migrations.js'

// CRITICAL guard — the decline path of the approval state machine (ADR-024).
//
// decline_order had ZERO automated coverage: ApprovalRow.test.jsx mocks the
// `declineOrder` wrapper, and verify-live-surfaces.js only manipulates
// decline_count via raw SQL — neither exercises the RPC's rules. This pins the
// LATEST decline_order definition so the revert + audit + auto-escalation
// behaviour can't regress unnoticed.

const { file, body } = latestMigrationDefining('decline_order')
const sql = normalize(body)

const REQUIRED_RULES = [
  ['agent-only: rejects non-agent callers',
    "select 1 from profiles where id = v_agent and role = 'agent'"],
  ['agent-only: raises not_agent',
    'not_agent'],
  ['requires a reason of at least 3 chars',
    'length(trim(p_reason)) < 3'],
  ['raises reason_required when reason missing/short',
    'reason_required'],
  ['only declinable from pending_approval',
    "v_order.status <> 'pending_approval'"],
  ['reverts the order to in_progress',
    "status = 'in_progress'"],
  ['increments decline_count',
    'decline_count = coalesce(decline_count, 0) + 1'],
  ['clears submitted_for_approval_at on decline',
    'submitted_for_approval_at = null'],
  ['writes a declined row to approval_audit',
    'insert into approval_audit'],
  ['records the action as declined',
    "'declined'"],
  ['auto-escalates by creating a support ticket past the threshold',
    'insert into support_tickets'],
]

describe(`decline_order contract (latest def: ${file})`, () => {
  for (const [rule, needle] of REQUIRED_RULES) {
    it(`enforces: ${rule}`, () => {
      expect(sql, `expected to find: ${needle}`).toContain(needle)
    })
  }

  it('escalation threshold is config-driven with a fallback (0077)', () => {
    // 0077 replaced the hardcoded ">= 3" with a config lookup. Guard both the
    // lookup and the comparison so a regression to a magic number is caught.
    expect(sql).toContain('get_config_number')
    expect(sql).toMatch(/v_new_decline_count >= v_threshold/)
  })

  it('runs as SECURITY DEFINER (RLS would otherwise block the cross-row writes)', () => {
    expect(sql).toContain('security definer')
  })
})
