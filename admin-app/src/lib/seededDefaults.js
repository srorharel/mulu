// Seeded defaults from supabase/migrations/0075_app_config.sql and
// supabase/migrations/0078_pricing_payout_from_config.sql.
//
// MUST stay in sync with those migration files. The drift report
// (scripts/config-drift.js) duplicates these constants verbatim — if you
// change a seed value, change both places + the migration.

export const APP_CONFIG_DEFAULTS = {
  nearby_job_radius_meters:    15000,
  arrival_geofence_meters:     100,
  decline_auto_escalate_count: 3,
  rating_gate_jobs:            3,
  signed_url_ttl_seconds:      600,
  pricing_source:              'hardcoded',
}

export const PRICING_CONFIG_DEFAULTS = [
  { category: 'private', consumer_price: 100, worker_price: 60, platform_fee: 40 },
  { category: 'jeep',    consumer_price: 120, worker_price: 80, platform_fee: 40 },
  { category: 'pickup',  consumer_price: 130, worker_price: 90, platform_fee: 40 },
]

export const PAYOUT_TIER_DEFAULTS = [
  { tier: 1, payout: 40 },
  { tier: 2, payout: 45 },
  { tier: 3, payout: 50 },
  { tier: 4, payout: 55 },
  { tier: 5, payout: 60 },
]

export function appConfigIsDefault(key, value) {
  const def = APP_CONFIG_DEFAULTS[key]
  if (def === undefined) return false  // unknown key — flag as override
  // Coerce numeric strings so '15000' and 15000 compare equal.
  if (typeof def === 'number') return Number(value) === def
  return String(value) === def
}

export function pricingRowIsDefault(row) {
  const def = PRICING_CONFIG_DEFAULTS.find(d => d.category === row.category)
  if (!def) return false
  return Number(row.consumer_price) === def.consumer_price
      && Number(row.worker_price)   === def.worker_price
      && Number(row.platform_fee)   === def.platform_fee
}

export function payoutRowIsDefault(row) {
  const def = PAYOUT_TIER_DEFAULTS.find(d => d.tier === row.tier)
  if (!def) return false
  return Number(row.payout) === def.payout
}
