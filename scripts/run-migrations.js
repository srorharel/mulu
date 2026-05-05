#!/usr/bin/env node
// scripts/run-migrations.js
// Runs all migration files then seed.sql against the Postgres DB in DATABASE_URL.
// Usage: node scripts/run-migrations.js   (or: npm run db:migrate)

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname }         from 'node:path'
import { fileURLToPath }            from 'node:url'
import { resolve6 }                 from 'node:dns/promises'
import pkg                          from 'pg'

const { Client } = pkg
const __dir = dirname(fileURLToPath(import.meta.url))

// ── Parse .env ────────────────────────────────────────────────────────────────

function parseEnv() {
  const envPath = resolve(process.cwd(), '.env')
  if (!existsSync(envPath)) {
    console.error('\n  ✗  .env not found — run: cp .env.example .env\n')
    process.exit(1)
  }
  return Object.fromEntries(
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
}

const env = parseEnv()
const dbUrl = env.DATABASE_URL

if (!dbUrl) {
  console.error('\n  ✗  DATABASE_URL is missing from .env')
  console.error('     Find it in: Supabase → Settings → Database → Connection string → URI\n')
  process.exit(1)
}

if (dbUrl.includes('[YOUR-PASSWORD]') || dbUrl.toLowerCase().includes('your-db-password')) {
  console.error('\n  ✗  DATABASE_URL still contains a placeholder — fill in your database password\n')
  process.exit(1)
}

// ── Migration files (in execution order) ─────────────────────────────────────

const files = [
  resolve(__dir, '../supabase/migrations/0001_init.sql'),
  resolve(__dir, '../supabase/migrations/0002_rls.sql'),
  resolve(__dir, '../supabase/migrations/0003_functions.sql'),
  resolve(__dir, '../supabase/migrations/0004_features.sql'),
  resolve(__dir, '../supabase/seed.sql'),
]

// ── Resolve connection URL (IPv6 fallback for Windows) ───────────────────────

async function resolvedUrl(url) {
  // Extract bare hostname from connection string (between @ and next : or /)
  const m = url.match(/@([^:@/[\]]+)(:\d+)?\//)
  if (!m) return url
  const hostname = m[1]
  if (/^[\d.]+$/.test(hostname) || hostname === 'localhost') return url
  try {
    const addrs = await resolve6(hostname)
    if (addrs.length) {
      const ipv6 = `[${addrs[0]}]`
      console.log(`  →  Resolved ${hostname} → ${ipv6}`)
      return url.replace(`@${hostname}`, `@${ipv6}`)
    }
  } catch (e) {
    console.log(`  →  IPv6 resolve failed (${e.message}), using hostname as-is`)
  }
  return url
}

// ── Run ───────────────────────────────────────────────────────────────────────

const isLocal = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1')
const connStr = await resolvedUrl(dbUrl)
const client  = new Client({
  connectionString: connStr,
  ssl: isLocal ? false : { rejectUnauthorized: false },
})

console.log('\n── Connecting to database ───────────────────────────────')

try {
  await client.connect()
  console.log('  ✓  Connected\n')
} catch (err) {
  console.error(`  ✗  Could not connect: ${err.message}\n`)
  process.exit(1)
}

let failed = false

for (const filePath of files) {
  const label = filePath.split(/[\\/]/).slice(-2).join('/')

  if (!existsSync(filePath)) {
    console.error(`  ✗  File not found: ${filePath}\n`)
    failed = true
    break
  }

  const sql = readFileSync(filePath, 'utf8')
  process.stdout.write(`  →  ${label} … `)

  try {
    await client.query('BEGIN')
    await client.query(sql)
    await client.query('COMMIT')
    console.log('✓')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    console.log('✗\n')
    console.error(`     Error in ${label}:`)
    console.error(`     ${err.message}`)
    if (err.detail)   console.error(`     Detail: ${err.detail}`)
    if (err.position) console.error(`     Position: character ${err.position}`)
    console.log()
    failed = true
    break
  }
}

await client.end()

if (failed) {
  process.exit(1)
} else {
  console.log('\n✓  All migrations applied.\n')
}
