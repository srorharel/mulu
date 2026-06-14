import { describe, it, expect } from 'vitest'
import { latestMigrationDefining, stripComments, normalize } from './helpers/migrations.js'

// Contract guard for the legal-documents data layer (migration 0107).
//
// Pins the SQL source so a future edit can't silently break the load-bearing
// invariants: the partial unique index (one current version per doc_type+locale),
// the agent-gated atomic publish (demote-before-insert), the role-based filter in
// pending_legal_acknowledgments, and the realtime publication membership. Runs in
// `npm run test` with no live DB (scripts/verify-db.js guards the same surfaces
// behaviourally against a real DATABASE_URL).

const { file, sql } = latestMigrationDefining('publish_legal_document')
const clean = stripComments(sql)
const norm = normalize(clean)

describe(`legal documents migration contract (${file})`, () => {
  it('creates both tables (idempotent)', () => {
    expect(norm).toMatch(/create table if not exists public\.legal_documents/)
    expect(norm).toMatch(/create table if not exists public\.user_legal_acknowledgments/)
  })

  it('constrains doc_type and locale to the agreed value sets', () => {
    expect(norm).toMatch(/check \(doc_type in \('consumer_terms','privacy_policy','washer_terms'\)\)/)
    expect(norm).toMatch(/check \(locale in \('he','en'\)\)/)
  })

  it('enforces at most one current version per (doc_type, locale) via a partial unique index', () => {
    expect(norm).toMatch(
      /create unique index if not exists legal_documents_one_current_idx[\s\S]*?\(doc_type, locale\)[\s\S]*?where is_current/
    )
  })

  it('enforces a unique (doc_type, locale, version) tuple', () => {
    expect(norm).toMatch(
      /create unique index if not exists legal_documents_version_uidx[\s\S]*?\(doc_type, locale, version\)/
    )
  })

  it('declares all four RPCs, each DROP-before-CREATE (shape-change safe)', () => {
    for (const fn of [
      'publish_legal_document',
      'get_current_legal_document',
      'pending_legal_acknowledgments',
      'acknowledge_legal_document',
    ]) {
      const dropIdx = clean.search(new RegExp(`drop\\s+function\\s+if\\s+exists\\s+public\\.${fn}`, 'i'))
      const createIdx = clean.search(new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+public\\.${fn}`, 'i'))
      expect(dropIdx, `no DROP FUNCTION IF EXISTS for ${fn}`).toBeGreaterThanOrEqual(0)
      expect(createIdx, `no CREATE for ${fn}`).toBeGreaterThan(dropIdx)
    }
  })

  it('publish is agent-gated and demotes the current row BEFORE inserting the new one', () => {
    const body = normalize(stripComments(latestMigrationDefining('publish_legal_document').body))
    expect(body).toMatch(/if not public\.is_agent\(\) then/)
    const demoteIdx = body.search(/update public\.legal_documents set is_current = false/)
    const insertIdx = body.search(/insert into public\.legal_documents/)
    expect(demoteIdx, 'no demote-current UPDATE in publish').toBeGreaterThanOrEqual(0)
    // demote precedes insert so the partial unique index never sees two currents
    expect(insertIdx).toBeGreaterThan(demoteIdx)
  })

  it('pending_legal_acknowledgments filters by role + gates washer_terms to post-approval (0118)', () => {
    const body = normalize(stripComments(latestMigrationDefining('pending_legal_acknowledgments').body))
    expect(body).toMatch(/if v_role = 'consumer' then v_types := array\['consumer_terms','privacy_policy'\]/)
    // washer: privacy always; the CONTRACT only once support has approved them
    expect(body).toMatch(/elsif v_role = 'washer' then if v_verif = 'approved' then v_types := array\['washer_terms','privacy_policy'\]/)
    expect(body).toMatch(/else v_types := array\['privacy_policy'\]/)
    // agents / super_admins fall through to an early return (nothing to acknowledge)
    expect(body).toMatch(/else return;/)
  })

  it('acknowledge_legal_document upserts on (user_id, doc_type)', () => {
    const body = normalize(stripComments(latestMigrationDefining('acknowledge_legal_document').body))
    expect(body).toMatch(/on conflict \(user_id, doc_type\) do update set acknowledged_version = excluded\.acknowledged_version/)
  })

  it('adds legal_documents to the supabase_realtime publication', () => {
    expect(norm).toMatch(/alter publication supabase_realtime add table public\.legal_documents/)
  })

  it('seeds v1 current he rows for all three doc types with the [למילוי] placeholder', () => {
    for (const dt of ['consumer_terms', 'privacy_policy', 'washer_terms']) {
      expect(norm).toMatch(new RegExp(`'${dt}', 'he', 1`))
    }
    // exact le-milui placeholder (lamed-mem-yod-lamed-vav-yod) — byte-verified
    expect(clean).toContain('[למילוי]')
  })

  it('ends by reloading the PostgREST schema cache', () => {
    expect(norm).toMatch(/notify pgrst, 'reload schema'/)
  })
})
