import { describe, it, expect } from 'vitest'
import { latestMigrationDefining, normalize, stripComments } from './helpers/migrations.js'

// CRITICAL guard — the order-status state machine (ADR-024).
//
// The existing transitionOrderStatus.contract.test.js pins only the RPC
// *parameter names*. Nothing pinned the actual allowed-transition matrix or the
// safety gates (geofence, arrival/completion photos, role checks, terminal
// lock, admin-override bypass). This guards the LATEST transition_order_status
// definition's SQL so a future edit can't silently delete a transition rule or
// drop a photo/GPS gate without a test failing.

const { file, body } = latestMigrationDefining('transition_order_status')
const sql = normalize(body)

// Each entry: a human-readable rule + the substring that must appear in the
// (whitespace-normalised, lowercased) function body.
const REQUIRED_RULES = [
  // ── allowed transitions, with the role that may perform them ──────────────
  ['washer: pending → accepted',
    "v_order.status = 'pending' and new_status = 'accepted' and v_actor_role = 'washer'"],
  ['washer: accepted → en_route',
    "v_order.status = 'accepted' and new_status = 'en_route' and v_actor_role = 'washer'"],
  ['washer: en_route → arrived',
    "v_order.status = 'en_route' and new_status = 'arrived' and v_actor_role = 'washer'"],
  ['washer: arrived → in_progress',
    "v_order.status = 'arrived' and new_status = 'in_progress' and v_actor_role = 'washer'"],
  ['washer: in_progress → pending_approval',
    "v_order.status = 'in_progress' and new_status = 'pending_approval'"],
  ['agent: pending_approval → completed',
    "v_order.status = 'pending_approval' and new_status = 'completed' and v_actor_role = 'agent'"],

  // ── safety gates ─────────────────────────────────────────────────────────
  ['accept lockout: washer with an active/pending-approval job is blocked',
    'cannot accept: you have an active or pending-approval job'],
  ['arrival requires a geofence distance check',
    'v_distance_m >'],
  ['arrival rejects when too far from the location',
    'too far from location'],
  ['arrival requires all 4 arrival photos',
    'v_order.arrival_photo_front is null'],
  ['arrival photos required message',
    'arrival photos required'],
  ['submit-for-approval requires all 4 completion photos',
    'v_order.completion_photo_front is null'],
  ['completion photos required message',
    'completion photos required'],

  // ── cancellation scope by role ───────────────────────────────────────────
  ['consumer can only cancel pending/accepted',
    "v_order.status in ('pending', 'accepted') and v_actor_role = 'consumer'"],
  ['washer can only cancel accepted/en_route',
    "v_order.status in ('accepted', 'en_route') and v_actor_role = 'washer'"],
  ['agent can cancel any non-terminal order',
    "v_actor_role = 'agent' and v_order.status not in ('completed', 'cancelled')"],

  // ── admin override (0083; force-stage any-source as of 0101) ─────────────
  ['admin override only for super_admin with p_admin_override',
    "v_is_admin := (p_admin_override is true) and (v_actor_role = 'super_admin')"],
  // 0101 removed the terminal-source block so a super_admin can force a
  // completed/cancelled order back to any stage; the only override gate left is
  // validating the target against the allowed status set.
  ['admin override validates the target against the allowed status set',
    'invalid status:'],

  // ── the catch-all rejection ──────────────────────────────────────────────
  ['unmatched transitions are rejected',
    'if not v_valid then'],
]

describe(`transition_order_status state machine (latest def: ${file})`, () => {
  for (const [rule, needle] of REQUIRED_RULES) {
    it(`enforces: ${rule}`, () => {
      expect(sql, `expected to find: ${needle}`).toContain(needle)
    })
  }

  it('is SECURITY DEFINER and derives the actor role server-side (never trusts caller)', () => {
    expect(sql).toContain('security definer')
    // role comes from profiles keyed on auth.uid() (directly, or via the
    // v_actor_id := auth.uid() local) — never from a caller-supplied argument.
    expect(sql).toContain('select role into v_actor_role from public.profiles where id =')
    expect(sql).toContain('auth.uid()')
  })

  it('keeps the 5th admin-override arg defaulted so 4-arg callers stay valid', () => {
    expect(sql).toMatch(/p_admin_override\s+boolean\s+default\s+false/)
  })

  it('DROP FUNCTION precedes CREATE (arg list changed 4 → 5)', () => {
    const raw = stripComments(latestMigrationDefining('transition_order_status').sql)
    const dropIdx = raw.search(/drop\s+function\s+if\s+exists\s+public\.transition_order_status/i)
    const createIdx = raw.search(/create\s+(or\s+replace\s+)?function\s+public\.transition_order_status/i)
    expect(dropIdx).toBeGreaterThanOrEqual(0)
    expect(createIdx).toBeGreaterThan(dropIdx)
  })
})
