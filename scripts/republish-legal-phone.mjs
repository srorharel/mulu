#!/usr/bin/env node
// scripts/republish-legal-phone.mjs
//
// One-off: re-publish consumer_terms + privacy_policy (he) to add the contact
// phone (050-640-6810). SAFETY-GUARDED — it only publishes a doc if the live DB
// content STILL matches the pre-phone .md mirror, so it can never clobber
// production legal text that drifted from the repo. Publishing inserts a new
// is_current version (version+1), which fires the AFTER INSERT fanout trigger
// (trg_notify_on_legal_publish) → pushes a legal_update to every user.
//
// Local-only. Reads DATABASE_URL from .env.
//
//   node scripts/republish-legal-phone.mjs --old-dir <dir>            (dry run)
//   node scripts/republish-legal-phone.mjs --old-dir <dir> --commit   (publish)
//
// <dir> holds the PRE-phone docs: terms.he.md, privacy.he.md
// (produced via: git show HEAD~1:mulu-site-src/src/content/<f> > <dir>/<f>)

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname, join }    from 'node:path'
import { fileURLToPath }             from 'node:url'
import pkg                           from 'pg'

const { Client } = pkg
const __dir = dirname(fileURLToPath(import.meta.url))

const args    = process.argv.slice(2)
const commit  = args.includes('--commit')
const oldDir  = args[args.indexOf('--old-dir') + 1]
if (!oldDir || !existsSync(oldDir)) { console.error('  ✗  --old-dir <dir> required (pre-phone .md files)'); process.exit(1) }

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

const PHONE = '050-640-6810'
const DOCS = [
  { docType: 'consumer_terms', file: 'terms.he.md' },
  { docType: 'privacy_policy', file: 'privacy.he.md' },
]

const newPath = (f) => resolve(__dir, '..', 'mulu-site-src', 'src', 'content', f)
const norm    = (s) => s.replace(/\r\n/g, '\n').trim()

// Show the first line index where two strings diverge — for the abort report.
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
    const oldContent = readFileSync(join(oldDir, file), 'utf8')

    // Confirm the local delta really is just the phone.
    if (!newContent.includes(PHONE)) { console.error(`  ✗  ${file}: NEW mirror is missing ${PHONE} — aborting`); process.exit(1) }
    if (oldContent.includes(PHONE))  { console.error(`  ✗  ${oldDir}/${file}: OLD mirror already has ${PHONE} — wrong --old-dir?`); process.exit(1) }

    const { rows } = await client.query(
      `select version, title, content from public.legal_documents
        where doc_type = $1 and locale = 'he' and is_current = true`, [docType])
    if (!rows.length) { console.error(`  ✗  ${docType}/he: no current row in DB — aborting`); process.exit(1) }
    const live = rows[0]

    if (live.content.includes(PHONE)) {
      console.log(`  ⏭  ${docType}: live DB already has the phone (v${live.version}) — skipping`)
      skipped++
      continue
    }

    if (norm(live.content) !== norm(oldContent)) {
      const d = firstDiff(norm(live.content), norm(oldContent))
      console.log(`\n  ⛔ ${docType}: live DB content does NOT match the pre-phone mirror — REFUSING to publish (would clobber drift).`)
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
      console.log(`  ✓  ${docType}: live matches pre-phone mirror (v${live.version}) → WOULD publish v${nextVersion} (+phone)`)
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
if (blocked > 0) { console.log('  ⚠  Blocked docs differ from the repo mirror — publish those via the support-app /legal UI instead.'); process.exit(2) }
