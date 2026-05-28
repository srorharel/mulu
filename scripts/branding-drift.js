#!/usr/bin/env node
// scripts/branding-drift.js
// Audit app_branding rows. Since branding has no "bundled default" that lives
// next to the URL (the fallback is a bundled image path inside each app's
// vite build), the drift dimensions are:
//   1. known-slug overrides   — slug is one of the recognized slots, URL set
//   2. orphan-slug overrides  — slug doesn't match any recognized slot
// Plus a stale-URL probe: HEAD each override URL and warn if non-2xx.

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname }          from 'node:path'
import { fileURLToPath }              from 'node:url'
import pkg                            from 'pg'

const { Client } = pkg
const __dir = dirname(fileURLToPath(import.meta.url))

function parseEnv() {
  const envPath = resolve(__dir, '..', '.env')
  if (!existsSync(envPath)) { console.error('  ✗  .env not found'); process.exit(1) }
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

// Known slot slugs — keep in sync with admin-app/src/pages/Branding.jsx SLOTS.
const KNOWN_SLUGS = new Set(['main_logo', 'support_logo', 'login_hero'])

const client = new Client({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
})
await client.connect()
const { rows } = await client.query(
  `SELECT slug, url, updated_at FROM public.app_branding ORDER BY slug`
)
await client.end()

const known   = rows.filter(r =>  KNOWN_SLUGS.has(r.slug))
const orphans = rows.filter(r => !KNOWN_SLUGS.has(r.slug))

console.log(`\n── app_branding drift report ────────────────────────────────`)
console.log(`   ${rows.length} override rows total\n`)

console.log(`▌ Known slugs with active overrides (${known.length})`)
if (known.length === 0) console.log('   (none — all slots are using the bundled image)')
for (const r of known) {
  console.log(`   ${r.slug}`)
  console.log(`     url: ${r.url}`)
  console.log(`     updated_at: ${r.updated_at?.toISOString?.() ?? r.updated_at}`)
}

console.log(`\n▌ Orphan slugs (${orphans.length}) — slug not recognized by any admin slot`)
if (orphans.length === 0) console.log('   (none)')
for (const r of orphans) {
  console.log(`   ${r.slug}   url: ${r.url}`)
}

// Probe URLs.
console.log(`\n▌ URL probes`)
if (rows.length === 0) console.log('   (no URLs to probe)')
for (const r of rows) {
  try {
    const res = await fetch(r.url, { method: 'HEAD' })
    const tag = res.ok ? '✓' : '✗'
    console.log(`   ${tag} ${res.status}  ${r.slug}  ${r.url}`)
  } catch (e) {
    console.log(`   ✗ ERR    ${r.slug}  ${r.url}  (${e.message})`)
  }
}

console.log('\n')
