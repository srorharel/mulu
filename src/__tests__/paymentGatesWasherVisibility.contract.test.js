import { describe, it, expect } from 'vitest'
import {
  latestMigrationDefining,
  migrationFiles,
  readMigration,
  normalize,
} from './helpers/migrations.js'

// Contract guard (ADR-042/043, migration 0130): an order must NOT be offered to
// washers until it is PAID. orders.paid_at is the gate — set only server-side by a
// verified charge. Every washer-visibility surface must require it. A future edit
// that drops the paid_at predicate would silently let unpaid orders back into the
// pool (the exact bug 0130 fixed), so pin it in CI here.

// Latest migration whose text CREATEs the named policy (RLS policies aren't
// functions, so latestMigrationDefining can't find them).
function latestPolicy(policyName) {
  const re = new RegExp(`create\\s+policy\\s+"${policyName}"`, 'i')
  const matches = migrationFiles().filter((f) => re.test(readMigration(f)))
  if (matches.length === 0) throw new Error(`No migration creates policy "${policyName}"`)
  const file = matches[matches.length - 1]
  return { file, body: normalize(readMigration(file)) }
}

describe('washer-visibility is gated on payment (orders.paid_at)', () => {
  it('nearby_jobs returns only paid orders', () => {
    const { body } = latestMigrationDefining('nearby_jobs')
    expect(normalize(body)).toContain('paid_at is not null')
  })

  it('the washer read RLS requires paid_at', () => {
    const { body } = latestPolicy('orders: washer read pending')
    expect(body).toContain('paid_at is not null')
  })

  it('the washer accept (update) RLS requires paid_at', () => {
    const { body } = latestPolicy('orders: washer update assigned')
    // The accept branch (pending + unassigned) must also require payment.
    expect(body).toMatch(/status = 'pending' and washer_id is null and paid_at is not null/)
  })

  it('the "new job nearby" push fires on payment, not on insert', () => {
    // notify_on_order_paid only fans out for a paid, still-pending order.
    const { body } = latestMigrationDefining('notify_on_order_paid')
    expect(normalize(body)).toContain('new.paid_at is null or new.status <> \'pending\'')
  })
})
