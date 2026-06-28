#!/usr/bin/env node
// scripts/republish-legal-disclosures.mjs
//
// One-off: re-publish consumer_terms + privacy_policy (he) to add the
// audit-required disclosures (Jun 2026):
//   • privacy §2(ד): card-on-file (saved-card token) storage clause
//   • privacy §4:   Cloudflare sub-processor (masked-call WebRTC TURN relay)
//   • terms §6.5.1: saved-card billing-consent clause
//
// SAFETY-GUARDED — same no-clobber discipline as repoint-legal-phone.mjs. It only
// publishes a doc if the live DB content EXACTLY equals the expected pre-change
// content, reconstructed as: the committed (git HEAD) mirror with the contact
// phone swapped OLD→NEW (i.e. the v4 state that repoint-legal-phone already
// published). If the live DB has drifted from that, it REFUSES to publish that
// doc (publish it via the support-app /legal UI instead). If the live DB already
// contains the new disclosure, it skips.
//
// Publishing inserts a new is_current version (version+1), which fires the
// AFTER INSERT fanout trigger (trg_notify_on_legal_publish) → pushes a
// legal_update to every user.
//
// Local-only. Reads DATABASE_URL from .env. The mirror files in
// mulu-site-src/src/content/ must already contain the new disclosures.
//
//   node scripts/republish-legal-disclosures.mjs            (dry run)
//   node scripts/republish-legal-disclosures.mjs --commit   (publish + fire push)

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname }         from 'node:path'
import { fileURLToPath }            from 'node:url'
import { execFileSync }             from 'node:child_process'
import pkg                          from 'pg'

const { Client } = pkg
const __dir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dir, '..')

const args   = process.argv.slice(2)
const commit = args.includes('--commit')

// Contact phone published to v4 by repoint-legal-phone.mjs (old → new swap).
const OLD_PHONE = '050-640-6810'
const NEW_PHONE = '052-300-8350'

// Each doc must gain a recognizable disclosure marker, so we can detect "already
// published" and assert the new mirror actually contains the addition.
const DOCS = [
  { docType: 'consumer_terms', file: 'terms.he.md',   marker: 'שמירת אמצעי תשלום (כרטיס שמור)' },
  { docType: 'privacy_policy', file: 'privacy.he.md', marker: 'ספק שירותי תקשורת קולית (Cloudflare)' },
]

function parseEnv() {
  const envPath = resolve(repoRoot, '.env')
  if (!existsSync(envPath)) { console.error('  ✗  .env not found'); process.exit(1) }
  return Object.fromEntries(
    readFileSync(envPath, 'utf8').split('\n').map(l => l.trim())
      .filter(l => l && !l.startsWith('#') && l.includes('='))
      .map(l => { const eq = l.indexOf('='); return [l.slice(0, eq).trim(), l.slice(eq + 1).replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '')] })
  )
}

const env = parseEnv()
if (!env.DATABASE_URL) { console.error('  ✗  DATABASE_URL missing'); process.exit(1) }

const mirrorPath = (f) => resolve(repoRoot, 'mulu-site-src', 'src', 'content', f)
const relPath    = (f) => `mulu-site-src/src/content/${f}`
const norm       = (s) => s.replace(/\r\n/g, '\n').trim()

function gitHead(relativePath) {
  // Committed version of the file (old phone, no disclosures).
  return execFileSync('git', ['show', `HEAD:${relativePath}`], { cwd: repoRoot, encoding: 'utf8' })
}

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
  for (const { docType, file, marker } of DOCS) {
    const newContent = readFileSync(mirrorPath(file), 'utf8')

    // The new mirror MUST contain the disclosure + the new phone, and not the old.
    if (!newContent.includes(marker)) { console.error(`  ✗  ${file}: mirror missing disclosure marker — aborting`); process.exit(1) }
    if (!newContent.includes(NEW_PHONE)) { console.error(`  ✗  ${file}: mirror missing ${NEW_PHONE} — aborting`); process.exit(1) }
    if (newContent.includes(OLD_PHONE)) { console.error(`  ✗  ${file}: mirror still contains ${OLD_PHONE} — aborting`); process.exit(1) }

    // Reconstruct the expected live-DB content WITHOUT transcribing the edits:
    // committed mirror (old phone, no disclosures) with the phone swapped to NEW.
    // That equals exactly what repoint-legal-phone.mjs published as v4.
    const head = gitHead(relPath(file))
    if (head.includes(marker)) { console.error(`  ✗  ${file}: HEAD already has the disclosure — this script assumes an un-committed addition; aborting`); process.exit(1) }
    const expectedLive = head.split(OLD_PHONE).join(NEW_PHONE)

    const { rows } = await client.query(
      `select version, title, content from public.legal_documents
        where doc_type = $1 and locale = 'he' and is_current = true`, [docType])
    if (!rows.length) { console.error(`  ✗  ${docType}/he: no current row in DB — aborting`); process.exit(1) }
    const live = rows[0]

    if (live.content.includes(marker)) {
      console.log(`  ⏭  ${docType}: live DB already has the disclosure (v${live.version}) — skipping`)
      skipped++
      continue
    }

    if (norm(live.content) !== norm(expectedLive)) {
      const d = firstDiff(norm(live.content), norm(expectedLive))
      console.log(`\n  ⛔ ${docType}: live DB content does NOT match the expected pre-change state — REFUSING to publish (would clobber drift).`)
      if (d) {
        console.log(`     first divergence at line ${d.line}:`)
        console.log(`       DB:       ${d.db.slice(0, 140)}`)
        console.log(`       expected: ${d.expected.slice(0, 140)}`)
      }
      blocked++
      continue
    }

    const nextVersion = live.version + 1
    if (!commit) {
      console.log(`  ✓  ${docType}: live matches expected v${live.version} → WOULD publish v${nextVersion} (+ ${marker.slice(0, 40)}…) and fire the all-user push`)
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
      console.log(`  ✅ ${docType}: published v${nextVersion} (fanout trigger fired → legal_update push)`)
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
if (blocked > 0) { console.log('  ⚠  Blocked docs differ from expected — publish those via the support-app /legal UI instead.'); process.exit(2) }
