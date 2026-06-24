import { describe, it, expect } from 'vitest'
import { migrationFiles, readMigration, normalize } from './helpers/migrations.js'

// Pins the partial unique index that enforces "one PAID active wash per (consumer,
// plate)" — a consumer can't open a second wash on the same vehicle while a paid one
// is in flight. Originally 0131; 0132 added the `paid_at` predicate so unpaid
// (abandoned-checkout) drafts no longer falsely block re-booking.

function migrationDefiningIndex(indexName) {
  // The latest migration that CREATEs the index wins (a later one may recreate it).
  const re = new RegExp(`create\\s+unique\\s+index[^;]*${indexName}`, 'i')
  const file = migrationFiles().filter(f => re.test(readMigration(f))).pop()
  if (!file) throw new Error(`No migration creates index ${indexName}`)
  return { file, sql: readMigration(file) }
}

describe('uniq_active_order_per_vehicle (paid-gated, 0132)', () => {
  const { file, sql } = migrationDefiningIndex('uniq_active_order_per_vehicle')
  const norm = normalize(sql)

  it('latest definition is migration 0132', () => {
    expect(file).toMatch(/^0132_/)
  })

  it('is a UNIQUE index on orders(consumer_id, car_plate)', () => {
    expect(norm).toContain('create unique index')
    expect(norm).toMatch(/on public\.orders \(consumer_id, car_plate\)/)
  })

  it('only constrains LIVE orders (excludes terminal completed/cancelled)', () => {
    expect(norm).toContain("status not in ('completed', 'cancelled')")
  })

  it('only counts PAID orders (paid_at predicate) so unpaid drafts do not block', () => {
    expect(norm).toContain('paid_at is not null')
  })

  it('only applies when a plate is present (NULL plates excluded)', () => {
    expect(norm).toContain('car_plate is not null')
  })

  it('is idempotent (IF NOT EXISTS) so re-running the migration is safe', () => {
    expect(norm).toContain('create unique index if not exists')
  })
})
