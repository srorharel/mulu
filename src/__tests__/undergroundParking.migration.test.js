import { describe, it, expect } from 'vitest'
import { migrationFiles, readMigration, latestMigrationDefining, normalize } from './helpers/migrations.js'

// ADR-035 guards — parse the SQL directly (no live DB; scripts/verify-db.js
// covers the live assertions). Pins the column + the relaxed transition so a
// future edit can't drop the flag or re-tighten the underground bypass.

describe('0103 — orders.is_underground_parking column', () => {
  const file = migrationFiles().find(f => /^0103_.*underground/.test(f))

  it('migration 0103 exists', () => {
    expect(file).toBeTruthy()
  })

  it('adds is_underground_parking boolean NOT NULL DEFAULT false (idempotent)', () => {
    const sql = normalize(readMigration(file))
    expect(sql).toContain('add column if not exists is_underground_parking boolean not null default false')
  })

  it('adds NO CHECK constraint on the flag (notes-required is enforced client-side)', () => {
    const sql = normalize(readMigration(file))
    expect(sql).not.toMatch(/add\s+constraint[^;]*is_underground_parking/)
  })
})

describe('0104 — transition_order_status underground relaxation', () => {
  const { file, body } = latestMigrationDefining('transition_order_status')
  const sql = normalize(body)

  it('the latest definition of transition_order_status is 0104', () => {
    expect(file).toMatch(/^0104_/)
  })

  it('branches on the order row flag (reads it, not a new argument)', () => {
    expect(sql).toContain('is_underground_parking')
    expect(sql).toContain('if not v_order.is_underground_parking then')
  })

  it('PRESERVES the geofence + GPS + photo gates (relaxation wraps, never removes)', () => {
    // The gates must still exist for non-underground orders.
    expect(sql).toContain('worker location required for arrival')
    expect(sql).toContain('v_distance_m >')
    expect(sql).toContain('too far from location')
    expect(sql).toContain('arrival photos required')        // arrival photos always required
    expect(sql).toContain('completion photos required')     // completion photos always required
    expect(sql).toContain('worker location required to submit for approval')
  })

  it('keeps the 5-arg signature + admin-override branch intact (callers unchanged)', () => {
    expect(sql).toMatch(/p_admin_override\s+boolean\s+default\s+false/)
    expect(sql).toContain('v_is_admin := (p_admin_override is true) and (v_actor_role = \'super_admin\')')
  })

  it('DROP precedes CREATE per migration discipline', () => {
    const raw = readMigration(file).toLowerCase()
    const dropIdx   = raw.search(/drop\s+function\s+if\s+exists\s+public\.transition_order_status/)
    const createIdx = raw.search(/create\s+(or\s+replace\s+)?function\s+public\.transition_order_status/)
    expect(dropIdx).toBeGreaterThanOrEqual(0)
    expect(createIdx).toBeGreaterThan(dropIdx)
  })
})
