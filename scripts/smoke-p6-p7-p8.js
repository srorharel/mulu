#!/usr/bin/env node
// scripts/smoke-p6-p7-p8.js
// End-to-end smoke tests for P6 Live Jobs + P7 Users + P8 Design Editor.
// Connects directly to Postgres via DATABASE_URL and impersonates a real
// super_admin by setting `request.jwt.claims` on the local session, so
// SECURITY DEFINER RPCs that gate on `is_super_admin()` see the right uid.
//
// Usage:  node scripts/smoke-p6-p7-p8.js   (or:  npm run smoke)
//
// Local-only. Never run in CI against a live DB without a tombstone strategy.

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname }          from 'node:path'
import { fileURLToPath }              from 'node:url'
import pkg                            from 'pg'

const { Client } = pkg
const __dir = dirname(fileURLToPath(import.meta.url))

// ── env ─────────────────────────────────────────────────────────────────────
function parseEnv() {
  const envPath = resolve(__dir, '..', '.env')
  if (!existsSync(envPath)) { fail('.env not found'); process.exit(1) }
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
const dbUrl = env.DATABASE_URL
if (!dbUrl) { fail('DATABASE_URL missing'); process.exit(1) }

const isLocal = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1')
const client  = new Client({ connectionString: dbUrl, ssl: isLocal ? false : { rejectUnauthorized: false } })

// ── reporting ───────────────────────────────────────────────────────────────
let allPassed = true
function pass(msg) { console.log(`  ✅  ${msg}`) }
function fail(msg, detail = '') {
  console.error(`  ❌  ${msg}${detail ? `  (${detail})` : ''}`)
  allPassed = false
}
function section(name) { console.log(`\n── ${name} ──`) }

async function q(sql, params = []) {
  const r = await client.query(sql, params)
  return r.rows
}

// Impersonate a real super_admin so auth.uid() in SECURITY DEFINER RPCs
// returns their id. PostgREST sets `request.jwt.claims`; we mimic it.
// We must use `SET LOCAL` inside a transaction OR a regular `SET` for the
// session. Since each smoke section runs sequential queries, session-level
// is fine.
async function impersonate(userId) {
  await client.query(`SELECT set_config('request.jwt.claims', $1, false)`,
    [JSON.stringify({ sub: userId, role: 'authenticated' })])
  await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [userId])
  await client.query(`SET ROLE authenticated`)
}

async function unimpersonate() {
  await client.query(`RESET ROLE`)
  await client.query(`SELECT set_config('request.jwt.claims', '', false)`)
}

// ── connect + identify acting users ─────────────────────────────────────────
await client.connect()

const superRows = await q(`SELECT id, full_name FROM public.profiles WHERE role = 'super_admin' LIMIT 1`)
if (superRows.length === 0) { fail('No super_admin user in profiles — required for smoke'); process.exit(1) }
const ADMIN_ID = superRows[0].id
console.log(`acting as super_admin: ${superRows[0].full_name || '—'} (${ADMIN_ID})`)

const consumerRows = await q(`SELECT id, full_name FROM public.profiles WHERE role = 'consumer' AND suspended_at IS NULL LIMIT 1`)
if (consumerRows.length === 0) { fail('No active consumer in profiles — required for smoke'); process.exit(1) }
const CONSUMER_ID = consumerRows[0].id
console.log(`test consumer:        ${consumerRows[0].full_name || '—'} (${CONSUMER_ID})`)

// ── P6 — Live Jobs ──────────────────────────────────────────────────────────
async function smokeLiveJobs() {
  section('P6 — Live Jobs')
  await impersonate(ADMIN_ID)

  let orderId = null
  try {
    // 1. Create an order on behalf of consumer
    const createRes = await q(`
      SELECT public.admin_create_order_for_consumer(
        $1::uuid, 32.0853::double precision, 34.7818::double precision, 'private'::text,
        '{"plate":"12-345-67","make":"Smoke","model":"Test"}'::jsonb,
        '{"water":true,"power":false}'::jsonb,
        'smoke test order'::text, false::boolean
      ) AS id
    `, [CONSUMER_ID])
    orderId = createRes[0].id
    if (orderId) pass(`admin_create_order_for_consumer → ${orderId.slice(0,8)}…`)
    else { fail('admin_create_order_for_consumer returned null'); return }

    // 2. Assert row exists with created_by_admin set
    const ordRows = await q(
      `SELECT id, status, created_by_admin, total_price, payout_amount FROM public.orders WHERE id = $1`,
      [orderId]
    )
    if (ordRows.length !== 1) { fail('order row not found after create'); return }
    if (ordRows[0].created_by_admin === ADMIN_ID) pass('orders.created_by_admin = admin id')
    else fail('orders.created_by_admin mismatch', ordRows[0].created_by_admin)
    if (ordRows[0].status === 'pending') pass(`status='pending' (initial)`)
    else fail('status not pending after create', ordRows[0].status)

    // 3. Override the price
    await q(`SELECT public.admin_override_order_price($1::uuid, 200::numeric, 80::numeric, 'smoke price override'::text)`, [orderId])
    const priced = await q(`SELECT total_price, payout_amount, platform_fee FROM public.orders WHERE id = $1`, [orderId])
    if (Number(priced[0].total_price) === 200 && Number(priced[0].payout_amount) === 80 && Number(priced[0].platform_fee) === 120) {
      pass('admin_override_order_price applied (consumer 200 / payout 80 / fee 120)')
    } else {
      fail('price override mismatch', JSON.stringify(priced[0]))
    }

    // 4. Assert admin_order_audit has the override row
    const auditOverride = await q(
      `SELECT id, action FROM public.admin_order_audit WHERE order_id = $1 AND action = 'override_price'`,
      [orderId]
    )
    if (auditOverride.length === 1) pass('admin_order_audit override_price row written')
    else                              fail('admin_order_audit override_price row missing', `${auditOverride.length} rows`)

    // 5. Force-cancel via transition_order_status with p_admin_override=true
    await q(
      `SELECT public.transition_order_status($1::uuid, 'cancelled'::text, NULL, NULL, true)`,
      [orderId]
    )
    const cancelled = await q(`SELECT status, cancelled_by FROM public.orders WHERE id = $1`, [orderId])
    if (cancelled[0].status === 'cancelled') pass('transition_order_status admin override → cancelled')
    else fail('status not cancelled after force-cancel', cancelled[0].status)
    if (cancelled[0].cancelled_by === 'agent') pass('cancelled_by recorded')
    else fail('cancelled_by not set', cancelled[0].cancelled_by)

    // 6. Assert admin_order_audit has the cancel row
    const auditCancel = await q(
      `SELECT action FROM public.admin_order_audit WHERE order_id = $1 AND action = 'cancel'`,
      [orderId]
    )
    if (auditCancel.length === 1) pass('admin_order_audit cancel row written')
    else                            fail('admin_order_audit cancel row missing', `${auditCancel.length} rows`)

  } finally {
    await unimpersonate()
    if (orderId) {
      // Hard-delete the test order — bypasses RLS as superuser (default pg role)
      await client.query('DELETE FROM public.admin_order_audit WHERE order_id = $1', [orderId])
      await client.query('DELETE FROM public.order_events       WHERE order_id = $1', [orderId])
      await client.query('DELETE FROM public.orders             WHERE id       = $1', [orderId])
      pass(`cleanup: deleted test order ${orderId.slice(0,8)}…`)
    }
  }
}

// ── P7 — Users ──────────────────────────────────────────────────────────────
async function smokeUsers() {
  section('P7 — Users')
  await impersonate(ADMIN_ID)

  let issuedTokenId = null
  try {
    // 1. Suspend
    await q(
      `SELECT public.admin_suspend_user($1::uuid, 'smoke test'::text)`,
      [CONSUMER_ID]
    )
    const suspRow = await q(
      `SELECT suspended_at, suspended_reason, suspended_by FROM public.profiles WHERE id = $1`,
      [CONSUMER_ID]
    )
    if (suspRow[0].suspended_at !== null) pass('profiles.suspended_at set')
    else                                    fail('suspended_at not set')
    if (suspRow[0].suspended_reason === 'smoke test') pass('suspended_reason matches')
    else                                                fail('suspended_reason mismatch', suspRow[0].suspended_reason)
    if (suspRow[0].suspended_by === ADMIN_ID) pass('suspended_by = admin id')
    else                                       fail('suspended_by mismatch')

    // 2. Unsuspend
    await q(`SELECT public.admin_unsuspend_user($1::uuid)`, [CONSUMER_ID])
    const unsuspRow = await q(
      `SELECT suspended_at, suspended_reason, suspended_by FROM public.profiles WHERE id = $1`,
      [CONSUMER_ID]
    )
    if (unsuspRow[0].suspended_at === null) pass('profiles.suspended_at cleared')
    else                                     fail('suspended_at still set')

    // 3. Audit rows for both
    const auditSusp = await q(
      `SELECT action FROM public.admin_user_audit WHERE user_id = $1 AND action IN ('suspend','unsuspend') ORDER BY created_at`,
      [CONSUMER_ID]
    )
    const actions = auditSusp.map(r => r.action)
    if (actions.includes('suspend') && actions.includes('unsuspend')) {
      pass('admin_user_audit has both suspend + unsuspend rows')
    } else {
      fail('admin_user_audit missing suspend/unsuspend rows', actions.join(','))
    }

    // 4. Issue impersonation token
    const tokRes = await q(
      `SELECT public.admin_create_impersonation_token($1::uuid, 300::int) AS res`,
      [CONSUMER_ID]
    )
    const issued = tokRes[0].res
    if (issued?.token && typeof issued.token === 'string' && issued.token.length === 64) {
      pass(`admin_create_impersonation_token returns 64-char hex token`)
    } else {
      fail('impersonation token shape unexpected', JSON.stringify(issued))
    }

    // 5. impersonation_tokens row exists with hashed token (NOT plain)
    const tokRows = await q(
      `SELECT id, token_hash, target_user_id, admin_id, expires_at, used_at
         FROM public.impersonation_tokens
        WHERE target_user_id = $1
        ORDER BY created_at DESC LIMIT 1`,
      [CONSUMER_ID]
    )
    if (tokRows.length !== 1) { fail('impersonation_tokens row not found'); }
    else {
      issuedTokenId = tokRows[0].id
      if (tokRows[0].token_hash && tokRows[0].token_hash !== issued.token) pass('token_hash stored (different from plain token, as expected)')
      else                                                                  fail('token_hash missing or equals plain token (security bug)')
      if (tokRows[0].admin_id === ADMIN_ID) pass('admin_id recorded')
      else                                   fail('admin_id mismatch')
      if (tokRows[0].used_at === null) pass('used_at is NULL (unused)')
      else                              fail('used_at set on fresh token')
    }

    // 6. admin_user_audit issuance row
    const auditImp = await q(
      `SELECT action FROM public.admin_user_audit WHERE user_id = $1 AND action = 'impersonation_issued'`,
      [CONSUMER_ID]
    )
    if (auditImp.length >= 1) pass('admin_user_audit impersonation_issued row written')
    else                       fail('admin_user_audit impersonation_issued row missing')

  } finally {
    await unimpersonate()
    // Clean up: token row + audit rows generated by the smoke run.
    if (issuedTokenId) {
      await client.query('DELETE FROM public.impersonation_tokens WHERE id = $1', [issuedTokenId])
      pass(`cleanup: deleted test impersonation token`)
    }
    await client.query(
      `DELETE FROM public.admin_user_audit WHERE user_id = $1 AND action IN ('suspend','unsuspend','impersonation_issued') AND reason IN ('smoke test', 'token issued for 300s')`,
      [CONSUMER_ID]
    )
    pass(`cleanup: deleted test user audit rows`)
  }
}

// ── P8 — Design Editor ──────────────────────────────────────────────────────
async function smokeDesignEditor() {
  section('P8 — Design Editor')
  await impersonate(ADMIN_ID)

  const TEST_ID = 'consumer.home.bookCta'
  try {
    // 1. Set a valid bg override
    await q(
      `SELECT public.admin_set_design_override('main'::text, $1::text, 'bg'::text, '{"value":"#ff0000"}'::jsonb)`,
      [TEST_ID]
    )
    const setRows = await q(
      `SELECT value FROM public.design_overrides WHERE app='main' AND id=$1 AND property='bg'`,
      [TEST_ID]
    )
    if (setRows.length === 1 && setRows[0].value?.value === '#ff0000') pass(`admin_set_design_override wrote bg=#ff0000 for ${TEST_ID}`)
    else fail('design_overrides row not written or value mismatch', JSON.stringify(setRows[0]?.value))

    // 2. Reject out-of-bound padding (>48 disallowed by ADR-027)
    let rejected = false
    try {
      await q(
        `SELECT public.admin_set_design_override('main'::text, $1::text, 'padding'::text, '{"value":999}'::jsonb)`,
        [TEST_ID]
      )
    } catch (e) {
      rejected = true
      pass(`admin_set_design_override rejected padding=999 (${e.message.slice(0, 80)})`)
    }
    if (!rejected) fail('admin_set_design_override accepted out-of-bound padding=999 (bound validation broken)')

    // 3. Reject out-of-bound text_size (>1.5 disallowed)
    rejected = false
    try {
      await q(
        `SELECT public.admin_set_design_override('main'::text, $1::text, 'text_size'::text, '{"value":3}'::jsonb)`,
        [TEST_ID]
      )
    } catch (e) {
      rejected = true
      pass(`admin_set_design_override rejected text_size=3 (${e.message.slice(0, 80)})`)
    }
    if (!rejected) fail('admin_set_design_override accepted out-of-bound text_size=3')

    // 4. Reject invalid property
    rejected = false
    try {
      await q(
        `SELECT public.admin_set_design_override('main'::text, $1::text, 'made_up_prop'::text, '{"value":1}'::jsonb)`,
        [TEST_ID]
      )
    } catch (e) {
      rejected = true
      pass(`admin_set_design_override rejected unknown property (${e.message.slice(0, 80)})`)
    }
    if (!rejected) fail('admin_set_design_override accepted unknown property')

    // 5. Clear the override
    await q(
      `SELECT public.admin_clear_design_override('main'::text, $1::text, 'bg'::text)`,
      [TEST_ID]
    )
    const clearedRows = await q(
      `SELECT 1 FROM public.design_overrides WHERE app='main' AND id=$1 AND property='bg'`,
      [TEST_ID]
    )
    if (clearedRows.length === 0) pass('admin_clear_design_override removed the row')
    else                            fail('design_overrides row still present after clear')

  } finally {
    await unimpersonate()
    // Defensive cleanup in case the run aborted mid-test
    await client.query(`DELETE FROM public.design_overrides WHERE id = $1`, [TEST_ID])
  }
}

// ── P6b — Force stage (any status, forward + backward) ───────────────────────
async function smokeForceStage() {
  section('P6 — Force stage (forward, backward, backward-from-terminal)')
  await impersonate(ADMIN_ID)

  let orderId = null
  try {
    const createRes = await q(`
      SELECT public.admin_create_order_for_consumer(
        $1::uuid, 32.0853::double precision, 34.7818::double precision, 'private'::text,
        '{"plate":"99-888-77","make":"Force","model":"Stage"}'::jsonb,
        '{"water":false,"power":false}'::jsonb,
        'smoke force-stage order'::text, false::boolean
      ) AS id
    `, [CONSUMER_ID])
    orderId = createRes[0].id
    if (orderId) pass(`created test order ${orderId.slice(0, 8)}…  (status=pending)`)
    else { fail('force-stage: order create returned null'); return }

    const forceStage = (toStatus, reason) =>
      q(`SELECT public.admin_force_order_stage($1::uuid, $2::text, $3::text)`, [orderId, toStatus, reason])
    const statusOf  = async () => (await q(`SELECT status FROM public.orders WHERE id = $1`, [orderId]))[0].status
    const auditRow  = (from, to) => q(`
      SELECT reason, payload FROM public.admin_order_audit
       WHERE order_id = $1 AND action = 'force_stage'
         AND payload->>'from_status' = $2 AND payload->>'to_status' = $3
       ORDER BY created_at DESC LIMIT 1
    `, [orderId, from, to])

    // 1. Forward skip: pending → in_progress (skips accepted/en_route/arrived)
    await forceStage('in_progress', 'smoke: forward skip pending to in_progress')
    if (await statusOf() === 'in_progress') pass('forward-skip pending → in_progress applied')
    else                                     fail('forward-skip did not set in_progress')
    let a = await auditRow('pending', 'in_progress')
    if (a.length && a[0].reason === 'smoke: forward skip pending to in_progress' && a[0].payload.reason)
      pass('force_stage audit (pending→in_progress) carries reason in column + payload')
    else fail('force_stage audit (pending→in_progress) missing/incomplete', JSON.stringify(a[0] ?? null))

    // 2. Backward: in_progress → accepted
    await forceStage('accepted', 'smoke: backward in_progress to accepted')
    if (await statusOf() === 'accepted') pass('backward in_progress → accepted applied')
    else                                  fail('backward did not set accepted')
    a = await auditRow('in_progress', 'accepted')
    if (a.length && a[0].reason === 'smoke: backward in_progress to accepted')
      pass('force_stage audit (in_progress→accepted) carries reason')
    else fail('force_stage audit (in_progress→accepted) missing', JSON.stringify(a[0] ?? null))

    // 3. Forward to a terminal state: accepted → completed
    await forceStage('completed', 'smoke: forward accepted to completed')
    if (await statusOf() === 'completed') pass('forward accepted → completed applied')
    else                                   fail('did not reach completed')

    // 4. Backward FROM a terminal state: completed → in_progress (the 0101 unblock)
    await forceStage('in_progress', 'smoke: backward from completed')
    if (await statusOf() === 'in_progress') pass('backward FROM completed → in_progress applied (terminal-source unblocked)')
    else                                     fail('could not move back from completed — terminal block still present?')
    a = await auditRow('completed', 'in_progress')
    if (a.length && a[0].reason === 'smoke: backward from completed')
      pass('force_stage audit (completed→in_progress) carries reason')
    else fail('force_stage audit (completed→in_progress) missing', JSON.stringify(a[0] ?? null))

    // 5. Reason is mandatory — empty reason rejected SERVER-side
    let rejected = false
    try { await forceStage('accepted', '   ') }
    catch (e) { rejected = true; pass(`empty reason rejected server-side (${e.message.slice(0, 50)})`) }
    if (!rejected) fail('admin_force_order_stage accepted an empty reason (server-side enforcement broken)')

  } finally {
    await unimpersonate()
    if (orderId) {
      await client.query('DELETE FROM public.admin_order_audit WHERE order_id = $1', [orderId])
      await client.query('DELETE FROM public.order_events       WHERE order_id = $1', [orderId])
      await client.query('DELETE FROM public.orders             WHERE id       = $1', [orderId])
      pass(`cleanup: deleted force-stage test order ${orderId.slice(0, 8)}…`)
    }
  }
}

// ── run ─────────────────────────────────────────────────────────────────────
try {
  await smokeLiveJobs()
  await smokeForceStage()
  await smokeUsers()
  await smokeDesignEditor()
} catch (e) {
  console.error('\n  ✗  Smoke run aborted with exception:', e.message)
  if (e.stack) console.error(e.stack.split('\n').slice(0, 5).join('\n'))
  allPassed = false
} finally {
  await client.end()
}

console.log()
if (allPassed) {
  console.log('✓  All P6 + P7 + P8 smoke tests passed.\n')
  process.exit(0)
} else {
  console.error('✗  Some smoke tests failed — see above.\n')
  process.exit(1)
}
