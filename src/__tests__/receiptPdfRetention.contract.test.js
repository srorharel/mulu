import { describe, it, expect } from 'vitest'
import { latestMigrationDefining, normalize } from './helpers/migrations.js'

// CRITICAL guard — 6-month receipt-PDF retention (migration 0122).
//
// The receipt ROW is a legal/financial record kept indefinitely (Israeli tax law
// ~7 years); this job reclaims STORAGE only by deleting the regenerable archived
// PDF ~6 months after issue and nulling pdf_path. The deletion runs server-side
// (pg_cron → Edge Function), so no UI test exercises it. This pins the
// candidate-selection rules and the "row is retained, only the PDF is purged"
// guarantee so they can't silently regress into deleting financial records.

const { file, sql: fullSql, body } = latestMigrationDefining('list_purgeable_receipt_pdfs')
const candidate = normalize(body)
const migration = normalize(fullSql)

const CANDIDATE_RULES = [
  ['only receipts that still have an archived PDF are eligible (idempotent)',
    'r.pdf_path is not null'],
  ['~6-month default retention window (180 days)',
    'p_retention_days int default 180'],
  ['window measured from issue time (created_at)',
    'r.created_at < now() - make_interval(days => p_retention_days)'],
  ['emits the receipt id + its storage path',
    'select r.id, r.pdf_path'],
]

describe(`receipt-PDF-retention candidate contract (latest def: ${file})`, () => {
  for (const [rule, needle] of CANDIDATE_RULES) {
    it(`enforces: ${rule}`, () => {
      expect(candidate, `expected to find: ${needle}`).toContain(normalize(needle))
    })
  }
})

describe('receipt-PDF-retention purge mechanics (migration 0122)', () => {
  it('adds an idempotency / audit marker column without touching the row', () => {
    expect(migration).toContain('add column if not exists pdf_purged_at')
  })

  it('mark_receipt_pdfs_purged nulls ONLY pdf_path + stamps pdf_purged_at (row kept)', () => {
    expect(migration).toContain('mark_receipt_pdfs_purged')
    expect(migration).toContain(normalize('SET pdf_path = NULL, pdf_purged_at = now()'))
    // never deletes the receipt row itself
    expect(migration).not.toContain('delete from public.receipts')
  })

  it('candidate + purge RPCs are restricted to service_role (not consumers/washers/agents)', () => {
    expect(migration).toContain('revoke all on function public.list_purgeable_receipt_pdfs')
    expect(migration).toContain('grant execute on function public.list_purgeable_receipt_pdfs(int) to service_role')
    expect(migration).toContain('grant execute on function public.mark_receipt_pdfs_purged(uuid[]) to service_role')
  })

  it('cron tick reads Vault secrets and fires net.http_post (non-blocking)', () => {
    expect(migration).toContain("where name = 'purge_receipt_pdfs_url'")
    expect(migration).toContain("where name = 'service_role_key'")
    expect(migration).toContain('net.http_post')
    expect(migration).toContain('raise warning') // EXCEPTION WHEN OTHERS path
  })

  it('schedules a daily cron job', () => {
    expect(migration).toContain("'purge-receipt-pdfs'")
    expect(migration).toContain("'30 3 * * *'")
  })
})
