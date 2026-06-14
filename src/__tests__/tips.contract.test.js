import { describe, it, expect } from 'vitest'
import { latestMigrationDefining, normalize } from './helpers/migrations.js'

// CRITICAL guard — consumer tips (Washer Terms §6.7, migration 0117).
//
// The legal requirement is that the tip is logged SEPARATELY from the base/wash
// price so the later VAT logic can treat it on its own. This pins that separation
// (tip_amount is its own column; add_order_tip never touches total_price) plus the
// consumer-only / completed-only write guards.

const { file, sql: fullSql, body } = latestMigrationDefining('add_order_tip')
const fn        = normalize(body)
const migration = normalize(fullSql)

describe(`tips contract (latest def: ${file})`, () => {
  it('adds tip_amount as its own column with a safe default', () => {
    expect(migration).toContain('add column if not exists tip_amount')
    expect(migration).toContain('add column if not exists tip_added_at')
  })

  it('adds washer_tax_status for later tip-VAT handling', () => {
    expect(migration).toContain('washer_tax_status')
    expect(migration).toContain("in ('osek_murshe', 'osek_patur', 'osek_zair')")
  })

  it('tip is separated from the wash price — add_order_tip never touches total_price', () => {
    expect(fn).toContain('tip_amount = round(p_amount::numeric, 2)')
    expect(fn).toContain('tip_added_at = now()')
    expect(fn).not.toContain('total_price')
    expect(fn).not.toContain('base_price')
  })

  it('only the order owner can tip', () => {
    expect(fn).toContain('v_order.consumer_id <> v_uid')
  })

  it('only completed orders can be tipped', () => {
    expect(fn).toContain("v_order.status <> 'completed'")
  })

  it('rejects non-positive and oversized amounts', () => {
    expect(fn).toContain('p_amount <= 0')
    expect(fn).toContain('p_amount > 1000')
  })
})
