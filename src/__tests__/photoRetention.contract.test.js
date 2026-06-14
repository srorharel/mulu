import { describe, it, expect } from 'vitest'
import { latestMigrationDefining, normalize } from './helpers/migrations.js'

// CRITICAL guard — 90-day car-photo retention (Privacy Policy §8.2, migration 0115).
//
// Photos must auto-delete 90 days after an order completes, EXCEPT while a dispute
// is open. The deletion runs server-side (pg_cron → Edge Function), so no UI test
// exercises it. This pins the candidate-selection rules + the dispute exception so
// they can't silently regress (e.g. someone widening the window or dropping the
// dispute guard, which would delete evidence needed for an open claim).

const { file, sql: fullSql, body } = latestMigrationDefining('list_purgeable_photos')
const candidate = normalize(body)
const migration = normalize(fullSql)

const CANDIDATE_RULES = [
  ['only completed orders are eligible',
    "o.status = 'completed'"],
  ['90-day default retention window',
    'p_retention_days int default 90'],
  ['window measured from completed_at',
    'o.completed_at < now() - make_interval(days => p_retention_days)'],
  ['already-purged orders are skipped (idempotent)',
    'o.photos_purged_at is null'],
  ['null paths are not emitted',
    'p.path is not null'],
  ['spares orders with an OPEN support conversation',
    "sc.status in ('open', 'pending_agent', 'assigned')"],
  ['spares orders with an unresolved content report',
    "cr.status in ('open', 'reviewed')"],
  ['covers the consumer car-photos bucket',
    "'car-photos'"],
  ['covers the washer job-evidence bucket',
    "'job-evidence'"],
]

describe(`photo-retention candidate contract (latest def: ${file})`, () => {
  for (const [rule, needle] of CANDIDATE_RULES) {
    it(`enforces: ${rule}`, () => {
      expect(candidate, `expected to find: ${needle}`).toContain(normalize(needle))
    })
  }

  it('enumerates both legacy and 4-angle consumer car-photo columns', () => {
    for (const col of ['car_photo_1_path', 'car_photo_front', 'car_photo_passenger']) {
      expect(candidate).toContain(col)
    }
  })

  it('enumerates arrival + completion + add-on evidence columns', () => {
    for (const col of ['arrival_photo_front', 'completion_photo_passenger', 'evidence_before_path', 'evidence_tire_pressure_path']) {
      expect(candidate).toContain(col)
    }
  })
})

describe('photo-retention purge mechanics (migration 0115)', () => {
  it('adds an idempotency / audit marker column', () => {
    expect(migration).toContain('add column if not exists photos_purged_at')
  })

  it('mark_order_photos_purged stamps photos_purged_at and nulls a path column', () => {
    expect(migration).toContain('mark_order_photos_purged')
    expect(migration).toContain('photos_purged_at           = now()'.toLowerCase().replace(/\s+/g, ' '))
    expect(migration).toContain('car_photo_1_path           = null'.toLowerCase().replace(/\s+/g, ' '))
  })

  it('candidate + purge RPCs are restricted to service_role (not consumers/washers)', () => {
    expect(migration).toContain('revoke all on function public.list_purgeable_photos')
    expect(migration).toContain('grant execute on function public.list_purgeable_photos(int) to service_role')
    expect(migration).toContain('grant execute on function public.mark_order_photos_purged(uuid[]) to service_role')
  })

  it('cron tick reads Vault secrets and fires net.http_post (non-blocking)', () => {
    expect(migration).toContain("where name = 'purge_stale_photos_url'")
    expect(migration).toContain("where name = 'service_role_key'")
    expect(migration).toContain('net.http_post')
    expect(migration).toContain('raise warning') // EXCEPTION WHEN OTHERS path
  })

  it('schedules a daily cron job', () => {
    expect(migration).toContain("'purge-stale-photos'")
    expect(migration).toContain("'0 3 * * *'")
  })
})
