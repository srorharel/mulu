#!/usr/bin/env node
// scripts/run-migrations.js
// Auto-discovers and applies migration files from supabase/migrations/.
// Tracks applied versions in public.schema_migrations so already-applied
// files are skipped on subsequent runs.
//
// Usage:
//   node scripts/run-migrations.js              # apply new migrations + seed
//   node scripts/run-migrations.js --bootstrap  # record every file in the
//                                                # migrations folder as applied
//                                                # WITHOUT executing any SQL.
//                                                # Run once after first deploy
//                                                # to hydrate schema_migrations
//                                                # for migrations that pre-date
//                                                # this script.
//   npm run db:migrate
//   npm run db:migrate:bootstrap

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, dirname }                       from 'node:path'
import { fileURLToPath }                          from 'node:url'
import { resolve6 }                               from 'node:dns/promises'
import pkg                                        from 'pg'

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

// ── Auto-discover migration files ─────────────────────────────────────────────
// Matches files like 0001_init.sql, 0014_support_rls_and_canned.sql, etc.
// Sorted lexicographically, which equals numeric order given zero-padded prefixes.

const migrationsDir = resolve(__dir, '../supabase/migrations')
const seedPath      = resolve(__dir, '../supabase/seed.sql')

const migrationFiles = readdirSync(migrationsDir)
  .filter(f => /^\d{4}_.*\.sql$/.test(f))
  .sort()
  .map(f => ({
    file:    f,
    path:    resolve(migrationsDir, f),
    version: f.replace(/\.sql$/, ''),   // e.g. "0011_support_role"
  }))

// ── Resolve connection URL (IPv6 fallback for Windows) ───────────────────────

async function resolvedUrl(url) {
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

// ── Connect ───────────────────────────────────────────────────────────────────

const isBootstrap = process.argv.includes('--bootstrap')
const isLocal     = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1')
const connStr     = await resolvedUrl(dbUrl)
const client      = new Client({
  connectionString: connStr,
  ssl: isLocal ? false : { rejectUnauthorized: false },
})

console.log(isBootstrap
  ? '\n── Bootstrapping schema_migrations ─────────────────────'
  : '\n── Connecting to database ───────────────────────────────'
)

try {
  await client.connect()
  console.log('  ✓  Connected\n')
} catch (err) {
  console.error(`  ✗  Could not connect: ${err.message}\n`)
  process.exit(1)
}

// ── Ensure schema_migrations table exists (always, before anything else) ─────

await client.query(`
  create table if not exists public.schema_migrations (
    version    text primary key,
    applied_at timestamptz not null default now()
  )
`)

// ── Bootstrap mode ────────────────────────────────────────────────────────────
// Inserts a row for every migration file currently in the folder, marking each
// as applied, without executing any of their SQL.  Run once after first deploy
// to bring schema_migrations in sync with an already-migrated database.

if (isBootstrap) {
  console.log('  Recording all migration files as applied (no SQL executed):\n')
  let inserted = 0
  let skipped  = 0

  for (const { file, version } of migrationFiles) {
    const { rowCount } = await client.query(
      `insert into public.schema_migrations (version) values ($1)
       on conflict (version) do nothing`,
      [version]
    )
    if (rowCount > 0) {
      console.log(`  ✓  inserted  ${file}`)
      inserted++
    } else {
      console.log(`  –  exists    ${file}`)
      skipped++
    }
  }

  console.log(`\n  ${inserted} inserted, ${skipped} already existed.`)
  await client.end()
  console.log('\n✓  Bootstrap complete.\n')
  process.exit(0)
}

// ── Normal run ────────────────────────────────────────────────────────────────

let failed = false

for (const { file, path: filePath, version } of migrationFiles) {
  const label = `migrations/${file}`

  // Skip migrations already recorded in schema_migrations
  const { rows } = await client.query(
    'select 1 from public.schema_migrations where version = $1',
    [version]
  )
  if (rows.length > 0) {
    console.log(`  –  ${label} … skip (already applied)`)
    continue
  }

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
    // Insert into schema_migrations in the same transaction — if the SQL above
    // fails and we ROLLBACK, this insert is rolled back too.
    await client.query(
      'insert into public.schema_migrations (version) values ($1)',
      [version]
    )
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

// ── Seed (always runs, not tracked in schema_migrations) ─────────────────────

if (!failed && existsSync(seedPath)) {
  const label = 'supabase/seed.sql'
  const sql   = readFileSync(seedPath, 'utf8')
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
  }
}

await client.end()

if (failed) {
  process.exit(1)
} else {
  console.log('\n✓  All migrations applied.\n')
}
