import { describe, it, expect } from 'vitest'
import { latestMigrationDefining, stripComments } from './helpers/migrations.js'

// CRITICAL contract guard — the single most load-bearing warning in this repo.
//
// nearby_jobs MUST keep returning lat / lng (and the rest of the 13-column
// shape). WorkerMap.jsx renders pending-job pins directly from job.lat /
// job.lng; a rewrite that drops them silently kills the washer map. ADR-007 /
// migration 0066 call this out explicitly ("superset only").
//
// Until now this was guarded only by:
//   - src/__tests__/useNearbyJobs.test.jsx  (hook passes MOCK rows through)
//   - scripts/verify-db.js                  (live DB, NOT in `npm run test`)
// Neither pins the SQL source in CI. This does.

const REQUIRED_COLUMNS = [
  'id', 'consumer_id', 'car_type', 'service_type', 'address_label',
  'base_price', 'platform_fee', 'total_price', 'status', 'created_at',
  'distance_km', 'lat', 'lng',
]

const { file, body } = latestMigrationDefining('nearby_jobs')

function returnsTableColumns(src) {
  const m = src.match(/returns\s+table\s*\(([\s\S]*?)\)\s*language/i)
  if (!m) throw new Error('could not locate the nearby_jobs RETURNS TABLE block')
  return m[1]
    .split(',')
    .map(s => s.trim().split(/\s+/)[0].toLowerCase())
    .filter(Boolean)
}

describe(`nearby_jobs return-shape contract (latest def: ${file})`, () => {
  const cols = returnsTableColumns(body)

  it('keeps lat AND lng in the return shape (WorkerMap pin contract)', () => {
    expect(cols).toContain('lat')
    expect(cols).toContain('lng')
  })

  it('preserves every one of the 13 canonical columns (superset-only rule)', () => {
    for (const c of REQUIRED_COLUMNS) {
      expect(cols, `missing column "${c}" in ${file}`).toContain(c)
    }
  })

  it('computes lat/lng from the PostGIS geometry (ST_Y/ST_X), not address parsing', () => {
    const lower = body.toLowerCase()
    expect(lower).toMatch(/st_y\([^)]*\)[^,]*as lat/)
    expect(lower).toMatch(/st_x\([^)]*\)[^,]*as lng/)
  })

  it('DROP FUNCTION precedes CREATE so a future shape change cannot fail to deploy', () => {
    const sql = stripComments(latestMigrationDefining('nearby_jobs').sql)
    const dropIdx = sql.search(/drop\s+function\s+if\s+exists\s+public\.nearby_jobs/i)
    const createIdx = sql.search(/create\s+(or\s+replace\s+)?function\s+public\.nearby_jobs/i)
    expect(dropIdx, 'no DROP FUNCTION IF EXISTS public.nearby_jobs before CREATE').toBeGreaterThanOrEqual(0)
    expect(createIdx).toBeGreaterThan(dropIdx)
  })
})
