#!/usr/bin/env node
// scripts/verify-db.js
// Connects to the database and verifies that migrations + seed data are correct.
// Usage: node scripts/verify-db.js   (or: npm run db:verify)

import { readFileSync, existsSync } from 'node:fs'
import { resolve }                  from 'node:path'
import pkg                          from 'pg'

const { Client } = pkg

// ── Parse .env ────────────────────────────────────────────────────────────────

function parseEnv() {
  const envPath = resolve(process.cwd(), '.env')
  if (!existsSync(envPath)) {
    console.error('\n  ✗  .env not found — run: cp .env.example .env\n')
    process.exit(1)
  }
  return Object.fromEntries(
    readFileSync(envPath, 'utf8')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#') && l.includes('='))
      .map(l => {
        const eq  = l.indexOf('=')
        const val = l.slice(eq + 1).replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '')
        return [l.slice(0, eq).trim(), val]
      })
  )
}

const env   = parseEnv()
const dbUrl = env.DATABASE_URL

if (!dbUrl) {
  console.error('\n  ✗  DATABASE_URL is missing from .env\n')
  process.exit(1)
}

// ── Connect ───────────────────────────────────────────────────────────────────

const isLocal = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1')
const client  = new Client({
  connectionString: dbUrl,
  ssl: isLocal ? false : { rejectUnauthorized: false },
})

try {
  await client.connect()
} catch (err) {
  console.error(`\n  ✗  Could not connect: ${err.message}\n`)
  process.exit(1)
}

// ── Checker helpers ───────────────────────────────────────────────────────────

let allPassed = true

function pass(label) { console.log(`  ✅  ${label}`) }
function fail(label, detail = '') {
  console.error(`  ❌  ${label}${detail ? `  (${detail})` : ''}`)
  allPassed = false
}

async function q(sql, params = []) {
  const res = await client.query(sql, params)
  return res.rows
}

// ── 1. Schema checks ──────────────────────────────────────────────────────────

console.log('\n── Tables & RLS ─────────────────────────────────────────────')

const tables = await q(`
  SELECT tablename, rowsecurity
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN ('profiles', 'orders', 'order_events')
  ORDER BY tablename
`)

for (const expected of ['order_events', 'orders', 'profiles']) {
  const row = tables.find(r => r.tablename === expected)
  if (!row)
    fail(`Table public.${expected}`, 'not found — run migrations')
  else if (!row.rowsecurity)
    fail(`Table public.${expected}`, 'RLS is OFF — check 0002_rls.sql')
  else
    pass(`Table public.${expected}  (RLS enabled)`)
}

// ── 2. Functions ──────────────────────────────────────────────────────────────

console.log('\n── Functions ────────────────────────────────────────────────')

const funcs = await q(`
  SELECT p.proname
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('nearby_jobs', 'transition_order_status', 'validate_order_prices')
`)

const funcNames = new Set(funcs.map(r => r.proname))
for (const fn of ['nearby_jobs', 'transition_order_status', 'validate_order_prices']) {
  if (funcNames.has(fn)) pass(fn)
  else                   fail(fn, 'not found — check 0003_functions.sql')
}

// ── 3. Trigger ────────────────────────────────────────────────────────────────

console.log('\n── Triggers ─────────────────────────────────────────────────')

const triggers = await q(`
  SELECT t.tgname
  FROM pg_trigger t
  JOIN pg_class c     ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname  = 'orders'
    AND t.tgname   = 'orders_validate_prices'
    AND NOT t.tgisinternal
`)

if (triggers.length > 0) pass('orders_validate_prices trigger on public.orders')
else                      fail('orders_validate_prices trigger on public.orders', 'not found — check 0003_functions.sql')

// ── 4. Seed data ──────────────────────────────────────────────────────────────

console.log('\n── Seed data ────────────────────────────────────────────────')

// auth.users — look for the 5 specific seed emails
const seedEmails = [
  'consumer1@test.dev', 'consumer2@test.dev',
  'washer1@test.dev',   'washer2@test.dev',   'washer3@test.dev',
]
const authRows = await q(
  `SELECT COUNT(*)::int AS count FROM auth.users WHERE email = ANY($1)`,
  [seedEmails]
)
const authCount = authRows[0].count
if (authCount === 5) pass(`auth.users: ${authCount}/5 seed accounts found`)
else                 fail(`auth.users: only ${authCount}/5 seed emails present`, 'run npm run db:migrate to re-seed')

// profiles
const profileRows = await q(`
  SELECT COUNT(*)::int AS count FROM public.profiles
  WHERE id = ANY($1)
`, [[
  '11111111-0000-0000-0000-000000000001',
  '22222222-0000-0000-0000-000000000002',
  '33333333-0000-0000-0000-000000000003',
  '44444444-0000-0000-0000-000000000004',
  '55555555-0000-0000-0000-000000000005',
]])
const profileCount = profileRows[0].count
if (profileCount === 5) pass(`profiles: ${profileCount}/5 seed profiles found`)
else                    fail(`profiles: only ${profileCount}/5 seed profiles present`, 'handle_new_user trigger may not have fired')

// orders — count + price validation proof
const orderRows = await q(`
  SELECT
    COUNT(*)::int                                                       AS total,
    COUNT(*) FILTER (WHERE base_price > 0 AND total_price > 0)::int    AS with_valid_prices
  FROM public.orders
  WHERE id = ANY($1)
`, [[
  'aa000000-0000-0000-0000-000000000001',
  'aa000000-0000-0000-0000-000000000002',
  'aa000000-0000-0000-0000-000000000003',
]])
const { total, with_valid_prices } = orderRows[0]

if (total === 3) pass(`orders: ${total}/3 seed orders found`)
else             fail(`orders: only ${total}/3 seed orders present`)

if (with_valid_prices === total && total > 0)
  pass(`Price trigger: all ${total} orders have base_price > 0  (validate_order_prices fired)`)
else
  fail(`Price trigger: only ${with_valid_prices}/${total} orders have valid prices`, 'trigger may not have run')

// ── 5. Feature columns (0004_features.sql) ───────────────────────────────────

console.log('\n── Feature columns ──────────────────────────────────────────')

const EXPECTED_COLS = [
  'key_location', 'site_has_water', 'site_has_power',
  'addon_wiper_fluid', 'addon_tire_pressure',
  'evidence_wash_path', 'evidence_wiper_fluid_path', 'evidence_tire_pressure_path',
  // 0066 / 0067 — required by support-app Approvals query
  'decline_count',
]

const colRows = await q(`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'orders'
    AND column_name = ANY($1)
`, [EXPECTED_COLS])

const colNames = new Set(colRows.map(r => r.column_name))
for (const col of EXPECTED_COLS) {
  if (colNames.has(col)) pass(`orders.${col}`)
  else                   fail(`orders.${col}`, 'missing — run npm run db:migrate')
}

// ── 6. nearby_jobs return shape (regression guard for 0066 rewrite) ─────────
//
// The 0066 redeclaration originally dropped lat/lng from the RETURNS TABLE,
// which would have killed pending-job pins on the washer map (WorkerMap.jsx
// reads job.lat / job.lng off these rows). Assert lat & lng stay in the
// return contract so a future rewrite can't quietly remove them again.

console.log('\n── nearby_jobs return shape ─────────────────────────────────')

const nearbyJobsReturn = await q(`
  SELECT pg_get_function_result(p.oid) AS returns
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public'
    AND  p.proname = 'nearby_jobs'
`)

if (nearbyJobsReturn.length === 0) {
  fail('nearby_jobs function', 'not found')
} else {
  const ret = nearbyJobsReturn[0].returns
  if (/\blat double precision\b/.test(ret)) pass('nearby_jobs returns lat')
  else                                       fail('nearby_jobs returns lat', 'lat column dropped from RETURNS — WorkerMap pins will break')
  if (/\blng double precision\b/.test(ret)) pass('nearby_jobs returns lng')
  else                                       fail('nearby_jobs returns lng', 'lng column dropped from RETURNS — WorkerMap pins will break')
}

// ── 7f. pg_net wiring on http_post-using functions (0080) ────────────────────
//
// Regression: trigger_broadcast (0074) called pg_net.http_post which fails
// at execution because pg_net is the EXTENSION name; the symbols live in
// the `net` schema. This block asserts the right wiring stays in place.

console.log('\n── pg_net wiring ────────────────────────────────────────────')

const pgnet = await q(`SELECT extname FROM pg_extension WHERE extname = 'pg_net'`)
if (pgnet.length > 0) pass('pg_net extension installed')
else                  fail('pg_net extension', 'not installed — enable in Supabase dashboard')

const netSchema = await q(`SELECT 1 FROM pg_namespace WHERE nspname = 'net'`)
if (netSchema.length > 0) pass(`net schema exists (where pg_net's http_post lives)`)
else                       fail('net schema', 'missing — pg_net install may be incomplete')

const httpPostSchemas = await q(`
  SELECT n.nspname AS schema FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'http_post'
`)
const schemas = httpPostSchemas.map(r => r.schema)
if (schemas.includes('net')) pass(`net.http_post is callable`)
else                          fail('net.http_post', `not found — http_post schemas: ${schemas.join(', ') || 'none'}`)

// Any public function that uses http_post must reference it as net.http_post
// (not pg_net.http_post, not unqualified) AND must include `net` in its
// search_path.
// prokind = 'f' filters out aggregates and window functions —
// pg_get_functiondef raises an error on those.
const httpUsers = await q(`
  SELECT p.proname, pg_get_functiondef(p.oid) AS body
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND pg_get_functiondef(p.oid) ILIKE '%http_post%'
`)
for (const fn of httpUsers) {
  const usesWrong = /\bpg_net\.http_post\b/.test(fn.body)
  const usesRight = /\bnet\.http_post\b/.test(fn.body)
  const inPath    = /SET\s+search_path[^;]*\bnet\b/i.test(fn.body)

  if (usesWrong) fail(`${fn.proname}`, 'calls pg_net.http_post — must be net.http_post')
  else if (!usesRight) fail(`${fn.proname}`, 'calls http_post unqualified — must be net.http_post')
  else pass(`${fn.proname} calls net.http_post`)

  if (!inPath) fail(`${fn.proname} search_path`, 'missing `net` in SET search_path — function relies on caller path')
  else         pass(`${fn.proname} sets search_path to include net`)
}

// trigger_broadcast + notify_send must both exist + match the above.
const required = ['trigger_broadcast', 'notify_send']
const found = new Set(httpUsers.map(f => f.proname))
for (const fn of required) {
  if (!found.has(fn)) fail(`${fn} in pg_net checks`, 'function missing — should call http_post')
}

// ── 7e. App config + pricing/payout parity (0075–0078) ───────────────────────

console.log('\n── app_config / pricing parity ──────────────────────────────')

const cfgTable = await q(`SELECT rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename='app_config'`)
if (cfgTable.length === 0) fail('public.app_config', 'table missing')
else if (!cfgTable[0].rowsecurity) fail('public.app_config', 'RLS disabled')
else pass('public.app_config exists, RLS enabled')

const cfgPolicies = await q(`SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='app_config'`)
if (cfgPolicies.find(p => p.policyname === 'app_config anon read')) pass('app_config: anon SELECT policy')
else                                                                  fail('app_config: anon SELECT policy', 'missing')
if (cfgPolicies.find(p => p.policyname === 'app_config super_admin write')) pass('app_config: super_admin write policy')
else                                                                          fail('app_config: super_admin write policy', 'missing')

// Seed presence + values
const cfgSeed = await q(`SELECT key, value FROM public.app_config ORDER BY key`)
const cfgMap = Object.fromEntries(cfgSeed.map(r => [r.key, r.value]))
const EXPECTED_CONFIG = {
  nearby_job_radius_meters:    15000,
  arrival_geofence_meters:     100,
  decline_auto_escalate_count: 3,
  rating_gate_jobs:            3,
  signed_url_ttl_seconds:      600,
}
for (const [k, v] of Object.entries(EXPECTED_CONFIG)) {
  const actual = cfgMap[k]?.value
  if (Number(actual) === v) pass(`app_config.${k} seeded to ${v}`)
  else                       fail(`app_config.${k}`, `expected ${v}, got ${JSON.stringify(actual)}`)
}
const sourceVal = cfgMap.pricing_source?.value
if (sourceVal === 'hardcoded') pass(`app_config.pricing_source seeded 'hardcoded' (flip-by-human)`)
else                            fail(`app_config.pricing_source`, `expected 'hardcoded', got ${JSON.stringify(sourceVal)}`)

// pricing_config seed values match the historical hardcoded ones from 0024.
const EXPECTED_PRICING = [
  ['private', 100, 60, 40],
  ['jeep',    120, 80, 40],
  ['pickup',  130, 90, 40],
]
for (const [cat, cp, wp, pf] of EXPECTED_PRICING) {
  const rows = await q(`SELECT consumer_price, worker_price, platform_fee FROM public.pricing_config WHERE category=$1`, [cat])
  if (rows.length === 0) { fail(`pricing_config[${cat}]`, 'row missing'); continue }
  const r = rows[0]
  if (Number(r.consumer_price) === cp && Number(r.worker_price) === wp && Number(r.platform_fee) === pf)
    pass(`pricing_config[${cat}] = consumer ${cp} / worker ${wp} / platform ${pf}`)
  else
    fail(`pricing_config[${cat}]`, `got ${r.consumer_price}/${r.worker_price}/${r.platform_fee}`)
}

// payout_tier_config seed matches 0032.
const EXPECTED_TIERS = [[1,40],[2,45],[3,50],[4,55],[5,60]]
for (const [tier, payout] of EXPECTED_TIERS) {
  const rows = await q(`SELECT payout FROM public.payout_tier_config WHERE tier=$1`, [tier])
  if (rows.length === 0) { fail(`payout_tier_config[${tier}]`, 'row missing'); continue }
  if (Number(rows[0].payout) === payout) pass(`payout_tier_config[${tier}] = ${payout}`)
  else                                    fail(`payout_tier_config[${tier}]`, `got ${rows[0].payout}`)
}

// PARITY: payout_for_tier returns identical results under both pricing_source values.
// Do this inside a transaction so the seeded flag is restored.
await client.query('BEGIN')
try {
  // Force 'hardcoded' first, capture
  await client.query(`UPDATE public.app_config SET value='{"value":"hardcoded"}'::jsonb WHERE key='pricing_source'`)
  const hc = await q(`SELECT 1 AS t, public.payout_for_tier(1) p1, public.payout_for_tier(2) p2,
                              public.payout_for_tier(3) p3, public.payout_for_tier(4) p4, public.payout_for_tier(5) p5`)
  await client.query(`UPDATE public.app_config SET value='{"value":"config"}'::jsonb WHERE key='pricing_source'`)
  const cf = await q(`SELECT 1 AS t, public.payout_for_tier(1) p1, public.payout_for_tier(2) p2,
                              public.payout_for_tier(3) p3, public.payout_for_tier(4) p4, public.payout_for_tier(5) p5`)
  let allEqual = true
  for (const k of ['p1','p2','p3','p4','p5']) {
    if (Number(hc[0][k]) !== Number(cf[0][k])) {
      fail(`payout_for_tier parity ${k}`, `hardcoded=${hc[0][k]} config=${cf[0][k]}`)
      allEqual = false
    }
  }
  if (allEqual) pass(`payout_for_tier parity: tiers 1–5 identical under both source values`)
} finally {
  await client.query('ROLLBACK')
}

// PARITY: COALESCE fallback. Delete an app_config row mid-transaction and
// confirm the helper returns the hardcoded default.
await client.query('BEGIN')
try {
  await client.query(`DELETE FROM public.app_config WHERE key='arrival_geofence_meters'`)
  const fb = await q(`SELECT public.get_config_number('arrival_geofence_meters', 100) AS v`)
  if (Number(fb[0].v) === 100) pass(`get_config_number COALESCE fallback returns hardcoded default when row deleted`)
  else                          fail(`get_config_number COALESCE fallback`, `got ${fb[0].v}`)
} finally {
  await client.query('ROLLBACK')
}

// ── 7d. Broadcast notifications (0072/0073/0074) ─────────────────────────────

console.log('\n── broadcast_notifications ──────────────────────────────────')

const bnTable = await q(`
  SELECT rowsecurity FROM pg_tables
  WHERE schemaname = 'public' AND tablename = 'broadcast_notifications'
`)
if (bnTable.length === 0) fail('public.broadcast_notifications', 'table missing')
else if (!bnTable[0].rowsecurity) fail('public.broadcast_notifications', 'RLS disabled')
else pass('public.broadcast_notifications exists, RLS enabled')

const bnFns = await q(`
  SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN ('resolve_broadcast_segment', 'trigger_broadcast')
`)
const fnNames = new Set(bnFns.map(r => r.proname))
if (fnNames.has('resolve_broadcast_segment')) pass('resolve_broadcast_segment() exists')
else                                          fail('resolve_broadcast_segment()', 'missing')
if (fnNames.has('trigger_broadcast')) pass('trigger_broadcast() exists')
else                                   fail('trigger_broadcast()', 'missing')

const promosCol = await q(`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'notification_preferences'
    AND column_name = 'promos_enabled'
`)
if (promosCol.length > 0) pass('notification_preferences.promos_enabled column present')
else                      fail('notification_preferences.promos_enabled', 'missing')

// ── 7c. Brand assets (0071) ──────────────────────────────────────────────────

console.log('\n── app_branding ─────────────────────────────────────────────')

const baTable = await q(`
  SELECT rowsecurity FROM pg_tables
  WHERE schemaname = 'public' AND tablename = 'app_branding'
`)
if (baTable.length === 0) {
  fail('public.app_branding', 'table missing')
} else if (!baTable[0].rowsecurity) {
  fail('public.app_branding', 'RLS disabled')
} else {
  pass('public.app_branding exists, RLS enabled')
}

const baPolicies = await q(`
  SELECT policyname, cmd FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'app_branding'
`)
const baAnon = baPolicies.find(p => p.policyname === 'app_branding anon read')
if (baAnon && baAnon.cmd === 'SELECT') pass('app_branding: anon SELECT policy present')
else                                    fail('app_branding anon SELECT policy', 'missing')
const baWrite = baPolicies.find(p => p.policyname === 'app_branding super_admin write')
if (baWrite) pass('app_branding: super_admin write policy present')
else         fail('app_branding super_admin write policy', 'missing')

const bucket = await q(`
  SELECT public FROM storage.buckets WHERE id = 'brand-assets'
`)
if (bucket.length > 0) {
  pass(`storage bucket "brand-assets" exists (public=${bucket[0].public})`)
} else {
  fail('storage bucket "brand-assets"', 'missing — run scripts/setup-brand-assets-bucket.js')
}

const bucketPolicies = await q(`
  SELECT policyname FROM pg_policies
  WHERE schemaname='storage' AND tablename='objects'
    AND policyname IN ('brand_assets_public_read', 'brand_assets_super_admin_rw')
`)
if (bucketPolicies.find(p => p.policyname === 'brand_assets_public_read'))
  pass('storage.objects: brand_assets_public_read policy present')
else
  fail('storage.objects: brand_assets_public_read policy', 'missing')
if (bucketPolicies.find(p => p.policyname === 'brand_assets_super_admin_rw'))
  pass('storage.objects: brand_assets_super_admin_rw policy present')
else
  fail('storage.objects: brand_assets_super_admin_rw policy', 'missing')

// ── 7b. Content overrides (0070) ─────────────────────────────────────────────

console.log('\n── content_overrides ────────────────────────────────────────')

const coTable = await q(`
  SELECT rowsecurity FROM pg_tables
  WHERE schemaname = 'public' AND tablename = 'content_overrides'
`)
if (coTable.length === 0) {
  fail('public.content_overrides', 'table missing')
} else if (!coTable[0].rowsecurity) {
  fail('public.content_overrides', 'RLS disabled')
} else {
  pass('public.content_overrides exists, RLS enabled')
}

const coPolicies = await q(`
  SELECT policyname, cmd, qual
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'content_overrides'
`)
const coAnonRead = coPolicies.find(p => p.policyname === 'content_overrides anon read')
if (coAnonRead && coAnonRead.cmd === 'SELECT') pass('content_overrides: anon SELECT policy present')
else                                            fail('content_overrides anon SELECT policy', 'missing')
const coWrite = coPolicies.find(p => p.policyname === 'content_overrides super_admin write')
if (coWrite) pass('content_overrides: super_admin write policy present')
else         fail('content_overrides super_admin write policy', 'missing')

const coRealtime = await q(`
  SELECT 1 FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime'
    AND schemaname = 'public' AND tablename = 'content_overrides'
`)
if (coRealtime.length > 0) pass('content_overrides on supabase_realtime publication')
else                       fail('content_overrides on supabase_realtime publication', 'missing')

// ── 7g. Admin Live Jobs (0081–0083) ──────────────────────────────────────────

console.log('\n── admin_order_audit + admin RPCs ───────────────────────────')

const aoaTable = await q(`
  SELECT rowsecurity FROM pg_tables
  WHERE schemaname = 'public' AND tablename = 'admin_order_audit'
`)
if (aoaTable.length === 0)               fail('public.admin_order_audit', 'table missing')
else if (!aoaTable[0].rowsecurity)       fail('public.admin_order_audit', 'RLS disabled')
else                                      pass('public.admin_order_audit exists, RLS enabled')

const aoaPolicies = await q(`
  SELECT policyname FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'admin_order_audit'
`)
for (const pol of ['admin_order_audit super_admin read', 'admin_order_audit super_admin write']) {
  if (aoaPolicies.find(p => p.policyname === pol)) pass(`admin_order_audit: ${pol}`)
  else                                              fail(`admin_order_audit: ${pol}`, 'missing')
}

const adminRpcs = await q(`
  SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('admin_reassign_washer', 'admin_override_order_price',
                      'admin_create_order_for_consumer', 'admin_log_photo_replacement')
`)
const adminFnNames = new Set(adminRpcs.map(r => r.proname))
for (const fn of ['admin_reassign_washer','admin_override_order_price','admin_create_order_for_consumer','admin_log_photo_replacement']) {
  if (adminFnNames.has(fn)) pass(`${fn}() exists`)
  else                       fail(`${fn}()`, 'missing — check 0082')
}

const createdByAdminCol = await q(`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'created_by_admin'
`)
if (createdByAdminCol.length > 0) pass('orders.created_by_admin column present')
else                              fail('orders.created_by_admin', 'missing — check 0082')

// transition_order_status now takes 5 args (5th = boolean default false)
const tosArgs = await q(`
  SELECT pg_get_function_arguments(p.oid) AS args
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'transition_order_status'
`)
if (tosArgs.length === 0) fail('transition_order_status', 'not found')
else {
  const args = tosArgs[0].args
  if (/p_admin_override\s+boolean/.test(args)) pass('transition_order_status has p_admin_override boolean DEFAULT false')
  else                                          fail('transition_order_status', `missing p_admin_override — args: ${args}`)
}

const adminStoragePolicies = await q(`
  SELECT policyname FROM pg_policies
  WHERE schemaname='storage' AND tablename='objects'
    AND policyname IN ('super_admin_write_car_photos','super_admin_write_job_evidence',
                       'super_admin_read_car_photos','super_admin_read_job_evidence')
`)
for (const pol of ['super_admin_write_car_photos','super_admin_write_job_evidence','super_admin_read_car_photos','super_admin_read_job_evidence']) {
  if (adminStoragePolicies.find(p => p.policyname === pol)) pass(`storage.objects: ${pol} policy present`)
  else                                                       fail(`storage.objects: ${pol}`, 'missing — check 0082')
}

// ── 7h. Admin Users (0084–0087) ──────────────────────────────────────────────

console.log('\n── admin_user_audit + admin user RPCs ───────────────────────')

const auaTable = await q(`
  SELECT rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename='admin_user_audit'
`)
if (auaTable.length === 0)         fail('public.admin_user_audit', 'table missing')
else if (!auaTable[0].rowsecurity) fail('public.admin_user_audit', 'RLS disabled')
else                                pass('public.admin_user_audit exists, RLS enabled')

const adminUserRpcs = await q(`
  SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('admin_get_user_auth','admin_update_profile','admin_suspend_user',
                      'admin_unsuspend_user','admin_merge_users','admin_user_activity',
                      'admin_create_impersonation_token')
`)
const userFnNames = new Set(adminUserRpcs.map(r => r.proname))
for (const fn of ['admin_get_user_auth','admin_update_profile','admin_suspend_user',
                  'admin_unsuspend_user','admin_merge_users','admin_user_activity',
                  'admin_create_impersonation_token']) {
  if (userFnNames.has(fn)) pass(`${fn}() exists`)
  else                      fail(`${fn}()`, 'missing — check 0086 / 0087')
}

const suspCols = await q(`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema='public' AND table_name='profiles'
    AND column_name IN ('suspended_at','suspended_reason','suspended_by')
`)
const suspNames = new Set(suspCols.map(r => r.column_name))
for (const c of ['suspended_at','suspended_reason','suspended_by']) {
  if (suspNames.has(c)) pass(`profiles.${c} column present`)
  else                  fail(`profiles.${c}`, 'missing — check 0085')
}

const impTable = await q(`
  SELECT rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename='impersonation_tokens'
`)
if (impTable.length === 0)         fail('public.impersonation_tokens', 'table missing')
else if (!impTable[0].rowsecurity) fail('public.impersonation_tokens', 'RLS disabled')
else                                pass('public.impersonation_tokens exists, RLS enabled')

// ── 7a. Super-admin role + helper (0069) ─────────────────────────────────────

console.log('\n── Roles / super_admin ──────────────────────────────────────')

const roleCheck = await q(`
  SELECT pg_get_constraintdef(c.oid) AS def
  FROM pg_constraint c
  JOIN pg_class      t ON t.oid = c.conrelid
  JOIN pg_namespace  n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public'
    AND t.relname = 'profiles'
    AND c.conname = 'profiles_role_check'
`)
if (roleCheck.length === 0) {
  fail('profiles_role_check constraint', 'not found')
} else if (!/super_admin/.test(roleCheck[0].def)) {
  fail('profiles_role_check', `missing 'super_admin' — got: ${roleCheck[0].def}`)
} else {
  pass(`profiles_role_check includes super_admin`)
}

const isSuperAdmin = await q(`
  SELECT 1 FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'is_super_admin'
`)
if (isSuperAdmin.length > 0) pass('public.is_super_admin() exists')
else                          fail('public.is_super_admin()', 'not found — check 0069')

const isAdminGone = await q(`
  SELECT 1 FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'is_admin'
`)
if (isAdminGone.length === 0) pass('public.is_admin() removed (inert helper dropped)')
else                           fail('public.is_admin()', 'still present — 0069 should have dropped it')

// ── 7. Storage RLS for washer-verification bucket (0061 / 0068) ──────────────

console.log('\n── Storage policies ─────────────────────────────────────────')

const storagePolicy = await q(`
  SELECT 1 FROM pg_policies
  WHERE schemaname = 'storage'
    AND tablename  = 'objects'
    AND policyname = 'agent_read_all_verification'
`)

if (storagePolicy.length > 0)
  pass('storage.objects: agent_read_all_verification policy present')
else
  fail('storage.objects: agent_read_all_verification policy missing',
       'agents cannot read washer-verification selfie/ID/license — run npm run db:migrate')

// ── Done ──────────────────────────────────────────────────────────────────────

await client.end()

console.log()
if (allPassed) {
  console.log('✓  All checks passed.\n')
} else {
  console.error('✗  Some checks failed — see above.\n')
  process.exit(1)
}
