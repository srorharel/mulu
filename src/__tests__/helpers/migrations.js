/* eslint-env node */
// Test helper: read + locate SQL migrations from the Vitest (Node) side.
//
// The CRITICAL contract guards in this directory pin the *latest* deployed
// definition of a Postgres function against accidental regressions. They parse
// the SQL source directly so they run in `npm run test` with no live DB
// (scripts/verify-db.js already guards the same surfaces, but it needs a real
// DATABASE_URL and is not part of the Vitest suite).
//
// "Latest definition" = the highest-numbered NNNN_*.sql migration whose text
// contains a `CREATE [OR REPLACE] FUNCTION public.<name>(`. When a future
// migration redefines a function, these guards automatically follow it.

import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

// `npm run test` (vitest) runs from the repo root (package.json dir), so
// process.cwd() resolves to it. (import.meta.url is not a file: URL under
// Vitest's module transform, so we can't use fileURLToPath here.)
const MIGRATIONS_DIR = resolve(process.cwd(), 'supabase/migrations')

// Only real, numbered migrations — excludes _rollback_*.sql scratch files
// (which would otherwise sort AFTER the 0NNN files because '_' > '0').
export function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter(f => /^\d{4}_.*\.sql$/.test(f))
    .sort()
}

export function readMigration(file) {
  return readFileSync(`${MIGRATIONS_DIR}/${file}`, 'utf8')
}

function createFnRegex(funcName) {
  return new RegExp(
    `create\\s+(or\\s+replace\\s+)?function\\s+public\\.${funcName}\\s*\\(`,
    'i'
  )
}

// Returns { file, sql, body } for the highest-numbered migration that defines
// funcName. `body` is the SQL sliced from that function's CREATE onward, so
// callers parsing a return-shape / function body aren't tripped up by other
// functions declared earlier in the same file.
export function latestMigrationDefining(funcName) {
  const re = createFnRegex(funcName)
  const matches = migrationFiles().filter(f => re.test(readMigration(f)))
  if (matches.length === 0) {
    throw new Error(`No migration defines public.${funcName}(...)`)
  }
  const file = matches[matches.length - 1]
  const sql = readMigration(file)
  const body = sql.slice(sql.search(re))
  return { file, sql, body }
}

// Collapse all whitespace runs to single spaces and lowercase, so substring
// assertions are robust to indentation / line-wrapping changes.
export function normalize(sql) {
  return sql.replace(/\s+/g, ' ').toLowerCase()
}

// Strip SQL comments so statement-ordering checks aren't fooled by an ADR
// comment header that quotes the very SQL it's describing (e.g. 0097's header
// quotes "CREATE OR REPLACE FUNCTION public.nearby_jobs(...)"). None of these
// migrations contain "--" or "/* */" inside a string literal or function body
// string, so this is safe here.
export function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
}
