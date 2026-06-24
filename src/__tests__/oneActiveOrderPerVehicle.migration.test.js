import { describe, it, expect } from 'vitest'
import { migrationFiles, readMigration, normalize } from './helpers/migrations.js'

// Pins the partial unique index that enforces "one live order per (consumer,
// plate)" — a consumer can't open a second order on the same vehicle until the
// current one finishes (terminal = completed/cancelled). Migration 0131.

function migrationDefiningIndex(indexName) {
  const re = new RegExp(`create\\s+unique\\s+index[^;]*${indexName}`, 'i')
  const file = migrationFiles().filter(f => re.test(readMigration(f))).pop()
  if (!file) throw new Error(`No migration creates index ${indexName}`)
  return { file, sql: readMigration(file) }
}

describe('0131 — uniq_active_order_per_vehicle', () => {
  const { file, sql } = migrationDefiningIndex('uniq_active_order_per_vehicle')
  const norm = normalize(sql)

  it('is defined in migration 0131', () => {
    expect(file).toMatch(/^0131_/)
  })

  it('is a UNIQUE index on orders(consumer_id, car_plate)', () => {
    expect(norm).toContain('create unique index')
    expect(norm).toMatch(/on public\.orders \(consumer_id, car_plate\)/)
  })

  it('only constrains LIVE orders (excludes terminal completed/cancelled)', () => {
    expect(norm).toContain("status not in ('completed', 'cancelled')")
  })

  it('only applies when a plate is present (NULL plates excluded)', () => {
    expect(norm).toContain('car_plate is not null')
  })

  it('is idempotent (IF NOT EXISTS) so re-running the migration is safe', () => {
    expect(norm).toContain('create unique index if not exists')
  })
})
