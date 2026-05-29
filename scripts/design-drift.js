#!/usr/bin/env node
// scripts/design-drift.js
// Compare design_overrides rows against the registered manifest in
// admin-app/src/data/editableManifest.json. Reports:
//   1. orphaned   — override id is no longer in the manifest (instrumented
//                   component was removed / renamed)
//   2. active     — override id matches a known surface
//   3. unbounded  — override value is outside the ADR-027 bounds (should
//                   never happen because the RPC validates, but useful
//                   if the table is ever written via a back-door)
//
// Local-only. Reads DATABASE_URL from .env.

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

const manifest = JSON.parse(readFileSync(resolve(__dir, '..', 'admin-app/src/data/editableManifest.json'), 'utf8'))
const KNOWN_IDS = new Set(manifest.surfaces.map(s => `${s.app}.${s.id}`))

const BOUNDS = {
  offset_x:      [-100, 100],
  offset_y:      [-100, 100],
  text_size:     [0.7, 1.5],
  border_radius: [0, 32],
  padding:       [0, 48],
}

const isLocal = env.DATABASE_URL.includes('localhost') || env.DATABASE_URL.includes('127.0.0.1')
const client = new Client({ connectionString: env.DATABASE_URL, ssl: isLocal ? false : { rejectUnauthorized: false } })
await client.connect()

const { rows } = await client.query(`
  SELECT id, app, property, value FROM public.design_overrides
  ORDER BY app, id, property
`)

const orphans   = []
const active    = []
const unbounded = []

for (const r of rows) {
  const key = `${r.app}.${r.id}`
  if (!KNOWN_IDS.has(key)) orphans.push(r)
  else                      active.push(r)
  const v = r.value?.value
  if (BOUNDS[r.property] && typeof v === 'number') {
    const [lo, hi] = BOUNDS[r.property]
    if (v < lo || v > hi) unbounded.push({ ...r, _bounds: BOUNDS[r.property] })
  }
}

await client.end()

console.log('\n── design override drift ───────────────────────────────────')
console.log(`active   : ${active.length}`)
console.log(`orphaned : ${orphans.length}${orphans.length ? '  (id no longer in manifest)' : ''}`)
console.log(`unbounded: ${unbounded.length}${unbounded.length ? '  (back-door write or bound change)' : ''}`)
if (orphans.length) {
  console.log('\norphaned:')
  for (const r of orphans) console.log(`  ${r.app}/${r.id}.${r.property} = ${JSON.stringify(r.value)}`)
}
if (unbounded.length) {
  console.log('\nunbounded:')
  for (const r of unbounded) console.log(`  ${r.app}/${r.id}.${r.property} = ${JSON.stringify(r.value)}  (allowed: ${r._bounds.join(' to ')})`)
}
console.log()
