#!/usr/bin/env node
// scripts/verify-live-surfaces.js
//
// End-to-end live checks for the three surfaces touched by the
// approval/selfie/nearby_jobs work. Runs against the live DB (no service
// role required — uses direct pg + simulated JWT claims to evaluate RLS).
//
// Read-mostly. The only writes are a temporary pending_approval order so we
// can exercise the Approvals fetch + decline_count banner data path. The
// order is rolled back at the end of the run (single transaction).
//
// Usage:  node scripts/verify-live-surfaces.js

import { readFileSync, existsSync } from 'node:fs'
import { resolve }                  from 'node:path'
import pkg                          from 'pg'

const { Client } = pkg

function parseEnv() {
  const envPath = resolve(process.cwd(), '.env')
  if (!existsSync(envPath)) { console.error('.env missing'); process.exit(1) }
  return Object.fromEntries(
    readFileSync(envPath, 'utf8').split('\n')
      .map(l => l.trim()).filter(l => l && !l.startsWith('#') && l.includes('='))
      .map(l => {
        const eq  = l.indexOf('=')
        const val = l.slice(eq + 1).replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '')
        return [l.slice(0, eq).trim(), val]
      })
  )
}

const env = parseEnv()
const c   = new Client({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
})
await c.connect()

let allPassed = true
function pass(s) { console.log(`  ✅  ${s}`) }
function fail(s, d = '') { console.error(`  ❌  ${s}${d ? `  (${d})` : ''}`); allPassed = false }

// ── Surface 1: Approvals tab ─────────────────────────────────────────────────

console.log('\n── Surface 1: Approvals tab ─────────────────────────────────')

// Pick an accepted/in_progress order we can temporarily flip to pending_approval
// to exercise the Approvals fetch path with realistic data. Roll back at the end.
const candidate = await c.query(`
  SELECT id, washer_id, status FROM orders
   WHERE status IN ('in_progress','accepted','arrived','en_route')
   LIMIT 1
`)

if (candidate.rows.length === 0) {
  // No suitable order — fall back to inserting a tiny synthetic one (will roll back).
  console.log('  (no in-flight order found, seeding a temporary one)')
}

await c.query('BEGIN')

try {
  let testOrderId, savedStatus
  if (candidate.rows.length > 0) {
    testOrderId = candidate.rows[0].id
    savedStatus = candidate.rows[0].status
    await c.query(
      `UPDATE orders
         SET status = 'pending_approval',
             decline_count = 1,
             submitted_for_approval_at = now()
       WHERE id = $1`,
      [testOrderId],
    )
  } else {
    // Seed an order with valid required columns.
    const seed = await c.query(`
      INSERT INTO orders (consumer_id, car_type, service_type, location, status, decline_count, submitted_for_approval_at)
      VALUES (
        (SELECT id FROM profiles WHERE role='consumer' LIMIT 1),
        'private', 'wash',
        ST_SetSRID(ST_MakePoint(35.2137, 31.7683), 4326)::geography,
        'pending_approval', 1, now()
      )
      RETURNING id
    `)
    testOrderId = seed.rows[0].id
  }

  // Run the same SELECT shape that support-app/src/lib/approvals.js does.
  const approvalsRows = await c.query(`
    SELECT id, status, car_type, car_make, car_model, car_year, car_color, car_plate,
           arrival_photo_front, completion_photo_front,
           created_at, accepted_at,
           submitted_lat, submitted_lng, submitted_location_at,
           decline_count, decline_reason,
           lat, lng, address_label
      FROM orders
     WHERE status = 'pending_approval'
     ORDER BY accepted_at DESC NULLS LAST
  `)

  if (approvalsRows.rows.length > 0) {
    pass(`fetchPendingApprovals shape: ${approvalsRows.rows.length} row(s), no missing-column error`)
    const sample = approvalsRows.rows.find(r => r.id === testOrderId) ?? approvalsRows.rows[0]
    if (sample.decline_count === 1) pass('decline_count = 1 row visible (drives previously-declined banner)')
    else                              fail('decline_count not as expected', `got ${sample.decline_count}`)
  } else {
    fail('fetchPendingApprovals returned 0 rows after seeding')
  }

  // Bump decline_count to 3 and re-fetch to assert the escalated banner data path.
  await c.query(`UPDATE orders SET decline_count = 3 WHERE id = $1`, [testOrderId])
  const at3 = await c.query(`SELECT decline_count FROM orders WHERE id = $1`, [testOrderId])
  if (at3.rows[0].decline_count === 3) pass('decline_count = 3 row visible (drives escalated banner)')
  else                                  fail('decline_count = 3 not persisted')

} finally {
  // Always roll back the test changes — no side effects on the live DB.
  await c.query('ROLLBACK')
}

// ── Surface 2: Verification tab — selfie + agent RLS ─────────────────────────

console.log('\n── Surface 2: Verification tab selfie ───────────────────────')

// 2a. A real washer_verifications row with selfie_path exists (already seeded by users).
const verRows = await c.query(`
  SELECT v.id, v.washer_id, v.selfie_path, v.status,
         o.name AS object_name, o.bucket_id
    FROM washer_verifications v
    LEFT JOIN storage.objects o
      ON o.bucket_id = 'washer-verification' AND o.name = v.selfie_path
   WHERE v.selfie_path <> ''
   ORDER BY v.submitted_at DESC
   LIMIT 1
`)

if (verRows.rows.length === 0) {
  fail('no washer_verifications with selfie_path — cannot exercise selfie flow')
} else {
  const row = verRows.rows[0]
  if (row.object_name) {
    pass(`verification ${row.id.slice(0, 8)} has selfie_path "${row.selfie_path}" backed by storage object`)
  } else {
    fail(`verification ${row.id.slice(0, 8)} has selfie_path "${row.selfie_path}" but no matching storage object`)
  }

  // 2b. The agent_read_all_verification policy makes that object visible
  //     under an authenticated-agent JWT context. This is the simulated
  //     equivalent of an agent calling supabase.storage.createSignedUrl.
  const agent = await c.query(`SELECT id FROM profiles WHERE role='agent' LIMIT 1`)
  if (agent.rows.length === 0) {
    fail('no agent profile in DB — cannot simulate agent storage read')
  } else {
    const agentId = agent.rows[0].id
    await c.query('BEGIN')
    try {
      await c.query('SET LOCAL ROLE authenticated')
      await c.query(
        `SELECT set_config('request.jwt.claims',
           json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
        [agentId],
      )
      const visible = await c.query(
        `SELECT name FROM storage.objects
          WHERE bucket_id = 'washer-verification' AND name = $1`,
        [row.selfie_path],
      )
      if (visible.rows.length === 1) {
        pass(`agent (sub=${agentId.slice(0, 8)}) can SELECT storage object — createSignedUrl path WILL return a URL`)
      } else {
        fail('agent context could not SELECT the selfie object — 0068 agent_read_all_verification not effective')
      }
    } finally {
      await c.query('ROLLBACK')
    }
  }
}

// ── Surface 3: Washer map — nearby_jobs + exclusion filter ───────────────────

console.log('\n── Surface 3: Washer map nearby_jobs ────────────────────────')

// Find an online washer with a known location AND no in-flight job — the
// 0066 exclusion filter (correctly) returns 0 rows for any washer who
// already has an active or pending_approval order, which would mask the
// baseline test.
const washer = await c.query(`
  SELECT p.id,
         ST_Y(p.current_location::geometry) AS lat,
         ST_X(p.current_location::geometry) AS lng
    FROM profiles p
   WHERE p.role = 'washer'
     AND p.is_online = true
     AND p.current_location IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM orders o
        WHERE o.washer_id = p.id
          AND o.status IN ('accepted','en_route','arrived','in_progress','pending_approval')
     )
   LIMIT 1
`)

if (washer.rows.length === 0) {
  fail('no online washer with a location — cannot exercise nearby_jobs')
} else {
  const w = washer.rows[0]

  // 3a. Baseline call — washer has no active job, should see a pending order
  await c.query('BEGIN')
  try {
    await c.query('SET LOCAL ROLE authenticated')
    await c.query(
      `SELECT set_config('request.jwt.claims',
         json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
      [w.id],
    )

    const baseline = await c.query(
      `SELECT id, lat, lng, distance_km FROM nearby_jobs($1, $2, 50)`,
      [w.lat, w.lng],
    )

    if (baseline.rows.length === 0) {
      fail('nearby_jobs returned 0 rows for online washer near seed pending order')
    } else {
      pass(`nearby_jobs returned ${baseline.rows.length} row(s) for washer (${w.lat.toFixed(3)}, ${w.lng.toFixed(3)})`)
      const r = baseline.rows[0]
      if (typeof r.lat === 'number' && typeof r.lng === 'number') {
        pass(`row lat/lng populated: (${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}) — WorkerMap.jsx pin contract satisfied`)
      } else {
        fail('row lat/lng missing or non-numeric — WorkerMap would skip the pin')
      }
    }

  } finally {
    await c.query('ROLLBACK')
  }

  // 3b. Exclusion filter: when this washer has a pending_approval job,
  //     nearby_jobs must return 0 rows.
  //     Insert under a fresh transaction with the default (privileged) role
  //     so the orders RLS insert policy doesn't reject us, then call
  //     nearby_jobs under the authenticated washer JWT context, then roll
  //     back so no live state leaks.
  await c.query('BEGIN')
  try {
    await c.query(
      `INSERT INTO orders (consumer_id, washer_id, car_type, service_type, location, status, accepted_at)
       VALUES (
         (SELECT id FROM profiles WHERE role='consumer' LIMIT 1),
         $1, 'private', 'wash',
         ST_SetSRID(ST_MakePoint(35.2137, 31.7683), 4326)::geography,
         'pending_approval', now()
       )`,
      [w.id],
    )

    // Re-enter authenticated context for the RPC call only.
    await c.query('SET LOCAL ROLE authenticated')
    await c.query(
      `SELECT set_config('request.jwt.claims',
         json_build_object('sub', $1::text, 'role', 'authenticated')::text, true)`,
      [w.id],
    )
    const excluded = await c.query(
      `SELECT count(*)::int AS n FROM nearby_jobs($1, $2, 50)`,
      [w.lat, w.lng],
    )
    if (excluded.rows[0].n === 0) {
      pass('exclusion filter works: washer with pending_approval order sees 0 nearby jobs')
    } else {
      fail(`exclusion filter NOT working: washer with pending_approval order still sees ${excluded.rows[0].n} job(s)`)
    }
  } finally {
    await c.query('ROLLBACK')
  }
}

// ── Done ─────────────────────────────────────────────────────────────────────

await c.end()

console.log()
if (allPassed) {
  console.log('✓  All live surface checks passed.\n')
  process.exit(0)
} else {
  console.error('✗  Some live surface checks failed.\n')
  process.exit(1)
}
