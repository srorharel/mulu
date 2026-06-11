import { describe, it, expect } from 'vitest'
import { latestMigrationDefining, normalize } from './helpers/migrations.js'
import { applyFirstWashDiscount, FIRST_WASH_DISCOUNT_PERCENT, PRICING } from '../lib/pricing.js'

// CRITICAL guard — the first-wash discount (ADR-040, migration 0111).
//
// The discount is applied server-side inside validate_order_prices (client
// prices are never trusted), so nothing in the UI test suite exercises it.
// This pins the LATEST validate_order_prices definition: eligibility rules,
// the 30% amount, and the platform-absorbs invariant (washer base untouched)
// must not regress unnoticed.

const { file, sql: fullSql, body } = latestMigrationDefining('validate_order_prices')
const sql = normalize(body)
const migration = normalize(fullSql)

const REQUIRED_RULES = [
  ['discount rate is 30%',
    'new.discount_percent := 30'],
  ['discount amount derived from total_price at 0.30',
    'round((new.total_price * 0.30)::numeric, 2)'],
  ['total_price reduced by the discount',
    'new.total_price := new.total_price - new.discount_amount'],
  ['platform absorbs the discount (fee shrinks, base_price untouched)',
    'new.platform_fee := new.platform_fee - new.discount_amount'],
  ['only consumers with NO prior non-cancelled order are eligible',
    "and o.status <> 'cancelled'"],
  ['eligibility scoped to the inserting consumer',
    'o.consumer_id = new.consumer_id'],
  ['anonymized/admin rows without a consumer are never discounted',
    'new.consumer_id is not null'],
  ['concurrent first bookings serialized per consumer',
    'pg_advisory_xact_lock'],
  ['non-eligible orders explicitly zeroed (no NULL leakage)',
    'new.discount_percent := 0'],
]

describe(`first-wash discount contract (latest def: ${file})`, () => {
  for (const [rule, needle] of REQUIRED_RULES) {
    it(`enforces: ${rule}`, () => {
      expect(sql, `expected to find: ${needle}`).toContain(needle)
    })
  }

  it('discount columns exist with safe defaults (0111)', () => {
    expect(migration).toContain('add column if not exists discount_percent')
    expect(migration).toContain('add column if not exists discount_amount')
  })

  it('keeps the dual-path pricing (config + hardcoded fallback) intact', () => {
    expect(sql).toContain("get_config_text('pricing_source', 'hardcoded')")
    expect(sql).toContain('from public.pricing_config')
  })
})

describe('client mirror — applyFirstWashDiscount matches SQL ROUND(total * 0.30, 2)', () => {
  it('exports a 30% rate', () => {
    expect(FIRST_WASH_DISCOUNT_PERCENT).toBe(30)
  })

  it.each(Object.entries(PRICING))('%s category', (_cat, { consumer }) => {
    const { total, discount } = applyFirstWashDiscount(consumer)
    expect(discount).toBeCloseTo(Math.round(consumer * 0.30 * 100) / 100, 2)
    expect(total).toBeCloseTo(consumer - discount, 2)
  })

  it('private: 100 → 70', () => {
    expect(applyFirstWashDiscount(100)).toEqual({ total: 70, discount: 30 })
  })
})
