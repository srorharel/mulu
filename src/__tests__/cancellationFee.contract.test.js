import { describe, it, expect } from 'vitest'
import { latestMigrationDefining, normalize } from './helpers/migrations.js'
import { cancellationFeeFor, CANCELLATION_FEE_ILS } from '../lib/pricing.js'

// CRITICAL guard — consumer cancellation fee (Consumer Terms §7.2, migration 0116).
//
// transition_order_status is the highest-risk function in the repo; 0116 reproduces
// 0104 verbatim plus the cancellation changes. This pins BOTH the new fee rules AND
// a sample of the surrounding branches, so a future redefinition can't silently drop
// the fee — or, just as bad, drop one of the reproduced state-machine branches.

const { file, sql: fullSql, body } = latestMigrationDefining('transition_order_status')
const fn        = normalize(body)
const migration = normalize(fullSql)

const FEE_RULES = [
  ['consumers may cancel from pending/accepted/en_route/arrived',
    "if v_order.status in ('pending', 'accepted', 'en_route', 'arrived') and v_actor_role = 'consumer'"],
  ['fee only applies when cancelling from en_route/arrived',
    "v_order.status in ('en_route', 'arrived')"],
  ['fixed 50 ₪ fee from config, capped at the order total',
    "least(public.get_config_number('cancellation_fee_ils', 50), v_order.total_price)"],
  ['fee is written onto the cancelled order',
    'cancellation_fee = case when new_status = \'cancelled\' then v_cancel_fee'],
]

const PRESERVED_BRANCHES = [
  ['admin override branch intact',           '(p_admin_override is true)'],
  ['underground relaxation intact',          'is_underground_parking'],
  ['config-driven arrival geofence intact',  "get_config_number('arrival_geofence_meters', 100)"],
  ['washer self-cancel branch intact',       "v_order.status in ('accepted', 'en_route') and v_actor_role = 'washer'"],
  ['order_events audit insert intact',       'insert into public.order_events'],
]

describe(`cancellation-fee contract (latest def: ${file})`, () => {
  for (const [rule, needle] of FEE_RULES) {
    it(`enforces: ${rule}`, () => {
      expect(fn, `expected to find: ${needle}`).toContain(normalize(needle))
    })
  }

  for (const [rule, needle] of PRESERVED_BRANCHES) {
    it(`preserves: ${rule}`, () => {
      expect(fn, `expected to find: ${needle}`).toContain(normalize(needle))
    })
  }

  it('adds cancellation_fee column with a safe default', () => {
    expect(migration).toContain('add column if not exists cancellation_fee')
  })
})

describe('client mirror — cancellationFeeFor', () => {
  it('exports a 50 ₪ fee', () => {
    expect(CANCELLATION_FEE_ILS).toBe(50)
  })
  it('charges nothing while pending/accepted', () => {
    expect(cancellationFeeFor('pending', 100)).toBe(0)
    expect(cancellationFeeFor('accepted', 100)).toBe(0)
  })
  it('charges 50 once en_route/arrived', () => {
    expect(cancellationFeeFor('en_route', 100)).toBe(50)
    expect(cancellationFeeFor('arrived', 120)).toBe(50)
  })
  it('never exceeds the order total', () => {
    expect(cancellationFeeFor('en_route', 30)).toBe(30)
  })
})
