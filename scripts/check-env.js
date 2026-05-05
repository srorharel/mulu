#!/usr/bin/env node
// scripts/check-env.js
// Verifies all three .env values are present, non-placeholder, and well-formed,
// then confirms the Supabase project is reachable over HTTPS.
// Does NOT check migration state — that is db:verify's job.
// Usage: node scripts/check-env.js   (or: npm run check:env)

import { readFileSync, existsSync } from 'node:fs'
import { resolve }                  from 'node:path'

const PLACEHOLDER_URL = 'https://your-project-id.supabase.co'
const PLACEHOLDER_KEY = 'your-anon-key-here'

let allPassed = true
function ok(msg)  { console.log (`  ✓  ${msg}`) }
function bad(msg) { console.error(`  ✗  ${msg}`); allPassed = false }
function die(msg) { console.error(`  ✗  ${msg}\n`); process.exit(1) }

// ── 1. Parse .env ─────────────────────────────────────────────────────────────

const envPath = resolve(process.cwd(), '.env')
if (!existsSync(envPath)) {
  die('.env not found\n     Run:  Copy-Item .env.example .env  then fill in your values')
}

const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => {
      const eq  = l.indexOf('=')
      const val = l.slice(eq + 1).replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '')
      return [l.slice(0, eq).trim(), val]
    })
)

// ── 2. Validate values ────────────────────────────────────────────────────────

console.log('\n── Env vars ─────────────────────────────────────────────')

const url   = env.VITE_SUPABASE_URL   ?? ''
const key   = env.VITE_SUPABASE_ANON_KEY ?? ''
const dbUrl = env.DATABASE_URL        ?? ''

// VITE_SUPABASE_URL
if (!url)
  bad('VITE_SUPABASE_URL is missing')
else if (url === PLACEHOLDER_URL)
  bad('VITE_SUPABASE_URL is still the placeholder — paste your real Project URL')
else if (!url.startsWith('https://'))
  bad(`VITE_SUPABASE_URL must start with https://  (got: ${url})`)
else if (!url.includes('.supabase.co'))
  bad(`VITE_SUPABASE_URL doesn't look like a Supabase URL  (got: ${url})`)
else
  ok(`VITE_SUPABASE_URL = ${url}`)

// VITE_SUPABASE_ANON_KEY
if (!key)
  bad('VITE_SUPABASE_ANON_KEY is missing')
else if (key === PLACEHOLDER_KEY)
  bad('VITE_SUPABASE_ANON_KEY is still the placeholder — paste your real anon key')
else if (key.split('.').length !== 3)
  bad("VITE_SUPABASE_ANON_KEY doesn't look like a JWT (expected 3 dot-separated segments)")
else
  ok(`VITE_SUPABASE_ANON_KEY = ${key.slice(0, 24)}…`)

// DATABASE_URL
if (!dbUrl)
  bad('DATABASE_URL is missing from .env')
else if (dbUrl.includes('[YOUR-PASSWORD]') || dbUrl.includes('[password]'))
  bad("DATABASE_URL still contains a placeholder — replace [YOUR-PASSWORD] with your real database password")
else if (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://'))
  bad(`DATABASE_URL must start with postgresql://  (got: ${dbUrl.split('@')[0]})`)
else {
  // redact password before printing
  const display = dbUrl.replace(/:([^:@\s]+)@/, ':***@')
  ok(`DATABASE_URL = ${display}`)
}

if (!allPassed) { console.log(); process.exit(1) }

// ── 3. Network reachability ───────────────────────────────────────────────────

console.log('\n── Network ──────────────────────────────────────────────')

let rootRes
try {
  // /auth/v1/settings is publicly readable with just the anon key and works
  // regardless of RLS or PostgREST service-role requirements on /rest/v1/
  rootRes = await fetch(`${url}/auth/v1/settings`, {
    headers: { apikey: key },
  })
} catch (err) {
  die(`Cannot reach ${url}\n     ${err.message}\n     Check your VITE_SUPABASE_URL and internet connection.`)
}

if (rootRes.ok) {
  ok(`Supabase project reachable  (HTTP ${rootRes.status})`)
} else {
  const body = await rootRes.text().catch(() => '')
  if (rootRes.status === 401) {
    bad('HTTP 401 — VITE_SUPABASE_ANON_KEY is invalid or from a different project')
  } else {
    bad(`Unexpected HTTP ${rootRes.status}: ${body.slice(0, 160)}`)
  }
  console.log()
  process.exit(1)
}

console.log('\n✓  All checks passed — ready to run migrations.\n')
