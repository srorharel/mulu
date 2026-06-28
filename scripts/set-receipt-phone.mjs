#!/usr/bin/env node
// scripts/set-receipt-phone.mjs — one-off: set app_config.receipt_business_phone.
// Reads DATABASE_URL from .env. Run: node scripts/set-receipt-phone.mjs [--commit]
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname }         from 'node:path'
import { fileURLToPath }            from 'node:url'
import pkg                          from 'pg'

const { Client } = pkg
const __dir = dirname(fileURLToPath(import.meta.url))
const commit = process.argv.slice(2).includes('--commit')
const NEW = '052-300-8350'

const envPath = resolve(__dir, '..', '.env')
if (!existsSync(envPath)) { console.error('  ✗  .env not found'); process.exit(1) }
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8').split('\n').map(l => l.trim())
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const eq = l.indexOf('='); return [l.slice(0, eq).trim(), l.slice(eq + 1).replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '')] })
)
if (!env.DATABASE_URL) { console.error('  ✗  DATABASE_URL missing'); process.exit(1) }

const client = new Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await client.connect()
try {
  const { rows } = await client.query(`select value from public.app_config where key = 'receipt_business_phone'`)
  console.log(`  current receipt_business_phone = ${rows.length ? JSON.stringify(rows[0].value) : '(missing row)'}`)
  if (!commit) { console.log(`  WOULD set → ${NEW} (run with --commit)`); process.exit(0) }
  const r = await client.query(
    `update public.app_config set value = $1::jsonb, updated_at = now() where key = 'receipt_business_phone'`,
    [JSON.stringify({ value: NEW })])
  console.log(r.rowCount ? `  ✅ set receipt_business_phone = ${NEW}` : '  ✗  no row updated (key missing)')
} finally { await client.end() }
