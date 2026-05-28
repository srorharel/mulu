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
