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
    AND tablename IN ('profiles', 'orders', 'order_events', 'receipts')
  ORDER BY tablename
`)

for (const expected of ['order_events', 'orders', 'profiles', 'receipts']) {
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
    AND p.proname IN ('nearby_jobs', 'transition_order_status', 'validate_order_prices', 'issue_receipt_on_completion', 'admin_resend_receipt')
`)

const funcNames = new Set(funcs.map(r => r.proname))
for (const fn of ['nearby_jobs', 'transition_order_status', 'validate_order_prices', 'issue_receipt_on_completion', 'admin_resend_receipt']) {
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
  // 0111 — first-wash discount (ADR-040)
  'discount_percent', 'discount_amount',
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

// ── 5b. Underground parking column + relaxed transition (0103 / 0104) ────────
//
// 0103 adds orders.is_underground_parking boolean NOT NULL DEFAULT false. 0104
// relaxes transition_order_status so a marked order can go en_route→arrived and
// in_progress→pending_approval with NULL coords (no reception underground). We
// assert the column shape, then exercise the relaxed transitions inside a
// rolled-back transaction so live rows are untouched.

console.log('\n── underground parking (0103 / 0104) ────────────────────────')

const ugCol = await q(`
  SELECT data_type, column_default, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'orders'
    AND column_name = 'is_underground_parking'
`)
if (ugCol.length === 0) {
  fail('orders.is_underground_parking', 'missing — check 0103')
} else {
  const c = ugCol[0]
  if (c.data_type === 'boolean') pass('orders.is_underground_parking is boolean')
  else                           fail('orders.is_underground_parking type', `expected boolean, got ${c.data_type}`)
  if (/false/i.test(c.column_default || '')) pass('orders.is_underground_parking DEFAULT false')
  else                                       fail('orders.is_underground_parking default', `expected false, got ${c.column_default}`)
  if (c.is_nullable === 'NO') pass('orders.is_underground_parking is NOT NULL')
  else                        fail('orders.is_underground_parking nullable', 'expected NOT NULL')
}

// Functional proof: a marked order accepts the two reception-dependent
// transitions with NULL coords. Impersonate seed washer (33333333) who owns
// seed order B (aa…002) by setting the request.jwt.claims GUC that auth.uid()
// reads; mark the order underground with 4 photos; confirm the transitions that
// would normally require GPS now succeed. Everything rolls back.
const SEED_WASHER = '33333333-0000-0000-0000-000000000003'
const SEED_ORDER  = 'aa000000-0000-0000-0000-000000000002'

await client.query('BEGIN')
try {
  const exists = await q(
    `SELECT 1 FROM public.orders WHERE id = $1 AND washer_id = $2`,
    [SEED_ORDER, SEED_WASHER]
  )
  if (exists.length === 0) {
    fail('null-coord transition test', `seed order ${SEED_ORDER} / washer missing — cannot exercise`)
  } else {
    await client.query(
      `SELECT set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: SEED_WASHER, role: 'authenticated' })]
    )

    // en_route → arrived with NULL coords (underground skips geofence + GPS;
    // the 4 arrival photos are still required, so we set them first).
    await client.query(`
      UPDATE public.orders SET status = 'en_route', is_underground_parking = true,
        arrival_photo_front = 't/arrival/front.jpg', arrival_photo_back = 't/arrival/back.jpg',
        arrival_photo_driver = 't/arrival/driver.jpg', arrival_photo_passenger = 't/arrival/passenger.jpg'
      WHERE id = $1`, [SEED_ORDER])
    await client.query(`SELECT public.transition_order_status($1, 'arrived', NULL, NULL)`, [SEED_ORDER])
    const r1 = await q(`SELECT status FROM public.orders WHERE id = $1`, [SEED_ORDER])
    if (r1[0].status === 'arrived') pass('underground en_route→arrived accepted with NULL coords')
    else                            fail('underground en_route→arrived', `status is ${r1[0].status}`)

    // arrived → in_progress (no gate) → pending_approval with NULL coords +
    // 4 completion photos; submitted coords must stay NULL.
    await client.query(`SELECT public.transition_order_status($1, 'in_progress', NULL, NULL)`, [SEED_ORDER])
    await client.query(`
      UPDATE public.orders SET
        completion_photo_front = 't/completion/front.jpg', completion_photo_back = 't/completion/back.jpg',
        completion_photo_driver = 't/completion/driver.jpg', completion_photo_passenger = 't/completion/passenger.jpg'
      WHERE id = $1`, [SEED_ORDER])
    await client.query(`SELECT public.transition_order_status($1, 'pending_approval', NULL, NULL)`, [SEED_ORDER])
    const r2 = await q(`SELECT status, submitted_lat, submitted_lng FROM public.orders WHERE id = $1`, [SEED_ORDER])
    if (r2[0].status === 'pending_approval') pass('underground in_progress→pending_approval accepted with NULL coords')
    else                                     fail('underground in_progress→pending_approval', `status is ${r2[0].status}`)
    if (r2[0].submitted_lat === null && r2[0].submitted_lng === null) pass('underground submission leaves submitted_lat/lng NULL')
    else                                                              fail('underground submitted coords', `expected NULL, got ${r2[0].submitted_lat}/${r2[0].submitted_lng}`)
  }
} catch (err) {
  fail('null-coord transition test', err.message)
} finally {
  await client.query('ROLLBACK')
}

// agent_set_order_underground (0105) — agents flip a regular order to underground.
const agentUgFn = await q(`
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'agent_set_order_underground'
`)
if (agentUgFn.length > 0) pass('agent_set_order_underground() exists')
else                      fail('agent_set_order_underground()', 'missing — check 0105')

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

// ── 6b. get_order_washer_location return shape (live consumer tracking, 0106) ─
//
// useOrderWasherTracking + OrderTrackingMap read washer_id/lat/lng/updated_at/status
// off these rows to animate the live washer marker and ETA. Mirror the nearby_jobs
// guard so a future rewrite can't silently change this contract.

console.log('\n── get_order_washer_location return shape ───────────────────')

const orderWasherLocReturn = await q(`
  SELECT pg_get_function_result(p.oid) AS returns
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public'
    AND  p.proname = 'get_order_washer_location'
`)

if (orderWasherLocReturn.length === 0) {
  fail('get_order_washer_location function', 'not found')
} else {
  const ret = orderWasherLocReturn[0].returns
  const cols = [
    ['washer_id',  /\bwasher_id uuid\b/],
    ['lat',        /\blat double precision\b/],
    ['lng',        /\blng double precision\b/],
    ['updated_at', /\bupdated_at timestamp with time zone\b/],
    ['status',     /\bstatus text\b/],
  ]
  for (const [col, re] of cols) {
    if (re.test(ret)) pass(`get_order_washer_location returns ${col}`)
    else              fail(`get_order_washer_location returns ${col}`, `${col} missing/changed in RETURNS — live tracking will break`)
  }
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
                      'admin_create_order_for_consumer', 'admin_log_photo_replacement',
                      'admin_force_order_stage')
`)
const adminFnNames = new Set(adminRpcs.map(r => r.proname))
for (const fn of ['admin_reassign_washer','admin_override_order_price','admin_create_order_for_consumer','admin_log_photo_replacement']) {
  if (adminFnNames.has(fn)) pass(`${fn}() exists`)
  else                       fail(`${fn}()`, 'missing — check 0082')
}
if (adminFnNames.has('admin_force_order_stage')) pass('admin_force_order_stage() exists')
else                                              fail('admin_force_order_stage()', 'missing — check 0101')

// admin_order_audit.action CHECK must accept 'force_stage' (0101)
const aoaActionCheck = await q(`
  SELECT pg_get_constraintdef(c.oid) AS def
  FROM pg_constraint c
  JOIN pg_class t      ON t.oid = c.conrelid
  JOIN pg_namespace n  ON n.oid = t.relnamespace
  WHERE n.nspname = 'public' AND t.relname = 'admin_order_audit'
    AND c.contype = 'c' AND c.conname = 'admin_order_audit_action_check'
`)
if (aoaActionCheck.length && /force_stage/.test(aoaActionCheck[0].def)) {
  pass("admin_order_audit action CHECK includes 'force_stage'")
} else {
  fail('admin_order_audit action CHECK', "missing 'force_stage' — check 0101")
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

// ── 7i. Design overrides (0088–0089) ─────────────────────────────────────────

console.log('\n── design_overrides ─────────────────────────────────────────')

const doTable = await q(`
  SELECT rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename='design_overrides'
`)
if (doTable.length === 0)         fail('public.design_overrides', 'table missing')
else if (!doTable[0].rowsecurity) fail('public.design_overrides', 'RLS disabled')
else                               pass('public.design_overrides exists, RLS enabled')

const doPolicies = await q(`
  SELECT policyname, cmd FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'design_overrides'
`)
if (doPolicies.find(p => p.policyname === 'design_overrides anon read')) pass('design_overrides: anon SELECT policy present')
else                                                                       fail('design_overrides anon SELECT policy', 'missing')
if (doPolicies.find(p => p.policyname === 'design_overrides super_admin write')) pass('design_overrides: super_admin write policy present')
else                                                                              fail('design_overrides super_admin write policy', 'missing')

const doRealtime = await q(`
  SELECT 1 FROM pg_publication_tables
  WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='design_overrides'
`)
if (doRealtime.length > 0) pass('design_overrides on supabase_realtime publication')
else                        fail('design_overrides on supabase_realtime publication', 'missing')

const designRpcs = await q(`
  SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('admin_set_design_override','admin_clear_design_override','admin_reset_all_design_overrides')
`)
const designFnNames = new Set(designRpcs.map(r => r.proname))
for (const fn of ['admin_set_design_override','admin_clear_design_override','admin_reset_all_design_overrides']) {
  if (designFnNames.has(fn)) pass(`${fn}() exists`)
  else                        fail(`${fn}()`, 'missing — check 0089')
}

// ── 7j. Admin change history + activity feed + undo (0092–0095) ──────────────

console.log('\n── admin_change_history + activity feed ─────────────────────')

const achTable = await q(`
  SELECT rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename='admin_change_history'
`)
if (achTable.length === 0)         fail('public.admin_change_history', 'table missing — check 0092')
else if (!achTable[0].rowsecurity) fail('public.admin_change_history', 'RLS disabled')
else                                pass('public.admin_change_history exists, RLS enabled')

const achPolicies = await q(`
  SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='admin_change_history'
`)
for (const pol of ['admin_change_history super_admin read', 'admin_change_history super_admin write']) {
  if (achPolicies.find(p => p.policyname === pol)) pass(`admin_change_history: ${pol}`)
  else                                              fail(`admin_change_history: ${pol}`, 'missing — check 0092')
}

const achRealtime = await q(`
  SELECT 1 FROM pg_publication_tables
  WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='admin_change_history'
`)
if (achRealtime.length > 0) pass('admin_change_history on supabase_realtime publication')
else                         fail('admin_change_history on supabase_realtime publication', 'missing')

// Capture trigger function + the six per-table triggers.
const captureFn = await q(`
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='capture_admin_change_history'
`)
if (captureFn.length > 0) pass('capture_admin_change_history() trigger function exists')
else                       fail('capture_admin_change_history()', 'missing — check 0092')

const HISTORY_TRIGGERS = {
  content_overrides:  'trg_history_content_overrides',
  app_branding:       'trg_history_app_branding',
  app_config:         'trg_history_app_config',
  pricing_config:     'trg_history_pricing_config',
  payout_tier_config: 'trg_history_payout_tier_config',
  design_overrides:   'trg_history_design_overrides',
}
const histTriggers = await q(`
  SELECT c.relname AS tbl, t.tgname
  FROM pg_trigger t
  JOIN pg_class c     ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname='public' AND NOT t.tgisinternal AND t.tgname LIKE 'trg_history_%'
`)
const histTrigSet = new Set(histTriggers.map(r => `${r.tbl}:${r.tgname}`))
for (const [tbl, tg] of Object.entries(HISTORY_TRIGGERS)) {
  if (histTrigSet.has(`${tbl}:${tg}`)) pass(`history trigger ${tg} on ${tbl}`)
  else                                  fail(`history trigger ${tg} on ${tbl}`, 'missing — capture would be bypassed (check 0092)')
}

// Activity feed view.
const feedView = await q(`SELECT 1 FROM pg_views WHERE schemaname='public' AND viewname='admin_activity_feed'`)
if (feedView.length > 0) pass('admin_activity_feed view exists')
else                      fail('admin_activity_feed view', 'missing — check 0093')

// New RPCs.
const histRpcs = await q(`
  SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public'
    AND p.proname IN ('get_admin_activity_feed','admin_undo_change','admin_get_deletion_snapshot')
`)
const histRpcNames = new Set(histRpcs.map(r => r.proname))
for (const fn of ['get_admin_activity_feed','admin_undo_change','admin_get_deletion_snapshot']) {
  if (histRpcNames.has(fn)) pass(`${fn}() exists`)
  else                       fail(`${fn}()`, 'missing — check 0093/0094/0095')
}

// admin_user_audit must allow the 'restore_user' action (0095).
const auaActionDef = await q(`
  SELECT pg_get_constraintdef(c.oid) AS def
  FROM pg_constraint c
  JOIN pg_class t      ON t.oid = c.conrelid
  JOIN pg_namespace n  ON n.oid = t.relnamespace
  WHERE n.nspname='public' AND t.relname='admin_user_audit' AND c.conname='admin_user_audit_action_check'
`)
if (auaActionDef.length === 0)               fail('admin_user_audit_action_check', 'constraint missing')
else if (!/restore_user/.test(auaActionDef[0].def)) fail('admin_user_audit_action_check', "missing 'restore_user' — check 0095")
else                                          pass("admin_user_audit_action_check includes 'restore_user'")

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

// ── 8. Legal documents (0107) ───────────────────────────────────────────────
//
// Versioned legal-docs store + acknowledgments. Asserts the tables/RLS, the
// partial unique index (one current per type+locale), the four RPCs + the
// pending return shape, realtime publication, and the three seeded he docs.
// Then exercises two behaviours inside rolled-back transactions: a publish
// flips v1→v2 (exactly one is_current), and pending_legal_acknowledgments
// filters by role.

console.log('\n── legal_documents + acknowledgments (0107) ─────────────────')

const legalTables = await q(`
  SELECT tablename, rowsecurity FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN ('legal_documents', 'user_legal_acknowledgments')
`)
for (const t of ['legal_documents', 'user_legal_acknowledgments']) {
  const row = legalTables.find(r => r.tablename === t)
  if (!row)                  fail(`public.${t}`, 'table missing — check 0107')
  else if (!row.rowsecurity) fail(`public.${t}`, 'RLS disabled')
  else                       pass(`public.${t} exists, RLS enabled`)
}

const oneCurrentIdx = await q(`
  SELECT indexdef FROM pg_indexes
  WHERE schemaname='public' AND tablename='legal_documents'
    AND indexname='legal_documents_one_current_idx'
`)
if (oneCurrentIdx.length && /WHERE is_current/i.test(oneCurrentIdx[0].indexdef))
  pass('legal_documents_one_current_idx: partial unique index on is_current')
else
  fail('legal_documents_one_current_idx', 'missing or not partial-on-is_current — check 0107')

const legalFns = await q(`
  SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('publish_legal_document','get_current_legal_document',
                      'pending_legal_acknowledgments','acknowledge_legal_document')
`)
const legalFnNames = new Set(legalFns.map(r => r.proname))
for (const fn of ['publish_legal_document','get_current_legal_document',
                  'pending_legal_acknowledgments','acknowledge_legal_document']) {
  if (legalFnNames.has(fn)) pass(`${fn}() exists`)
  else                      fail(`${fn}()`, 'missing — check 0107')
}

const pendingReturn = await q(`
  SELECT pg_get_function_result(p.oid) AS returns
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname='pending_legal_acknowledgments'
`)
if (pendingReturn.length === 0) {
  fail('pending_legal_acknowledgments', 'not found')
} else {
  const ret = pendingReturn[0].returns
  const cols = [
    ['doc_type',       /\bdoc_type text\b/],
    ['version',        /\bversion integer\b/],
    ['locale',         /\blocale text\b/],
    ['title',          /\btitle text\b/],
    ['content',        /\bcontent text\b/],
    ['effective_date', /\beffective_date date\b/],
  ]
  for (const [col, re] of cols) {
    if (re.test(ret)) pass(`pending_legal_acknowledgments returns ${col}`)
    else              fail(`pending_legal_acknowledgments returns ${col}`, `missing/changed in: ${ret}`)
  }
}

const legalRealtime = await q(`
  SELECT 1 FROM pg_publication_tables
  WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='legal_documents'
`)
if (legalRealtime.length > 0) pass('legal_documents on supabase_realtime publication')
else                          fail('legal_documents on supabase_realtime publication', 'missing — check 0107')

const seedDocs = await q(`
  SELECT doc_type, version, is_current FROM public.legal_documents
  WHERE locale='he' AND is_current
`)
for (const dt of ['consumer_terms', 'privacy_policy', 'washer_terms']) {
  const r = seedDocs.find(x => x.doc_type === dt)
  if (r && r.version === 1 && r.is_current) pass(`seed ${dt} he v1 is_current`)
  else fail(`seed ${dt} he`, r ? `version=${r.version} is_current=${r.is_current}` : 'missing — check 0107')
}

// Behavioural: agent publishes a new version → flips current (rolled back).
await client.query('BEGIN')
try {
  const AGENT = '22222222-0000-0000-0000-000000000002'  // consumer seed, temporarily promoted
  await client.query(`UPDATE public.profiles SET role='agent' WHERE id=$1`, [AGENT])
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`,
    [JSON.stringify({ sub: AGENT, role: 'authenticated' })])

  await client.query(
    `SELECT public.publish_legal_document('consumer_terms', 'he', 'תנאי שימוש', 'v2 test body', NULL)`
  )
  const after = await q(`
    SELECT version, is_current FROM public.legal_documents
    WHERE doc_type='consumer_terms' AND locale='he' ORDER BY version
  `)
  const currents = after.filter(r => r.is_current)
  const v2 = after.find(r => r.version === 2)
  if (currents.length === 1 && v2 && v2.is_current)
    pass('publish_legal_document: v2 published, exactly one is_current (v1 demoted)')
  else
    fail('publish flip', `currents=${currents.length} v2_is_current=${v2?.is_current}`)

  const agentPending = await q(`SELECT doc_type FROM public.pending_legal_acknowledgments($1)`, [AGENT])
  if (agentPending.length === 0) pass('pending_legal_acknowledgments: agent role gets none')
  else                           fail('agent pending', `expected 0, got ${agentPending.map(r => r.doc_type).join(',')}`)
} catch (err) {
  fail('publish / agent behavioural test', err.message)
} finally {
  await client.query('ROLLBACK')
}

// Behavioural: pending filters by role for consumer + washer (rolled back).
await client.query('BEGIN')
try {
  const CONSUMER = '11111111-0000-0000-0000-000000000001'
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`,
    [JSON.stringify({ sub: CONSUMER, role: 'authenticated' })])
  const cset = new Set((await q(`SELECT doc_type FROM public.pending_legal_acknowledgments($1)`, [CONSUMER])).map(r => r.doc_type))
  if (cset.has('consumer_terms') && cset.has('privacy_policy') && !cset.has('washer_terms'))
    pass('pending: consumer → consumer_terms + privacy_policy (no washer_terms)')
  else fail('consumer role filter', `got {${[...cset].join(',')}}`)

  const WASHER = '33333333-0000-0000-0000-000000000003'
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`,
    [JSON.stringify({ sub: WASHER, role: 'authenticated' })])
  const wset = new Set((await q(`SELECT doc_type FROM public.pending_legal_acknowledgments($1)`, [WASHER])).map(r => r.doc_type))
  if (wset.has('washer_terms') && wset.has('privacy_policy') && !wset.has('consumer_terms'))
    pass('pending: washer → washer_terms + privacy_policy (no consumer_terms)')
  else fail('washer role filter', `got {${[...wset].join(',')}}`)
} catch (err) {
  fail('role-filter behavioural test', err.message)
} finally {
  await client.query('ROLLBACK')
}

// ── 9. Legal-update fan-out (0108) ───────────────────────────────────────────
//
// Audience RPC (role-based + opt-in) + the AFTER-INSERT trigger that fires one
// pg_net call to fan-out-legal-update. (The net.http_post wiring of
// notify_on_legal_publish is also validated by the pg_net section above, which
// scans every http_post-using public function.)

console.log('\n── legal_update fan-out (0108) ──────────────────────────────')

const fanoutFns = await q(`
  SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname IN ('legal_update_audience','notify_on_legal_publish')
`)
const fanoutFnNames = new Set(fanoutFns.map(r => r.proname))
for (const fn of ['legal_update_audience', 'notify_on_legal_publish']) {
  if (fanoutFnNames.has(fn)) pass(`${fn}() exists`)
  else                       fail(`${fn}()`, 'missing — check 0108')
}

const legalTrigger = await q(`
  SELECT t.tgname FROM pg_trigger t
  JOIN pg_class c     ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname='public' AND c.relname='legal_documents'
    AND t.tgname='trg_notify_on_legal_publish' AND NOT t.tgisinternal
`)
if (legalTrigger.length > 0) pass('trg_notify_on_legal_publish trigger on legal_documents')
else                         fail('trg_notify_on_legal_publish', 'missing — check 0108')

// Behavioural: audience role selection + opt-out skip (rolled back). Impersonate
// an agent (the RPC gate allows service_role OR agent).
await client.query('BEGIN')
try {
  const AGENT = '22222222-0000-0000-0000-000000000002'
  await client.query(`UPDATE public.profiles SET role='agent' WHERE id=$1`, [AGENT])
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`,
    [JSON.stringify({ sub: AGENT, role: 'authenticated' })])

  const aud = async (dt) =>
    new Set((await q(`SELECT u AS uid FROM public.legal_update_audience($1) AS u`, [dt])).map(r => r.uid))

  const CONSUMER = '11111111-0000-0000-0000-000000000001'
  const WASHER   = '33333333-0000-0000-0000-000000000003'

  const consumerAud = await aud('consumer_terms')
  if (consumerAud.has(CONSUMER) && !consumerAud.has(WASHER))
    pass('legal_update_audience(consumer_terms) → consumers only')
  else fail('audience consumer_terms', `consumer∈=${consumerAud.has(CONSUMER)} washer∈=${consumerAud.has(WASHER)}`)

  const washerAud = await aud('washer_terms')
  if (washerAud.has(WASHER) && !washerAud.has(CONSUMER))
    pass('legal_update_audience(washer_terms) → washers only')
  else fail('audience washer_terms', `washer∈=${washerAud.has(WASHER)} consumer∈=${washerAud.has(CONSUMER)}`)

  const privacyAud = await aud('privacy_policy')
  if (privacyAud.has(CONSUMER) && privacyAud.has(WASHER))
    pass('legal_update_audience(privacy_policy) → consumers + washers')
  else fail('audience privacy_policy', `consumer∈=${privacyAud.has(CONSUMER)} washer∈=${privacyAud.has(WASHER)}`)

  // opt-out: disable the consumer's notifications → excluded from the audience.
  await client.query(
    `INSERT INTO public.notification_preferences (user_id, enabled) VALUES ($1, false)
     ON CONFLICT (user_id) DO UPDATE SET enabled=false`, [CONSUMER])
  const afterOptOut = await aud('consumer_terms')
  if (!afterOptOut.has(CONSUMER)) pass('legal_update_audience skips opt-out (enabled=false) users')
  else                            fail('audience opt-out skip', 'disabled consumer still in audience')
} catch (err) {
  fail('legal_update_audience behavioural test', err.message)
} finally {
  await client.query('ROLLBACK')
}

// ── 10. Account-deletion FK relaxation (0109) ────────────────────────────────
//
// Anonymize-and-preserve-orders requires the order/order_events references to a
// deleted profile to become NULL (not block, not cascade-delete). Assert the
// three FKs are ON DELETE SET NULL and that orders.consumer_id is nullable.

console.log('\n── account-deletion FKs (0109) ──────────────────────────────')

const delFks = await q(`
  SELECT conname, confdeltype FROM pg_constraint
  WHERE conname IN ('orders_consumer_id_fkey','orders_washer_id_fkey','order_events_actor_id_fkey')
`)
const fkMap = Object.fromEntries(delFks.map(r => [r.conname, r.confdeltype]))
for (const fk of ['orders_consumer_id_fkey', 'orders_washer_id_fkey', 'order_events_actor_id_fkey']) {
  if (fkMap[fk] === 'n') pass(`${fk} is ON DELETE SET NULL`)
  else                   fail(`${fk}`, `expected SET NULL ('n'), got '${fkMap[fk] ?? 'missing'}' — check 0109`)
}
const ccNull = await q(`
  SELECT is_nullable FROM information_schema.columns
  WHERE table_schema='public' AND table_name='orders' AND column_name='consumer_id'
`)
if (ccNull[0]?.is_nullable === 'YES') pass('orders.consumer_id is nullable (anonymizable)')
else                                  fail('orders.consumer_id nullable', `expected YES, got ${ccNull[0]?.is_nullable} — check 0109`)

// ── 11. UGC content_reports + content_blocks (0110) ──────────────────────────

console.log('\n── content_reports / content_blocks (0110) ──────────────────')

const ugcTables = await q(`
  SELECT tablename, rowsecurity FROM pg_tables
  WHERE schemaname='public' AND tablename IN ('content_reports','content_blocks')
`)
for (const tname of ['content_reports', 'content_blocks']) {
  const row = ugcTables.find(r => r.tablename === tname)
  if (!row)                  fail(`public.${tname}`, 'table missing — check 0110')
  else if (!row.rowsecurity) fail(`public.${tname}`, 'RLS disabled')
  else                       pass(`public.${tname} exists, RLS enabled`)
}

const crPolicies = await q(`SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='content_reports'`)
const crNames = new Set(crPolicies.map(r => r.policyname))
for (const p of ['Reporters insert own reports', 'Reporters read own reports', 'Agents read all reports', 'Agents update reports']) {
  if (crNames.has(p)) pass(`content_reports policy: ${p}`)
  else                fail(`content_reports policy: ${p}`, 'missing — check 0110')
}

const crRealtime = await q(`
  SELECT 1 FROM pg_publication_tables
  WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='content_reports'
`)
if (crRealtime.length > 0) pass('content_reports on supabase_realtime publication')
else                       fail('content_reports on supabase_realtime publication', 'missing — check 0110')

// Behavioural RLS (rolled back): a reporter sees ONLY their own reports; an agent
// sees all. Exercised as the `authenticated` role so RLS actually applies (the
// migration connection is the owner and would otherwise bypass it).
await client.query('BEGIN')
try {
  const A = '11111111-0000-0000-0000-000000000001' // consumer
  const B = '33333333-0000-0000-0000-000000000003' // washer
  const AG = '22222222-0000-0000-0000-000000000002' // temporarily promoted to agent

  // Seed two reports from two different reporters (owner insert, RLS bypassed).
  await client.query(
    `INSERT INTO public.content_reports (reporter_id, reported_user_id, context, reason)
     VALUES ($1,$2,'support_chat','a-report'), ($2,$1,'order_chat','b-report')`, [A, B])
  await client.query(`UPDATE public.profiles SET role='agent' WHERE id=$1`, [AG])

  // Reporter A (consumer) — must see only their own report.
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: A, role: 'authenticated' })])
  await client.query('SET LOCAL ROLE authenticated')
  const aSees = (await client.query('SELECT count(*)::int c FROM public.content_reports')).rows[0].c
  await client.query('RESET ROLE')
  if (aSees === 1) pass('content_reports RLS: reporter sees only their own report')
  else             fail('content_reports RLS reporter scope', `expected 1, saw ${aSees}`)

  // Agent — must see all reports.
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: AG, role: 'authenticated' })])
  await client.query('SET LOCAL ROLE authenticated')
  const agSees = (await client.query('SELECT count(*)::int c FROM public.content_reports')).rows[0].c
  await client.query('RESET ROLE')
  if (agSees >= 2) pass('content_reports RLS: agent reads all reports')
  else             fail('content_reports RLS agent scope', `expected >=2, saw ${agSees}`)
} catch (err) {
  await client.query('RESET ROLE').catch(() => {})
  fail('content_reports RLS behavioural test', err.message)
} finally {
  await client.query('ROLLBACK')
}

// ── Done ──────────────────────────────────────────────────────────────────────

await client.end()

console.log()
if (allPassed) {
  console.log('✓  All checks passed.\n')
} else {
  console.error('✗  Some checks failed — see above.\n')
  process.exit(1)
}
