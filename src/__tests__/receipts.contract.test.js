import { describe, it, expect } from 'vitest'
import { latestMigrationDefining, normalize } from './helpers/migrations.js'

// CRITICAL guard — receipt issuing (ADR-041, migration 0113).
//
// Receipts are legal/financial records issued by a SECURITY DEFINER trigger
// when an order reaches 'completed'. Nothing in the UI suites exercises the
// trigger, so this pins the LATEST issue_receipt_on_completion definition:
// the snapshot semantics, idempotency, kill switch, and the non-blocking
// guarantee (a receipt failure must never abort the order transition).

const { file, sql: fullSql, body } = latestMigrationDefining('issue_receipt_on_completion')
const sql = normalize(body)
const migration = normalize(fullSql)

const REQUIRED_RULES = [
  ['skips anonymized/consumer-less orders',
    'new.consumer_id is null'],
  ['kill switch: receipts_enabled config gates issuing',
    "get_config_text('receipts_enabled', 'true')"],
  ['idempotent: UNIQUE(order_id) conflict short-circuits',
    'on conflict (order_id) do nothing'],
  ['business details snapshotted at issue time (not joined later)',
    "get_config_text('receipt_business_name'"],
  ['dealer number snapshotted',
    "get_config_text('receipt_dealer_number'"],
  ['sender email snapshotted',
    "get_config_text('receipt_sender_email'"],
  ['VAT split computed from configurable rate',
    "get_config_number('receipt_vat_rate_percent', 18)"],
  ['emails via the send-receipt edge function (vault URL)',
    "vault.decrypted_secrets where name = 'send_receipt_url'"],
  ['schema-qualified pg_net call (the 0080 lesson)',
    'net.http_post('],
  ['missing vault secret degrades to warning, receipt still issued',
    'issued but not emailed'],
  ['non-blocking: any failure is a warning, never an abort',
    'failed (non-blocking)'],
  ['runs as SECURITY DEFINER (reads auth.users for the email)',
    'security definer'],
]

describe(`receipts contract (latest def: ${file})`, () => {
  for (const [rule, needle] of REQUIRED_RULES) {
    it(`enforces: ${rule}`, () => {
      expect(sql, `expected to find: ${needle}`).toContain(needle)
    })
  }

  it('trigger fires only on a transition INTO completed', () => {
    expect(migration).toContain("new.status = 'completed' and old.status is distinct from 'completed'")
    expect(migration).toContain('after update of status on public.orders')
  })

  it('receipt numbering is a sequence (sequential, gapless-enough, unique)', () => {
    expect(migration).toContain('create sequence if not exists public.receipt_number_seq')
    expect(migration).toContain("nextval('public.receipt_number_seq')")
    expect(migration).toMatch(/receipt_number\s+bigint not null unique/)
  })

  it('has the explicit super_admin SELECT policy (the 0090 lesson)', () => {
    expect(migration).toContain('"receipts super_admin read"')
    expect(migration).toContain('public.is_super_admin()')
  })

  it('consumers can read their own receipts', () => {
    expect(migration).toContain('"receipts consumer own read"')
    expect(migration).toContain('consumer_id = auth.uid()')
  })

  it('admin resend is super_admin-gated and never exposes vault secrets to the client', () => {
    expect(migration).toContain('admin_resend_receipt')
    expect(migration).toContain('not_super_admin')
    expect(migration).toContain('revoke all on function public.admin_resend_receipt(uuid) from public')
  })

  it('seeds every admin-configurable receipt key', () => {
    for (const key of [
      'receipts_enabled', 'receipt_business_name', 'receipt_dealer_number',
      'receipt_business_address', 'receipt_business_phone', 'receipt_sender_email',
      'receipt_sender_name', 'receipt_footer_text', 'receipt_vat_rate_percent',
    ]) {
      expect(migration, `missing seed for ${key}`).toContain(`'${key}'`)
    }
    expect(migration).toContain('on conflict (key) do nothing')
  })
})
