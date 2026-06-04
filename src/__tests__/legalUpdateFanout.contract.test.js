/* eslint-env node */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { latestMigrationDefining, stripComments, normalize } from './helpers/migrations.js'

// Contract guard for the legal_update push fan-out (Phase 2).
//
// Pins (a) migration 0108 — the audience RPC's role mapping + opt-in filter and
// the AFTER-INSERT-WHEN-is_current trigger that makes ONE net.http_post — and
// (b) the send-notification COPY/route additions for the new event type. No live
// DB (scripts/verify-db.js exercises the audience + opt-out behaviourally).

const readFn = (p) => readFileSync(resolve(process.cwd(), p), 'utf8')

describe('legal_update_audience + trigger contract (0108)', () => {
  const { file, body } = latestMigrationDefining('legal_update_audience')
  const norm = normalize(stripComments(body))

  it('maps doc_type → audience roles', () => {
    expect(norm).toMatch(/if p_doc_type = 'consumer_terms' then v_roles := array\['consumer'\]/)
    expect(norm).toMatch(/elsif p_doc_type = 'washer_terms' then v_roles := array\['washer'\]/)
    expect(norm).toMatch(/elsif p_doc_type = 'privacy_policy' then v_roles := array\['consumer','washer'\]/)
  })

  it('pre-filters opt-out users (notification_preferences.enabled)', () => {
    expect(norm).toMatch(/left join public\.notification_preferences np on np\.user_id = p\.id/)
    expect(norm).toMatch(/coalesce\(np\.enabled, true\) = true/)
  })

  it('audience RPC is restricted to service_role or agent', () => {
    expect(norm).toMatch(/auth\.role\(\)[^;]*<> 'service_role' and not public\.is_agent\(\)/)
  })

  it('fires ONE net.http_post from an AFTER INSERT trigger, only when is_current', () => {
    const full = normalize(stripComments(readFn(`supabase/migrations/${file}`)))
    expect(full).toMatch(/create trigger trg_notify_on_legal_publish after insert on public\.legal_documents/)
    expect(full).toMatch(/when \(new\.is_current\)/)
    // body posts doc_type + version to the fan-out function
    expect(full).toMatch(/net\.http_post/)
    expect(full).toMatch(/jsonb_build_object\('doc_type', new\.doc_type, 'version', new\.version\)/)
    // reads the dedicated vault secret (documented manual TODO)
    expect(full).toMatch(/'fan_out_legal_update_url'/)
  })

  it('trigger fn keeps net in its search_path (pg_net schema gotcha)', () => {
    const full = normalize(stripComments(readFn(`supabase/migrations/${file}`)))
    expect(full).toMatch(/set search_path = public, net, vault, pg_temp/)
  })
})

describe('send-notification legal_update copy + route', () => {
  const src = readFn('supabase/functions/send-notification/index.ts')

  it("adds 'legal_update' to the EventType union", () => {
    expect(src).toMatch(/\|\s*'legal_update'/)
  })

  it('has a legal_update COPY entry with he + en title', () => {
    const block = src.slice(src.indexOf('legal_update:'))
    expect(block).toContain("title: 'Legal document updated'")
    expect(block).toContain("title: 'עודכן מסמך משפטי'")
  })

  it('routes legal_update by doc_type to the in-app viewer paths', () => {
    const routeBlock = src.slice(src.indexOf("case 'legal_update':"))
    expect(routeBlock).toContain("'/legal/terms'")
    expect(routeBlock).toContain("'/legal/washer-terms'")
    expect(routeBlock).toContain("'/legal/privacy'")
  })
})

describe('fan-out-legal-update edge function', () => {
  const src = readFn('supabase/functions/fan-out-legal-update/index.ts')

  it('authenticates with TRIGGER_SECRET (timing-safe)', () => {
    expect(src).toContain('TRIGGER_SECRET')
    expect(src).toContain('timingSafeEqual')
  })

  it('resolves the audience via legal_update_audience and sends legal_update events', () => {
    expect(src).toContain("rpc('legal_update_audience'")
    expect(src).toContain("event_type: 'legal_update'")
    expect(src).toContain('/functions/v1/send-notification')
  })
})
