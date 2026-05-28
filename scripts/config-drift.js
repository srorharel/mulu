#!/usr/bin/env node
// scripts/config-drift.js
// Compare app_config + pricing_config + payout_tier_config against the
// seeded defaults from migrations 0075 and 0078. Report:
//   1. safe-to-reset   — current value matches the seeded default
//   2. genuine drift   — current value differs from the seeded default
//   3. orphan keys     — key/category/tier is not part of the seed set
//
// Local-only. Reads DATABASE_URL from .env.

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname }          from 'node:path'
import { fileURLToPath }              from 'node:url'
import pkg                            from 'pg'

const { Client } = pkg
const __dir = dirname(fileURLToPath(import.meta.url))

function parseEnv() {
  const envPath = resolve(__dir, '..', '.env')
  if (!existsSync(envPath)) { console.error('  ✗  .env not found'); process.exit(1) }
  return Object.fromEntries(
    readFileSync(envPath, 'utf8').split('\n').map(l => l.trim())
      .filter(l => l && !l.startsWith('#') && l.includes('='))
      .map(l => {
        const eq = l.indexOf('=')
        return [l.slice(0, eq).trim(), l.slice(eq + 1).replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '')]
      })
  )
}

const env = parseEnv()
if (!env.DATABASE_URL) { console.error('  ✗  DATABASE_URL missing'); process.exit(1) }

// MUST stay in sync with admin-app/src/lib/seededDefaults.js
// and supabase/migrations/0075_app_config.sql + 0078_pricing_payout_from_config.sql.
const APP_CONFIG_DEFAULTS = {
  nearby_job_radius_meters:    15000,
  arrival_geofence_meters:     100,
  decline_auto_escalate_count: 3,
  rating_gate_jobs:            3,
  signed_url_ttl_seconds:      600,
  pricing_source:              'hardcoded',
}
const PRICING_CONFIG_DEFAULTS = [
  { category: 'private', consumer_price: 100, worker_price: 60, platform_fee: 40 },
  { category: 'jeep',    consumer_price: 120, worker_price: 80, platform_fee: 40 },
  { category: 'pickup',  consumer_price: 130, worker_price: 90, platform_fee: 40 },
]
const PAYOUT_TIER_DEFAULTS = [
  { tier: 1, payout: 40 }, { tier: 2, payout: 45 }, { tier: 3, payout: 50 },
  { tier: 4, payout: 55 }, { tier: 5, payout: 60 },
]

const client = new Client({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
})
await client.connect()

const cfg     = (await client.query(`SELECT key, value, value_type, updated_at FROM public.app_config ORDER BY key`)).rows
const pricing = (await client.query(`SELECT category, consumer_price, worker_price, platform_fee, updated_at FROM public.pricing_config ORDER BY category`)).rows
const payouts = (await client.query(`SELECT tier, payout, updated_at FROM public.payout_tier_config ORDER BY tier`)).rows

await client.end()

console.log(`\n── app_config / pricing_config / payout_tier_config drift ───`)
console.log(`   ${cfg.length} app_config rows · ${pricing.length} pricing rows · ${payouts.length} payout rows\n`)

// ── app_config ───────────────────────────────────────────────────────────────
const cfgSafe = [], cfgDrift = [], cfgOrphan = []
for (const r of cfg) {
  const def = APP_CONFIG_DEFAULTS[r.key]
  const live = r.value?.value
  if (def === undefined) cfgOrphan.push({ key: r.key, value: live })
  else if (typeof def === 'number' ? Number(live) === def : String(live) === def) cfgSafe.push({ key: r.key, value: live })
  else cfgDrift.push({ key: r.key, def, value: live })
}

console.log(`▌ app_config — at seeded default (${cfgSafe.length})`)
if (cfgSafe.length === 0) console.log('   (none)')
for (const r of cfgSafe) console.log(`   ${r.key} = ${JSON.stringify(r.value)}`)

console.log(`\n▌ app_config — DRIFT from seed (${cfgDrift.length})`)
if (cfgDrift.length === 0) console.log('   (none)')
for (const r of cfgDrift) {
  console.log(`   ${r.key}`)
  console.log(`     seed:  ${JSON.stringify(r.def)}`)
  console.log(`     live:  ${JSON.stringify(r.value)}`)
}

console.log(`\n▌ app_config — orphan keys (${cfgOrphan.length})`)
if (cfgOrphan.length === 0) console.log('   (none)')
for (const r of cfgOrphan) console.log(`   ${r.key} = ${JSON.stringify(r.value)}`)

// ── pricing_config ──────────────────────────────────────────────────────────
console.log(`\n▌ pricing_config — diff vs seed`)
const liveCats = new Set(pricing.map(r => r.category))
const seedCats = new Set(PRICING_CONFIG_DEFAULTS.map(r => r.category))
for (const r of pricing) {
  const def = PRICING_CONFIG_DEFAULTS.find(d => d.category === r.category)
  if (!def) {
    console.log(`   ORPHAN  ${r.category}  ${r.consumer_price}/${r.worker_price}/${r.platform_fee}`)
    continue
  }
  const same =
    Number(r.consumer_price) === def.consumer_price &&
    Number(r.worker_price)   === def.worker_price &&
    Number(r.platform_fee)   === def.platform_fee
  if (same) console.log(`   DEFAULT ${r.category}  ${r.consumer_price}/${r.worker_price}/${r.platform_fee}`)
  else      console.log(`   DRIFT   ${r.category}  live ${r.consumer_price}/${r.worker_price}/${r.platform_fee}  seed ${def.consumer_price}/${def.worker_price}/${def.platform_fee}`)
}
for (const def of PRICING_CONFIG_DEFAULTS) {
  if (!liveCats.has(def.category)) console.log(`   MISSING ${def.category}  (seed: ${def.consumer_price}/${def.worker_price}/${def.platform_fee})  ← validate_order_prices falls through to hardcoded`)
}
void seedCats

// ── payout_tier_config ──────────────────────────────────────────────────────
console.log(`\n▌ payout_tier_config — diff vs seed`)
const liveTiers = new Set(payouts.map(r => r.tier))
for (const r of payouts) {
  const def = PAYOUT_TIER_DEFAULTS.find(d => d.tier === r.tier)
  if (!def) {
    console.log(`   ORPHAN  tier ${r.tier}  ${r.payout}`)
    continue
  }
  const same = Number(r.payout) === def.payout
  if (same) console.log(`   DEFAULT tier ${r.tier}  ${r.payout}`)
  else      console.log(`   DRIFT   tier ${r.tier}  live ${r.payout}  seed ${def.payout}`)
}
for (const def of PAYOUT_TIER_DEFAULTS) {
  if (!liveTiers.has(def.tier)) console.log(`   MISSING tier ${def.tier}  (seed payout: ${def.payout})  ← payout_for_tier falls through to hardcoded`)
}

console.log('\n')
