#!/usr/bin/env node
// scripts/smoke-history.js
// End-to-end smoke for the admin History tab: change capture (DB triggers),
// scoped undo, the conflict guard, and the pricing-source undo block.
//
// SAFETY: every sub-test runs inside a transaction that is ALWAYS rolled back.
// The capture triggers + SECURITY DEFINER undo RPC are exercised exactly as in
// production (authenticated role, RLS on), but nothing is committed — the live
// content_overrides / app_config / payout_tier_config rows are never changed.
//
// Usage:  node scripts/smoke-history.js   (also runs via `npm run smoke`)
// Local-only mindset; reads DATABASE_URL from .env.

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname }          from 'node:path'
import { fileURLToPath }              from 'node:url'
import pkg                            from 'pg'

const { Client } = pkg
const __dir = dirname(fileURLToPath(import.meta.url))

function parseEnv() {
  const envPath = resolve(__dir, '..', '.env')
  if (!existsSync(envPath)) { console.error('  ❌  .env not found'); process.exit(1) }
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
if (!dbUrl) { console.error('  ❌  DATABASE_URL missing'); process.exit(1) }

const isLocal = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1')
const client  = new Client({ connectionString: dbUrl, ssl: isLocal ? false : { rejectUnauthorized: false } })

let allPassed = true
function pass(msg) { console.log(`  ✅  ${msg}`) }
function fail(msg, detail = '') { console.error(`  ❌  ${msg}${detail ? `  (${detail})` : ''}`); allPassed = false }
function section(name) { console.log(`\n── ${name} ──`) }

async function q(sql, params = []) { return (await client.query(sql, params)).rows }

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

await client.connect()

const superRows = await q(`SELECT id, full_name FROM public.profiles WHERE role='super_admin' LIMIT 1`)
if (superRows.length === 0) { fail('No super_admin in profiles — required'); process.exit(1) }
const ADMIN_ID = superRows[0].id
console.log(`acting as super_admin: ${superRows[0].full_name || '—'} (${ADMIN_ID})`)

const APP = 'main', LOC = 'en', KEY = 'zzz_smoke_history_test'
const ENTITY_KEY = `${APP}/${LOC}/${KEY}`

// ── 1. Capture + undo (content_override) ─────────────────────────────────────
async function smokeCaptureAndUndo() {
  section('History — capture + undo (content_override)')
  await impersonate(ADMIN_ID)
  await client.query('BEGIN')
  try {
    // create
    await q(`INSERT INTO public.content_overrides(app,locale,key,value,updated_by,updated_at)
             VALUES ($1,$2,$3,'V1',$4,now())`, [APP, LOC, KEY, ADMIN_ID])
    let h = await q(`SELECT id, action, before_value, after_value FROM public.admin_change_history
                     WHERE entity_type='content_override' AND entity_key=$1 ORDER BY changed_at`, [ENTITY_KEY])
    if (h.length === 1 && h[0].action === 'create' && h[0].before_value === null && h[0].after_value?.value === 'V1')
      pass('INSERT captured as create (after_value.value=V1, before=NULL)')
    else fail('create capture wrong', JSON.stringify(h))

    // update
    await q(`UPDATE public.content_overrides SET value='V2', updated_at=now() WHERE app=$1 AND locale=$2 AND key=$3`, [APP, LOC, KEY])
    h = await q(`SELECT id, action, before_value, after_value FROM public.admin_change_history
                 WHERE entity_type='content_override' AND entity_key=$1 ORDER BY changed_at`, [ENTITY_KEY])
    const upd = h.find(r => r.action === 'update')
    if (upd && upd.before_value?.value === 'V1' && upd.after_value?.value === 'V2')
      pass('UPDATE captured as update (before=V1, after=V2)')
    else fail('update capture wrong', JSON.stringify(h))

    // undo the update → value should return to V1
    const undoRes = await q(`SELECT public.admin_undo_change($1) AS r`, [upd.id])
    if (undoRes[0].r?.ok && undoRes[0].r?.reverted === 'update') pass('admin_undo_change returned ok/reverted=update')
    else fail('admin_undo_change unexpected return', JSON.stringify(undoRes[0].r))

    const cur = await q(`SELECT value FROM public.content_overrides WHERE app=$1 AND locale=$2 AND key=$3`, [APP, LOC, KEY])
    if (cur[0]?.value === 'V1') pass('override reverted to V1 after undo')
    else fail('override not reverted', cur[0]?.value)

    // the undo itself must be logged (new row, note references the history id)
    const undoLog = await q(`SELECT note, action, after_value FROM public.admin_change_history
                             WHERE entity_type='content_override' AND entity_key=$1
                               AND note = $2`, [ENTITY_KEY, `undo of ${upd.id}`])
    if (undoLog.length === 1 && undoLog[0].after_value?.value === 'V1')
      pass(`undo itself logged with note "undo of ${String(upd.id).slice(0,8)}…"`)
    else fail('undo not logged with note', JSON.stringify(undoLog))
  } catch (e) {
    fail('capture/undo threw', e.message)
  } finally {
    await client.query('ROLLBACK').catch(() => {})
    await unimpersonate()
    pass('rolled back — no production rows changed')
  }
}

// ── 2. Conflict guard ────────────────────────────────────────────────────────
async function smokeConflictGuard() {
  section('History — conflict guard (edited-since)')
  await impersonate(ADMIN_ID)
  await client.query('BEGIN')
  let threw = false
  try {
    await q(`INSERT INTO public.content_overrides(app,locale,key,value,updated_by,updated_at)
             VALUES ($1,$2,$3,'V1',$4,now())`, [APP, LOC, KEY, ADMIN_ID])
    await q(`UPDATE public.content_overrides SET value='V2', updated_at=now() WHERE app=$1 AND locale=$2 AND key=$3`, [APP, LOC, KEY])
    const h1 = (await q(`SELECT id FROM public.admin_change_history
                         WHERE entity_type='content_override' AND entity_key=$1 AND action='update'
                         ORDER BY changed_at`, [ENTITY_KEY]))[0]
    await q(`UPDATE public.content_overrides SET value='V3', updated_at=now() WHERE app=$1 AND locale=$2 AND key=$3`, [APP, LOC, KEY])
    // Undo the FIRST update — now stale (current is V3) → must conflict.
    try {
      await q(`SELECT public.admin_undo_change($1)`, [h1.id])
    } catch (e) {
      threw = true
      if (/conflict/i.test(e.message)) pass(`stale undo rejected with conflict (${e.message.slice(0, 70)})`)
      else fail('undo rejected but not a conflict message', e.message)
    }
    if (!threw) fail('stale undo was NOT rejected (conflict guard broken)')
  } catch (e) {
    if (!threw) fail('conflict test threw unexpectedly', e.message)
  } finally {
    await client.query('ROLLBACK').catch(() => {})
    await unimpersonate()
    pass('rolled back')
  }
}

// ── 3. Pricing-source undo block ─────────────────────────────────────────────
async function smokePricingBlock() {
  section('History — pricing undo blocked when pricing_source=config')
  await impersonate(ADMIN_ID)
  await client.query('BEGIN')
  let threw = false
  try {
    // Make a payout_tier_config change (captured as history).
    await q(`UPDATE public.payout_tier_config SET payout = payout + 1, updated_at=now() WHERE tier=5`)
    const hPay = (await q(`SELECT id FROM public.admin_change_history
                           WHERE entity_type='payout_tier_config' ORDER BY changed_at DESC LIMIT 1`))[0]
    if (!hPay) { fail('payout_tier_config change not captured'); return }
    pass('payout_tier_config edit captured')

    // Flip source to 'config' (rolled back after).
    await q(`UPDATE public.app_config SET value='{"value":"config"}'::jsonb WHERE key='pricing_source'`)

    try {
      await q(`SELECT public.admin_undo_change($1)`, [hPay.id])
    } catch (e) {
      threw = true
      if (/pricing_source|blocked/i.test(e.message)) pass(`pricing undo blocked under source=config (${e.message.slice(0, 70)})`)
      else fail('pricing undo rejected but wrong message', e.message)
    }
    if (!threw) fail('pricing undo was NOT blocked under source=config')
  } catch (e) {
    if (!threw) fail('pricing-block test threw unexpectedly', e.message)
  } finally {
    await client.query('ROLLBACK').catch(() => {})
    await unimpersonate()
    pass('rolled back — pricing_source restored, payout unchanged')
  }
}

// ── run ───────────────────────────────────────────────────────────────────────
try {
  await smokeCaptureAndUndo()
  await smokeConflictGuard()
  await smokePricingBlock()
} catch (e) {
  console.error('\n  ✗  Smoke run aborted:', e.message)
  allPassed = false
} finally {
  await client.end()
}

console.log()
if (allPassed) { console.log('✓  All History smoke tests passed.\n'); process.exit(0) }
else { console.error('✗  Some History smoke tests failed — see above.\n'); process.exit(1) }
