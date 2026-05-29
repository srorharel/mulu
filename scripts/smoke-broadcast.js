#!/usr/bin/env node
// scripts/smoke-broadcast.js
// End-to-end smoke for the admin broadcast push pipeline.
//   admin → insert broadcast_notifications row
//        → trigger_broadcast(uuid) RPC
//        → pg_net.http_post → send-broadcast Edge Function
//        → resolve_broadcast_segment → loop send-notification per user
//        → notification_log row with delivered=true (FCM accepted token)
//
// Targets the most recently-active device_token user (whoever opened the
// native APK last) so we exercise the real FCM path, not a dry run. Cleans
// up the broadcast + log rows it creates.
//
// Usage:  node scripts/smoke-broadcast.js
// Local-only — needs DATABASE_URL with super_admin reach.

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname }          from 'node:path'
import { fileURLToPath }              from 'node:url'
import pkg                            from 'pg'

const { Client } = pkg
const __dir = dirname(fileURLToPath(import.meta.url))

function parseEnv () {
  const p = resolve(__dir, '..', '.env')
  if (!existsSync(p)) { console.error('.env not found'); process.exit(1) }
  return Object.fromEntries(
    readFileSync(p, 'utf8').split('\n').map(l => l.trim())
      .filter(l => l && !l.startsWith('#') && l.includes('='))
      .map(l => {
        const eq = l.indexOf('=')
        return [l.slice(0, eq).trim(), l.slice(eq + 1).replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '')]
      })
  )
}

const env   = parseEnv()
const dbUrl = env.DATABASE_URL
if (!dbUrl) { console.error('DATABASE_URL missing'); process.exit(1) }

const isLocal = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1')
const client  = new Client({ connectionString: dbUrl, ssl: isLocal ? false : { rejectUnauthorized: false } })

let allPassed = true
function pass (m) { console.log(`  PASS  ${m}`) }
function fail (m, d = '') { console.error(`  FAIL  ${m}${d ? `  (${d})` : ''}`); allPassed = false }
function section (n) { console.log(`\n── ${n} ──`) }
async function q (sql, params = []) { return (await client.query(sql, params)).rows }

async function impersonate (userId) {
  await client.query(`SELECT set_config('request.jwt.claims', $1, false)`,
    [JSON.stringify({ sub: userId, role: 'authenticated' })])
  await client.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [userId])
  await client.query(`SET ROLE authenticated`)
}
async function unimpersonate () {
  await client.query(`RESET ROLE`)
  await client.query(`SELECT set_config('request.jwt.claims', '', false)`)
}

async function sleep (ms) { return new Promise(r => setTimeout(r, ms)) }

await client.connect()

const superRows = await q(`SELECT id, full_name FROM public.profiles WHERE role = 'super_admin' LIMIT 1`)
if (!superRows.length) { fail('no super_admin profile'); process.exit(1) }
const ADMIN_ID = superRows[0].id
console.log(`acting as super_admin: ${superRows[0].full_name || '—'} (${ADMIN_ID})`)

let broadcastId = null

try {
  // ── 1. Identify a test user with an active device_token ──────────────────
  section('precondition — device_token exists')
  const tokenRows = await q(`
    SELECT dt.user_id, dt.platform, dt.last_seen_at, p.full_name, p.role
    FROM public.device_tokens dt
    JOIN public.profiles p ON p.id = dt.user_id
    ORDER BY dt.last_seen_at DESC NULLS LAST
    LIMIT 1
  `)
  if (!tokenRows.length) {
    fail('no rows in device_tokens — push delivery cannot be proven without a registered phone. '
       + 'Install the native APK, grant notification permission, and re-run this smoke.')
    process.exit(1)
  }
  const TARGET = tokenRows[0]
  pass(`target user = ${TARGET.full_name || TARGET.user_id.slice(0,8)} (${TARGET.role}, ${TARGET.platform}, last_seen ${TARGET.last_seen_at.toISOString()})`)

  // Confirm promos opt-in — we should NOT short-circuit
  const prefRows = await q(`SELECT enabled, promos_enabled FROM public.notification_preferences WHERE user_id = $1`, [TARGET.user_id])
  if (!prefRows.length) {
    fail('notification_preferences row missing — send-notification will skip with user_disabled')
    process.exit(1)
  }
  if (!prefRows[0].enabled)        fail('preferences.enabled=false — will short-circuit')
  else                              pass('preferences.enabled=true')
  if (prefRows[0].promos_enabled === false) fail('promos_enabled=false — admin_broadcast short-circuit will fire')
  else                                       pass(`promos_enabled=${prefRows[0].promos_enabled}`)

  // ── 2. Insert broadcast targeting that single user ───────────────────────
  section('create broadcast row (single_user segment)')
  await impersonate(ADMIN_ID)
  const ins = await q(`
    INSERT INTO public.broadcast_notifications
      (title_en, title_he, body_en, body_he, deep_link_route,
       segment_type, segment_payload, created_by)
    VALUES
      ('SMOKE broadcast', 'SMOKE שידור',
       'If you see this banner the chain works end-to-end.',
       'אם הבאנר הזה מופיע — הצינור עובד.',
       '/home', 'single_user', $1::jsonb, $2::uuid)
    RETURNING id
  `, [JSON.stringify({ user_id: TARGET.user_id }), ADMIN_ID])
  broadcastId = ins[0].id
  pass(`broadcast_notifications row inserted ${broadcastId}`)

  // resolve_broadcast_segment under super_admin should return exactly that uuid
  const seg = await q(`SELECT * FROM public.resolve_broadcast_segment($1::uuid)`, [broadcastId])
  if (seg.length === 1 && seg[0].resolve_broadcast_segment === TARGET.user_id) {
    pass('resolve_broadcast_segment → 1 row, correct user_id')
  } else {
    fail('resolve_broadcast_segment unexpected', JSON.stringify(seg))
  }

  // ── 3. Fire trigger_broadcast ────────────────────────────────────────────
  section('trigger_broadcast → pg_net → send-broadcast')
  const trig = await q(`SELECT public.trigger_broadcast($1::uuid) AS r`, [broadcastId])
  pass(`trigger_broadcast returned ${JSON.stringify(trig[0].r)}`)
  await unimpersonate()

  // ── 4. Poll for the notification_log row ─────────────────────────────────
  section('wait for fan-out to write notification_log')
  let logged = null
  const startedAt = Date.now()
  for (let i = 0; i < 30; i++) {  // up to 30s
    const rows = await q(`
      SELECT user_id, event_type, delivered, error, created_at
      FROM public.notification_log
      WHERE event_type = 'admin_broadcast'
        AND user_id = $1
        AND created_at >= now() - interval '5 minutes'
      ORDER BY created_at DESC LIMIT 1
    `, [TARGET.user_id])
    if (rows.length) { logged = rows[0]; break }
    await sleep(1000)
  }
  if (!logged) {
    fail('no notification_log row appeared within 30s — check supabase functions logs send-broadcast / send-notification')
  } else {
    pass(`notification_log row appeared in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`)
    if (logged.delivered === true) pass('delivered = true')
    else                            fail('delivered = false', `error=${logged.error}`)
    if (logged.error === null)      pass('error IS NULL')
    else                             fail('error column populated', logged.error)
  }

  // ── 5. broadcast_notifications.sent_count incremented ────────────────────
  section('broadcast_notifications sent_count update')
  const final = await q(`SELECT sent_at, sent_count, failed_count FROM public.broadcast_notifications WHERE id = $1`, [broadcastId])
  if (final[0].sent_at)              pass(`sent_at = ${final[0].sent_at.toISOString()}`)
  else                                fail('sent_at still NULL — send-broadcast did not update the row')
  if (final[0].sent_count === 1)     pass('sent_count = 1')
  else                                fail('sent_count', String(final[0].sent_count))
  if (final[0].failed_count === 0)   pass('failed_count = 0')
  else                                fail('failed_count', String(final[0].failed_count))

} catch (e) {
  fail('smoke threw', e.message)
} finally {
  // ── 6. Cleanup ───────────────────────────────────────────────────────────
  section('cleanup')
  try { await unimpersonate() } catch { /* ignore */ }
  if (broadcastId) {
    // Use service-role connection (no impersonation) so the RLS-bypassing
    // delete succeeds. notification_log uses INSERT-only RLS; service role
    // can delete via the underlying DATABASE_URL connection.
    await client.query(`DELETE FROM public.notification_log WHERE event_type = 'admin_broadcast' AND created_at >= now() - interval '5 minutes'`)
    await client.query(`DELETE FROM public.broadcast_notifications WHERE id = $1`, [broadcastId])
    pass(`removed broadcast ${broadcastId.slice(0,8)}… + admin_broadcast log rows`)
  }
  await client.end()
}

console.log()
console.log(allPassed ? '✅  smoke-broadcast PASSED' : '❌  smoke-broadcast FAILED')
process.exit(allPassed ? 0 : 1)
