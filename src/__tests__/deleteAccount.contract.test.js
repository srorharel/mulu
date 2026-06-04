/* eslint-env node */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { migrationFiles, readMigration, normalize } from './helpers/migrations.js'

// Contract guard for Phase 5 (account deletion). Pins the FK-relaxation migration
// (orders/order_events ON DELETE SET NULL) and the delete-account Edge Function's
// anonymize-vs-delete policy. No live DB (scripts/verify-db.js checks the FK
// actions against the real schema).

const readFn = (p) => readFileSync(resolve(process.cwd(), p), 'utf8')

describe('account-deletion FK migration', () => {
  const file = migrationFiles().find(
    f => /orders_consumer_id_fkey/i.test(readMigration(f)) && /on delete set null/i.test(readMigration(f))
  )

  it('exists', () => expect(file, 'no migration sets orders FK to ON DELETE SET NULL').toBeTruthy())

  it('relaxes orders + order_events FKs to ON DELETE SET NULL and nullifies consumer_id', () => {
    const n = normalize(readMigration(file))
    expect(n).toMatch(/orders_consumer_id_fkey foreign key \(consumer_id\) references public\.profiles\(id\) on delete set null/)
    expect(n).toMatch(/orders_washer_id_fkey foreign key \(washer_id\) references public\.profiles\(id\) on delete set null/)
    expect(n).toMatch(/order_events_actor_id_fkey foreign key \(actor_id\) references public\.profiles\(id\) on delete set null/)
    expect(n).toMatch(/alter column consumer_id drop not null/)
  })
})

describe('delete-account edge function', () => {
  const src = readFn('supabase/functions/delete-account/index.ts')

  it('restricts deletion to consumer/washer roles', () => {
    expect(src).toMatch(/role !== 'consumer' && [^\n]*role !== 'washer'/)
  })

  it('ANONYMIZES orders (PII nulled) and never hard-deletes them', () => {
    expect(src).toContain("from('orders').update(ORDER_PII_NULLS)")
    expect(src).toContain('car_plate: null')
    expect(src).toContain('access_notes: null')
    expect(src).not.toMatch(/from\('orders'\)\.delete\(\)/)
  })

  it('PRESERVES financial columns (not in the null set)', () => {
    expect(src).not.toMatch(/payout_amount:\s*null/)
    expect(src).not.toMatch(/total_price:\s*null/)
    expect(src).not.toMatch(/base_price:\s*null/)
    expect(src).not.toMatch(/platform_fee:\s*null/)
  })

  it('deletes blocking child rows, then the profile, then the auth user', () => {
    expect(src).toContain("from('order_messages').delete()")
    expect(src).toContain("from('support_messages').delete()")
    expect(src).toContain("from('support_conversations').delete()")
    expect(src).toContain("from('profiles').delete()")
    expect(src).toContain('auth.admin.deleteUser')
  })

  it('purges per-user storage prefixes', () => {
    expect(src).toContain("removePrefix('washer-verification'")
    expect(src).toContain("removePrefix('car-photos'")
    expect(src).toContain("removePrefix('job-evidence'")
  })
})
