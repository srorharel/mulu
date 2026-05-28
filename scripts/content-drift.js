#!/usr/bin/env node
// scripts/content-drift.js
// Compare content_overrides rows against the bundled i18n defaults for
// main, support, and admin apps. Report:
//   1. safe-to-delete   — override matches the bundled value
//   2. genuine drift    — override differs from the bundled value
//   3. orphaned         — override key is no longer in the bundle
//
// Local-only. Reads DATABASE_URL from .env. Never run in CI.

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname }          from 'node:path'
import { fileURLToPath }              from 'node:url'
import pkg                            from 'pg'

const { Client } = pkg
const __dir = dirname(fileURLToPath(import.meta.url))

function parseEnv() {
  const envPath = resolve(__dir, '..', '.env')
  if (!existsSync(envPath)) {
    console.error('  ✗  .env not found')
    process.exit(1)
  }
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
if (!env.DATABASE_URL) { console.error('  ✗  DATABASE_URL missing'); process.exit(1) }

// ── Load bundles ─────────────────────────────────────────────────────────────
const enMain = JSON.parse(readFileSync(resolve(__dir, '..', 'src/i18n/locales/en.json'), 'utf8'))
const heMain = JSON.parse(readFileSync(resolve(__dir, '..', 'src/i18n/locales/he.json'), 'utf8'))
const { resources: supportRes } = await import('../support-app/src/i18n/resources.js')
const { resources: adminRes }   = await import('../admin-app/src/i18n/resources.js')

const BUNDLES = {
  main:    { en: enMain,                he: heMain                  },
  support: { en: supportRes.en.translation, he: supportRes.he.translation },
  admin:   { en: adminRes.en.translation,   he: adminRes.he.translation   },
}

function flatten(obj, prefix = '') {
  const out = {}
  for (const k of Object.keys(obj ?? {})) {
    const v = obj[k]
    const path = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, flatten(v, path))
    else if (typeof v === 'string') out[path] = v
  }
  return out
}

const FLAT = {}
for (const app of Object.keys(BUNDLES)) {
  FLAT[app] = {}
  for (const loc of Object.keys(BUNDLES[app])) FLAT[app][loc] = flatten(BUNDLES[app][loc])
}

// ── Connect + read content_overrides ─────────────────────────────────────────
const client = new Client({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
})

await client.connect()
const { rows } = await client.query(`SELECT app, locale, key, value FROM public.content_overrides ORDER BY app, locale, key`)
await client.end()

// ── Bucket rows ──────────────────────────────────────────────────────────────
const safeToDelete = []
const genuineDrift = []
const orphaned     = []

for (const r of rows) {
  const bundled = FLAT[r.app]?.[r.locale]?.[r.key]
  if (bundled === undefined) {
    orphaned.push({ ...r, bundled: null })
  } else if (bundled === r.value) {
    safeToDelete.push({ ...r, bundled })
  } else {
    genuineDrift.push({ ...r, bundled })
  }
}

// ── Render ───────────────────────────────────────────────────────────────────
console.log(`\n── content_overrides drift report ───────────────────────────`)
console.log(`   ${rows.length} override rows total  ·  ${Date.now()}\n`)

console.log(`▌ Safe to delete (${safeToDelete.length}) — override matches bundled default`)
if (safeToDelete.length === 0) console.log('   (none)')
for (const r of safeToDelete) {
  console.log(`   ${r.app}/${r.locale}/${r.key}`)
}
if (safeToDelete.length > 0) {
  console.log('\n   Copy-paste DELETE:')
  const sql = safeToDelete.map(r =>
    `   DELETE FROM public.content_overrides WHERE app='${r.app}' AND locale='${r.locale}' AND key='${r.key.replace(/'/g, "''")}';`
  ).join('\n')
  console.log(sql)
}

console.log(`\n▌ Genuine drift (${genuineDrift.length}) — override differs from bundled default`)
if (genuineDrift.length === 0) console.log('   (none)')
for (const r of genuineDrift) {
  console.log(`\n   ${r.app}/${r.locale}/${r.key}`)
  console.log(`     bundle:   ${JSON.stringify(r.bundled)}`)
  console.log(`     override: ${JSON.stringify(r.value)}`)
}

console.log(`\n▌ Orphaned (${orphaned.length}) — key not in bundle (was the bundle pruned?)`)
if (orphaned.length === 0) console.log('   (none)')
for (const r of orphaned) {
  console.log(`   ${r.app}/${r.locale}/${r.key}   override: ${JSON.stringify(r.value)}`)
}

console.log('\n')
