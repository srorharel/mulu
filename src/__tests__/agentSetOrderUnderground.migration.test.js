import { describe, it, expect } from 'vitest'
import { latestMigrationDefining, normalize } from './helpers/migrations.js'

// ADR-035 (agent control): pins the SECURITY DEFINER + is_agent() gate and the
// terminal-order block on agent_set_order_underground (migration 0105).

describe('0105 — agent_set_order_underground', () => {
  const { file, body } = latestMigrationDefining('agent_set_order_underground')
  const sql = normalize(body)

  it('is defined in migration 0105', () => {
    expect(file).toMatch(/^0105_/)
  })

  it('is SECURITY DEFINER and gated on is_agent()', () => {
    expect(sql).toContain('security definer')
    expect(sql).toContain('if not public.is_agent() then')
  })

  it('refuses to change the flag on a terminal order', () => {
    expect(sql).toContain("v_status in ('completed', 'cancelled')")
  })

  it('updates is_underground_parking from the boolean argument', () => {
    expect(sql).toContain('set is_underground_parking = coalesce(p_value, false)')
  })

  it('is granted to authenticated', () => {
    const raw = latestMigrationDefining('agent_set_order_underground').sql.toLowerCase()
    expect(raw).toMatch(/grant execute on function public\.agent_set_order_underground\(uuid, boolean\) to authenticated/)
  })
})
