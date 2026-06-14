/* eslint-env node */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { latestMigrationDefining, stripComments, normalize } from './helpers/migrations.js'

// Contract guard for "legal consent recorded at registration" (migration 0121).
//
// The signup Terms+Privacy checkbox must be PERSISTED, not just client-side
// gating — otherwise pending_legal_acknowledgments re-reports the docs and
// LegalUpdateModal re-prompts a user immediately after they registered. This
// pins (a) the handle_new_user seeding (gated on accepted_legal, role-scoped,
// never seeds the post-approval washer contract) and (b) SignUp passing the flag.
// No live DB.

const readFn = (p) => readFileSync(resolve(process.cwd(), p), 'utf8')

describe('handle_new_user seeds legal consent (0121)', () => {
  const { body } = latestMigrationDefining('handle_new_user')
  const norm = normalize(stripComments(body))

  it('redefines handle_new_user (CREATE OR REPLACE keeps the trigger binding)', () => {
    expect(norm).toMatch(/create or replace function public\.handle_new_user/)
  })

  it('still creates the profile from raw_user_meta_data', () => {
    expect(norm).toMatch(/insert into public\.profiles \(id, role, full_name, phone\)/)
  })

  it('gates the acknowledgment insert on the accepted_legal flag', () => {
    expect(norm).toMatch(/new\.raw_user_meta_data->>'accepted_legal'\) = 'true'/)
  })

  it('seeds user_legal_acknowledgments role-scoped: consumer terms+privacy, washer privacy only', () => {
    expect(norm).toMatch(/insert into public\.user_legal_acknowledgments \(user_id, doc_type, acknowledged_version\)/)
    expect(norm).toMatch(/when v_role = 'consumer' then array\['consumer_terms','privacy_policy'\]/)
    expect(norm).toMatch(/else array\['privacy_policy'\]/)
  })

  it('NEVER seeds the post-approval washer contract at signup', () => {
    // washer_terms is acknowledged only via the modal after support approval.
    expect(norm).not.toContain('washer_terms')
  })

  it('seeds at the current version and tolerates re-runs (on conflict do nothing)', () => {
    expect(norm).toMatch(/and ld\.is_current/)
    expect(norm).toMatch(/on conflict \(user_id, doc_type\) do nothing/)
  })
})

describe('0121 backfills existing accounts', () => {
  const { sql } = latestMigrationDefining('handle_new_user')
  const norm = normalize(stripComments(sql))

  it('backfills existing consumer/washer profiles without overwriting prior acks', () => {
    expect(norm).toMatch(/from public\.profiles p/)
    expect(norm).toMatch(/where p\.role in \('consumer', 'washer'\)/)
    // backfill is also non-destructive
    const acks = norm.match(/on conflict \(user_id, doc_type\) do nothing/g) || []
    expect(acks.length).toBeGreaterThanOrEqual(2) // trigger insert + backfill insert
  })
})

describe('SignUp passes the consent flag', () => {
  const src = readFn('src/pages/SignUp.jsx')

  it('sends accepted_legal in the signUp metadata', () => {
    expect(src).toMatch(/accepted_legal:\s*data\.acceptedTerms === true/)
  })
})
