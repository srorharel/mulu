/* eslint-env node */
import { describe, it, expect } from 'vitest'
import { migrationFiles, readMigration, normalize } from './helpers/migrations.js'

// Contract guard for the UGC moderation migration (Phase 6, 0110). Pins the RLS
// shape that makes "reporter reads only own, agents read all" true, and the
// CHECK constraints. (scripts/verify-db.js exercises the RLS behaviourally.)

const file = migrationFiles().find(f => /create table if not exists public\.content_reports/i.test(readMigration(f)))
const n = file ? normalize(readMigration(file)) : ''

describe(`content_reports / content_blocks migration (${file})`, () => {
  it('exists', () => expect(file, 'no migration creates content_reports').toBeTruthy())

  it('reporters read only their own; agents read all', () => {
    expect(n).toMatch(/for select to authenticated using \(reporter_id = auth\.uid\(\)\)/)
    expect(n).toMatch(/for select to authenticated using \(public\.is_agent\(\)\)/)
  })

  it('reporters can only insert rows attributed to themselves', () => {
    expect(n).toMatch(/for insert to authenticated with check \(reporter_id = auth\.uid\(\)\)/)
  })

  it('constrains context and status', () => {
    expect(n).toMatch(/check \(context in \('order_chat','support_chat'\)\)/)
    expect(n).toMatch(/check \(status in \('open','reviewed','actioned'\)\)/)
  })

  it('content_blocks is owner-scoped', () => {
    expect(n).toMatch(/create table if not exists public\.content_blocks/)
    expect(n).toMatch(/using \(blocker_id = auth\.uid\(\)\)/)
  })

  it('adds content_reports to the realtime publication', () => {
    expect(n).toMatch(/alter publication supabase_realtime add table public\.content_reports/)
  })
})
