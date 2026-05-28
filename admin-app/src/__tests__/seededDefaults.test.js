import { describe, it, expect } from 'vitest'
import {
  APP_CONFIG_DEFAULTS,
  PRICING_CONFIG_DEFAULTS,
  PAYOUT_TIER_DEFAULTS,
  appConfigIsDefault,
  pricingRowIsDefault,
  payoutRowIsDefault,
} from '../lib/seededDefaults.js'

describe('seededDefaults', () => {
  it('exports the full seeded app_config from migration 0075', () => {
    expect(APP_CONFIG_DEFAULTS).toEqual({
      nearby_job_radius_meters:    15000,
      arrival_geofence_meters:     100,
      decline_auto_escalate_count: 3,
      rating_gate_jobs:            3,
      signed_url_ttl_seconds:      600,
      pricing_source:              'hardcoded',
    })
  })

  it('exports the seeded pricing categories from migration 0078', () => {
    expect(PRICING_CONFIG_DEFAULTS).toEqual([
      { category: 'private', consumer_price: 100, worker_price: 60, platform_fee: 40 },
      { category: 'jeep',    consumer_price: 120, worker_price: 80, platform_fee: 40 },
      { category: 'pickup',  consumer_price: 130, worker_price: 90, platform_fee: 40 },
    ])
  })

  it('exports the seeded payout tiers from migration 0078', () => {
    expect(PAYOUT_TIER_DEFAULTS).toEqual([
      { tier: 1, payout: 40 }, { tier: 2, payout: 45 }, { tier: 3, payout: 50 },
      { tier: 4, payout: 55 }, { tier: 5, payout: 60 },
    ])
  })

  it('appConfigIsDefault: number compare across string/number forms', () => {
    expect(appConfigIsDefault('arrival_geofence_meters', 100)).toBe(true)
    expect(appConfigIsDefault('arrival_geofence_meters', '100')).toBe(true)
    expect(appConfigIsDefault('arrival_geofence_meters', 150)).toBe(false)
  })

  it('appConfigIsDefault: string compare for pricing_source', () => {
    expect(appConfigIsDefault('pricing_source', 'hardcoded')).toBe(true)
    expect(appConfigIsDefault('pricing_source', 'config')).toBe(false)
  })

  it('appConfigIsDefault: unknown keys are not "default" (flag them)', () => {
    expect(appConfigIsDefault('mystery_knob', 42)).toBe(false)
  })

  it('pricingRowIsDefault: exact match per category', () => {
    expect(pricingRowIsDefault({ category: 'private', consumer_price: 100, worker_price: 60, platform_fee: 40 })).toBe(true)
    expect(pricingRowIsDefault({ category: 'jeep',    consumer_price: 999, worker_price: 80, platform_fee: 40 })).toBe(false)
    expect(pricingRowIsDefault({ category: 'unknown', consumer_price: 100, worker_price: 60, platform_fee: 40 })).toBe(false)
  })

  it('payoutRowIsDefault: exact match per tier', () => {
    expect(payoutRowIsDefault({ tier: 1, payout: 40 })).toBe(true)
    expect(payoutRowIsDefault({ tier: 1, payout: 99 })).toBe(false)
    expect(payoutRowIsDefault({ tier: 99, payout: 40 })).toBe(false)
  })
})
