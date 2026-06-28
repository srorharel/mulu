#!/usr/bin/env node
// scripts/resolve-duplicate-active-orders.mjs
//
// Unblocks migration 0131 (uniq_active_order_per_vehicle), which can't create its
// partial UNIQUE index while a (consumer_id, car_plate) has more than one LIVE
// order (status NOT IN completed/cancelled).
//
// Strategy: in each offending group, KEEP the most-recently-created live order and
// cancel the older one(s). Cancelling = the same terminal state a normal consumer
// cancel reaches; it removes the row from 0131's partial index so the migration
// can proceed.
//
// SAFE: only ever touches orders that are BOTH (a) in a group with >1 live order
// AND (b) not the newest in that group. Never touches completed/cancelled orders,
// never touches singletons. Dry-run by default — prints exactly what it would do.
//
// Local-only. Reads DATABASE_URL from .env.
//
//   node scripts/resolve-duplicate-active-orders.mjs            (dry run — inspect)
//   node scripts/resolve-duplicate-active-orders.mjs --commit   (cancel the older dups)

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname }         from 'node:path'
import { fileURLToPath }            from 'node:url'
import pkg                          from 'pg'

const { Client } = pkg
const __dir = dirname(fileURLToPath(import.meta.url))
const args   = process.argv.slice(2)
const commit = args.includes('--commit')

function parseEnv() {
  const envPath = resolve(__dir, '..', '.env')
  if (!existsSync(envPath)) { console.error('  ✗  .env not found'); process.exit(1) }
  return Object.fromEntries(
    readFileSync(envPath, 'utf8').split('\n').map(l => l.trim())
      .filter(l => l && !l.startsWith('#') && l.includes('='))
      .map(l => { const eq = l.indexOf('='); return [l.slice(0, eq).trim(), l.slice(eq + 1).replace(/\s+#.*$/, '').trim().replace(/^["']|["']$/g, '')] })
  )
}

const env = parseEnv()
if (!env.DATABASE_URL) { console.error('  ✗  DATABASE_URL missing'); process.exit(1) }

const client = new Client({
  connectionString: env.DATABASE_URL,
  ssl: env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false },
})
await client.connect()

let cancelled = 0
try {
  // Groups with >1 live order on the same consumer + plate.
  const groups = await client.query(`
    select consumer_id, car_plate
    from public.orders
    where car_plate is not null and status not in ('completed','cancelled')
    group by consumer_id, car_plate
    having count(*) > 1
    order by consumer_id, car_plate`)

  if (!groups.rowCount) { console.log('  ✓  No (consumer, plate) group has more than one live order — 0131 should apply cleanly.'); }

  for (const g of groups.rows) {
    const o = await client.query(`
      select id, status, created_at,
             washer_id is not null as has_washer, paid_at is not null as paid, total_price
      from public.orders
      where consumer_id = $1 and car_plate = $2 and status not in ('completed','cancelled')
      order by created_at desc`, [g.consumer_id, g.car_plate])

    const [keep, ...older] = o.rows  // newest kept, rest cancelled
    console.log(`\n  consumer ${g.consumer_id}  plate ${g.car_plate}  (${o.rowCount} live)`)
    console.log(`    KEEP   ${keep.id.slice(0,8)} | ${keep.status.padEnd(15)} | ${new Date(keep.created_at).toISOString().slice(0,16)} | washer:${keep.has_washer} paid:${keep.paid} | ₪${keep.total_price}`)
    for (const r of older) {
      console.log(`    CANCEL ${r.id.slice(0,8)} | ${r.status.padEnd(15)} | ${new Date(r.created_at).toISOString().slice(0,16)} | washer:${r.has_washer} paid:${r.paid} | ₪${r.total_price}`)
    }

    if (commit) {
      for (const r of older) {
        // orders has no cancelled_at column; cancelled_by is a checked text enum
        // ('consumer','washer','agent','system'). Mark these as a system/maintenance
        // cancel. The cancel notification trigger is AFTER UPDATE and non-blocking.
        await client.query(
          `update public.orders
              set status = 'cancelled',
                  cancelled_by = 'system'
            where id = $1 and status not in ('completed','cancelled')`, [r.id])
        cancelled++
      }
    }
  }
} finally {
  await client.end()
}

console.log(`\n  ${commit ? 'Cancelled' : 'Dry run — would cancel'} ${commit ? cancelled : 'the orders marked CANCEL above'}.`)
if (!commit) console.log('  Re-run with --commit to apply, then: npm run db:migrate')
