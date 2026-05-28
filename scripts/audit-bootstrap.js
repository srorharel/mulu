#!/usr/bin/env node
// scripts/audit-bootstrap.js
// Audits every migration in supabase/migrations/ against the live DB to find
// schema objects that the migration declares but that don't actually exist
// in the DB. Catches the "bootstrap" class of bug where a migration was
// recorded as applied in schema_migrations without its SQL ever running.
//
// Read-only: no DDL, no DML. Just SELECTs against information_schema /
// pg_catalog.
//
// Usage:  node scripts/audit-bootstrap.js
//
// Output: markdown table to stdout — one row per (migration, object).

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, dirname }                       from 'node:path'
import { fileURLToPath }                          from 'node:url'
import { resolve6 }                               from 'node:dns/promises'
import pkg                                        from 'pg'

const { Client } = pkg
const __dir = dirname(fileURLToPath(import.meta.url))

// ── env ──────────────────────────────────────────────────────────────────────

function parseEnv() {
  const envPath = resolve(process.cwd(), '.env')
  if (!existsSync(envPath)) {
    console.error('  ✗  .env not found')
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

const env   = parseEnv()
const dbUrl = env.DATABASE_URL
if (!dbUrl) { console.error('DATABASE_URL missing'); process.exit(1) }

// ── connect ──────────────────────────────────────────────────────────────────

async function resolvedUrl(url) {
  const m = url.match(/@([^:@/[\]]+)(:\d+)?\//)
  if (!m) return url
  const hostname = m[1]
  if (/^[\d.]+$/.test(hostname) || hostname === 'localhost') return url
  try {
    const addrs = await resolve6(hostname)
    if (addrs.length) return url.replace(`@${hostname}`, `@[${addrs[0]}]`)
  } catch {}
  return url
}

const isLocal = dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1')
const client  = new Client({
  connectionString: await resolvedUrl(dbUrl),
  ssl: isLocal ? false : { rejectUnauthorized: false },
})
await client.connect()

// ── helpers: parse one migration file ────────────────────────────────────────

// Strip SQL comments so they don't confuse object regexes.
function stripComments(sql) {
  return sql
    .replace(/--[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
}

// Extract object declarations from one migration.
// Returns array of { kind, schema, name, parent? } where:
//   kind ∈ table | column | policy | function | index | trigger | storage_bucket | storage_policy
//   parent is set for column (table name) and policy (table name).
function parseMigration(sql) {
  const out  = []
  const text = stripComments(sql)

  // CREATE TABLE
  const tableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:(public|auth|storage)\.)?([a-z_][\w]*)/gi
  for (const m of text.matchAll(tableRe)) {
    out.push({ kind: 'table', schema: (m[1] ?? 'public').toLowerCase(), name: m[2].toLowerCase() })
  }

  // ALTER TABLE ... ADD COLUMN — may have many columns per ALTER, comma-separated.
  // Capture the table once, then split the body and look for ADD COLUMN clauses.
  const alterRe = /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:(public|auth|storage)\.)?([a-z_][\w]*)([\s\S]*?);/gi
  for (const m of text.matchAll(alterRe)) {
    const schema = (m[1] ?? 'public').toLowerCase()
    const table  = m[2].toLowerCase()
    const body   = m[3]
    const colRe  = /ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][\w]*)/gi
    for (const c of body.matchAll(colRe)) {
      out.push({ kind: 'column', schema, parent: table, name: c[1].toLowerCase() })
    }
  }

  // CREATE POLICY  — name may be quoted "..." with spaces. Captures the ON table too.
  const policyRe = /CREATE\s+POLICY\s+(?:"([^"]+)"|([a-z_][\w]*))\s+ON\s+(?:(public|auth|storage)\.)?([a-z_][\w]*)/gi
  for (const m of text.matchAll(policyRe)) {
    out.push({
      kind:   'policy',
      schema: (m[3] ?? 'public').toLowerCase(),
      parent: m[4].toLowerCase(),
      name:   (m[1] ?? m[2]).toLowerCase(),
    })
  }

  // CREATE [OR REPLACE] FUNCTION
  const fnRe = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:(public|auth|storage)\.)?([a-z_][\w]*)\s*\(/gi
  for (const m of text.matchAll(fnRe)) {
    out.push({ kind: 'function', schema: (m[1] ?? 'public').toLowerCase(), name: m[2].toLowerCase() })
  }

  // CREATE INDEX
  const idxRe = /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][\w]*)/gi
  for (const m of text.matchAll(idxRe)) {
    out.push({ kind: 'index', schema: 'public', name: m[1].toLowerCase() })
  }

  // CREATE [OR REPLACE] TRIGGER
  const trgRe = /CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+([a-z_][\w]*)/gi
  for (const m of text.matchAll(trgRe)) {
    out.push({ kind: 'trigger', schema: 'public', name: m[1].toLowerCase() })
  }

  // INSERT INTO storage.buckets (id, name, ...) VALUES ('bucket-id', ...)
  const bucketRe = /INSERT\s+INTO\s+storage\.buckets[\s\S]*?VALUES\s*\(\s*'([^']+)'/gi
  for (const m of text.matchAll(bucketRe)) {
    out.push({ kind: 'storage_bucket', schema: 'storage', name: m[1].toLowerCase() })
  }

  return out
}

// ── load all migrations ──────────────────────────────────────────────────────

const migDir = resolve(__dir, '../supabase/migrations')
const files  = readdirSync(migDir)
  .filter(f => /^\d{4}_.*\.sql$/.test(f))
  .sort()

const expectations = [] // { file, ...object }
for (const f of files) {
  const sql  = readFileSync(resolve(migDir, f), 'utf8')
  const objs = parseMigration(sql)
  for (const o of objs) expectations.push({ file: f, ...o })
}

// ── load DB state ────────────────────────────────────────────────────────────

const dbTables = new Set(
  (await client.query(`
    SELECT table_schema || '.' || table_name AS fq
    FROM information_schema.tables
    WHERE table_schema IN ('public','auth','storage')
  `)).rows.map(r => r.fq.toLowerCase())
)

const dbColumns = new Set(
  (await client.query(`
    SELECT table_schema || '.' || table_name || '.' || column_name AS fq
    FROM information_schema.columns
    WHERE table_schema IN ('public','auth','storage')
  `)).rows.map(r => r.fq.toLowerCase())
)

const dbPolicies = new Set(
  (await client.query(`
    SELECT schemaname || '.' || tablename || '.' || policyname AS fq
    FROM pg_policies
  `)).rows.map(r => r.fq.toLowerCase())
)

const dbFunctions = new Set(
  (await client.query(`
    SELECT n.nspname || '.' || p.proname AS fq
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public','auth','storage')
  `)).rows.map(r => r.fq.toLowerCase())
)

const dbIndexes = new Set(
  (await client.query(`
    SELECT schemaname || '.' || indexname AS fq
    FROM pg_indexes
    WHERE schemaname IN ('public','auth','storage')
  `)).rows.map(r => r.fq.toLowerCase())
)

const dbTriggers = new Set(
  (await client.query(`
    SELECT n.nspname || '.' || t.tgname AS fq
    FROM pg_trigger t
    JOIN pg_class     c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT t.tgisinternal
      AND n.nspname IN ('public','auth','storage')
  `)).rows.map(r => r.fq.toLowerCase())
)

const dbBuckets = new Set(
  (await client.query(`SELECT id FROM storage.buckets`)).rows.map(r => r.id.toLowerCase())
)

const dbMigrations = new Set(
  (await client.query(`SELECT version FROM public.schema_migrations`)).rows.map(r => r.version.toLowerCase())
)

// ── cross-reference ──────────────────────────────────────────────────────────

function exists(o) {
  switch (o.kind) {
    case 'table':          return dbTables.has(`${o.schema}.${o.name}`)
    case 'column':         return dbColumns.has(`${o.schema}.${o.parent}.${o.name}`)
    case 'policy':         return dbPolicies.has(`${o.schema}.${o.parent}.${o.name}`)
    case 'function':       return dbFunctions.has(`${o.schema}.${o.name}`)
    case 'index':          return dbIndexes.has(`${o.schema}.${o.name}`)
    case 'trigger':        return dbTriggers.has(`${o.schema}.${o.name}`)
    case 'storage_bucket': return dbBuckets.has(o.name)
    default:               return null
  }
}

function describe(o) {
  switch (o.kind) {
    case 'table':          return `table ${o.schema}.${o.name}`
    case 'column':         return `column ${o.schema}.${o.parent}.${o.name}`
    case 'policy':         return `policy "${o.name}" on ${o.schema}.${o.parent}`
    case 'function':       return `function ${o.schema}.${o.name}`
    case 'index':          return `index ${o.schema}.${o.name}`
    case 'trigger':        return `trigger ${o.schema}.${o.name}`
    case 'storage_bucket': return `bucket ${o.name}`
    default:               return JSON.stringify(o)
  }
}

// ── report ───────────────────────────────────────────────────────────────────

let missing = 0
let present = 0

const byFile = new Map()
for (const e of expectations) {
  if (!byFile.has(e.file)) byFile.set(e.file, [])
  byFile.get(e.file).push(e)
}

console.log('| migration | recorded as applied? | object | present in DB? |')
console.log('|---|---|---|---|')

for (const [file, items] of byFile) {
  const version = file.replace(/\.sql$/, '').toLowerCase()
  const recorded = dbMigrations.has(version) ? 'yes' : 'NO'
  for (const o of items) {
    const ok = exists(o)
    const mark = ok === null ? '?' : (ok ? 'yes' : '**NO**')
    if (ok === false) missing++
    else if (ok === true) present++
    console.log(`| ${file} | ${recorded} | ${describe(o)} | ${mark} |`)
  }
}

console.log()
console.log(`Summary: ${present} present, ${missing} missing, ${expectations.length} total expectations parsed across ${files.length} migration files.`)

// Gap-only summary
const gaps = expectations.filter(o => exists(o) === false)
if (gaps.length > 0) {
  console.log('\n── Gaps only (objects declared but absent) ──')
  const gapsByFile = new Map()
  for (const g of gaps) {
    if (!gapsByFile.has(g.file)) gapsByFile.set(g.file, [])
    gapsByFile.get(g.file).push(g)
  }
  for (const [file, items] of gapsByFile) {
    console.log(`\n${file}:`)
    for (const o of items) console.log(`  - ${describe(o)}`)
  }
}

await client.end()
