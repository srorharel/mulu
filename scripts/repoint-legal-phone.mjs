#!/usr/bin/env node
// scripts/repoint-legal-phone.mjs
//
// One-off: re-publish consumer_terms + privacy_policy (he) to change the contact
// phone from OLD (050-640-6810) to NEW (052-300-8350). SAFETY-GUARDED — it only
// publishes a doc if the live DB content is EXACTLY the new mirror with the phone
// reverted to OLD (i.e. the only delta is the phone), so it can never clobber
// production legal text that drifted from the repo. Publishing inserts a new
// is_current version (version+1), which fires the AFTER INSERT fanout trigger
// (trg_notify_on_legal_publish) → pushes a legal_update to every user.
//
// Local-only. Reads DATABASE_URL from .env. The NEW mirror files (with the new
// phone) must already be edited in mulu-site-src/src/content/.
//
//   node scripts/repoint-legal-phone.mjs            (dry run)
//   node scripts/repoint-legal-phone.mjs --commit   (publish)

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname }         from 'node:path'
import { fileURLToPath }            from 'node:url'
import pkg                          from 'pg'

const { Client } = pkg
const __dir = dirname(fileURLToPath(import.meta.url))

const args   = process.argv.slice(2)
const commit = args.includes('--commit')

function parseEnv() {
  const envPath = resolve(__dir, '..', '.env')
  if (!existsSync(envPath)) { console.error('  ✗  .env not found'); process.exit(1) }
  return Object.fromEntries(
    readFileSync(envPath, 'utf8').split('\n').map(l => l.trim())
      .filter(l => l && !l.startsWith('#') && l.includes('='))
      .map(l => { const eq = l.indexOf('='); return [l.slice(0, eq).trim(), l.slice(eq + 1).replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '')] })
  )
}

const env = parseEnv()
if (!env.DATABASE_URL) { console.error('  ✗  DATABASE_URL missing'); process.exit(1) }

const OLD_PHONE = '050-640-6810'
const NEW_PHONE = '052-300-8350'
const DOCS = [
  { docType: 'consumer_terms', file: 'terms.he.md' },
  { docType: 'privacy_policy', file: 'privacy.he.md' },
]

const newPath = (f) => resolve(__dir, '..', 'mulu-site-src', 'src', 'content', f)
const norm    = (s) => s.replace(/\r\n/g, '\n').trim()

function firstDiff(a, b) {
  const la = a.split('\n'), lb = b.split('\n')
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) return { line: i + 1, db: la[i] ?? '(none)', expected: lb[i] ?? '(none)' }
  }
  return null
}

const client = new Client({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
})
await client.connect()

let published = 0, skipped = 0, blocked = 0

try {
  for (const { docType, file } of DOCS) {
    const newContent = readFileSync(newPath(file), 'utf8')

    // Confirm the local mirror really is the NEW phone (and not still the old one).
    if (!newContent.includes(NEW_PHONE)) { console.error(`  ✗  ${file}: NEW mirror is missing ${NEW_PHONE} — aborting`); process.exit(1) }
    if (newContent.includes(OLD_PHONE))  { console.error(`  ✗  ${file}: NEW mirror still contains ${OLD_PHONE} — aborting`); process.exit(1) }

    // The expected pre-change production content = the new mirror with the phone reverted.
    const expectedOld = newContent.split(NEW_PHONE).join(OLD_PHONE)

    const { rows } = await client.query(
      `select version, title, content from public.legal_documents
        where doc_type = $1 and locale = 'he' and is_current = true`, [docType])
    if (!rows.length) { console.error(`  ✗  ${docType}/he: no current row in DB — aborting`); process.exit(1) }
    const live = rows[0]

    if (live.content.includes(NEW_PHONE)) {
      console.log(`  ⏭  ${docType}: live DB already has ${NEW_PHONE} (v${live.version}) — skipping`)
      skipped++
      continue
    }

    if (norm(live.content) !== norm(expectedOld)) {
      const d = firstDiff(norm(live.content), norm(expectedOld))
      console.log(`\n  ⛔ ${docType}: live DB content does NOT match the new mirror (phone reverted) — REFUSING to publish (would clobber drift).`)
      if (d) {
        console.log(`     first divergence at line ${d.line}:`)
        console.log(`       DB:       ${d.db.slice(0, 120)}`)
        console.log(`       expected: ${d.expected.slice(0, 120)}`)
      }
      blocked++
      continue
    }

    const nextVersion = live.version + 1
    if (!commit) {
      console.log(`  ✓  ${docType}: live matches mirror w/ ${OLD_PHONE} (v${live.version}) → WOULD publish v${nextVersion} (${OLD_PHONE} → ${NEW_PHONE})`)
      continue
    }

    await client.query('begin')
    try {
      await client.query(
        `update public.legal_documents set is_current = false
          where doc_type = $1 and locale = 'he' and is_current = true`, [docType])
      await client.query(
        `insert into public.legal_documents
           (doc_type, locale, version, title, content, is_current, effective_date, published_at, published_by)
         values ($1, 'he', $2, $3, $4, true, current_date, now(), null)`,
        [docType, nextVersion, live.title, newContent])
      await client.query('commit')
      console.log(`  ✅ ${docType}: published v${nextVersion} (fanout trigger fired)`)
      published++
    } catch (e) {
      await client.query('rollback')
      console.error(`  ✗  ${docType}: publish failed, rolled back — ${e.message}`)
      process.exit(1)
    }
  }
} finally {
  await client.end()
}

console.log(`\n  ${commit ? 'Published' : 'Dry run'}: ${published} published · ${skipped} skipped · ${blocked} blocked`)
if (blocked > 0) { console.log('  ⚠  Blocked docs differ from the expected content — publish those via the support-app /legal UI instead.'); process.exit(2) }
