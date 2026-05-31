#!/usr/bin/env node
// scripts/smoke-chats.js
// End-to-end smoke for the admin read-only Chats tab (ADR-029): proves a real
// super_admin can SELECT a support_conversation and its support_messages
// THROUGH RLS (the policies added in migration 0090, plus profiles read via
// 0079). A missing SELECT policy would surface as a silently-empty list in the
// admin UI rather than an error, so we compare the RLS read to the ground-truth
// count taken as the table owner.
//
// READ-ONLY: this smoke writes nothing and cleans up nothing.
//
// Usage:  node scripts/smoke-chats.js   (also runs via `npm run smoke`)
// Local-only; reads DATABASE_URL from .env.

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

async function smokeReadConversations() {
  section('Chats — super_admin reads support_conversations + support_messages (RLS)')

  // Ground truth as table owner (RLS bypassed): how many rows actually exist,
  // and which conversation has messages to read.
  const ownerConvCount = (await q(`SELECT count(*)::int n FROM public.support_conversations`))[0].n
  const rls = await q(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.support_conversations'::regclass`)
  if (rls[0]?.relrowsecurity) pass('RLS is ENABLED on support_conversations (read genuinely passes through a policy)')
  else fail('RLS is DISABLED on support_conversations — the SELECT-policy test would be meaningless')

  if (ownerConvCount === 0) {
    pass('no support conversations exist in this DB — nothing to read; skipping (RLS policy presence is verified by pg_policies separately)')
    return
  }

  const target = (await q(`
    SELECT conversation_id, count(*)::int n
    FROM public.support_messages GROUP BY conversation_id ORDER BY n DESC LIMIT 1`))[0]

  // Now read AS the super_admin, through RLS.
  await impersonate(ADMIN_ID)
  try {
    if ((await q(`SELECT public.is_super_admin() AS ok`))[0].ok !== true)
      fail('is_super_admin() not true under impersonation — smoke setup wrong')
    else pass('is_super_admin() = true under impersonation')

    // 1) Conversations, joined to profiles (mirrors the app's opener-name embed).
    const convs = await q(`
      SELECT c.id, c.status, c.opener_role, c.last_message_body, p.full_name AS opener_name
      FROM public.support_conversations c
      JOIN public.profiles p ON p.id = c.opener_id
      ORDER BY c.last_message_at DESC NULLS LAST
      LIMIT 5`)
    if (convs.length > 0) pass(`super_admin SELECT returned ${convs.length} conversation(s) (owner sees ${ownerConvCount}); opener name resolved → "${convs[0].opener_name ?? '—'}"`)
    else fail('super_admin SELECT on support_conversations returned 0 rows despite rows existing — SELECT policy missing/ineffective')

    // 2) Full message history for the busiest conversation.
    if (target) {
      const msgs = await q(`
        SELECT id, sender_id, sender_role, body, attachment_path, created_at
        FROM public.support_messages
        WHERE conversation_id = $1
        ORDER BY created_at ASC`, [target.conversation_id])
      if (msgs.length > 0)
        pass(`super_admin read ${msgs.length} message(s) for conversation ${String(target.conversation_id).slice(0, 8)}… (roles: ${[...new Set(msgs.map(m => m.sender_role))].join(', ')})`)
      else fail('super_admin SELECT on support_messages returned 0 rows for a conversation known to have messages')
    } else {
      pass('no support messages exist yet — conversation read proven; message read skipped')
    }
  } catch (e) {
    fail('super_admin read threw under RLS', e.message)
  } finally {
    await unimpersonate()
  }
}

try {
  await smokeReadConversations()
} catch (e) {
  console.error('\n  ✗  Smoke run aborted:', e.message)
  allPassed = false
} finally {
  await client.end()
}

console.log()
if (allPassed) { console.log('✓  All Chats smoke tests passed.\n'); process.exit(0) }
else { console.error('✗  Some Chats smoke tests failed — see above.\n'); process.exit(1) }
