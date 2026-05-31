import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── Supabase mock: records every table/bucket touched so we can prove isolation ──
const ops = []
const uploads = []
const removes = []
const updates = []
const upserts = []
let signedArgs = null
const PREF_ROW = { user_id: 'A', image_path: 'A/background.jpg', opacity: 0.2, enabled: true }

vi.mock('../lib/supabase.js', () => {
  function tableBuilder(table) {
    ops.push(`from:${table}`)
    const b = {
      select() { ops.push('select'); return b },
      eq()     { ops.push('eq'); return b },
      maybeSingle() { ops.push('maybeSingle'); return Promise.resolve({ data: PREF_ROW, error: null }) },
      update(p) { ops.push('update'); updates.push(p); return b },
      upsert(p) { ops.push('upsert'); upserts.push(p); return Promise.resolve({ data: p, error: null }) },
      // Lets `update().eq()` resolve to { error } when awaited.
      then(onF) { return Promise.resolve({ data: null, error: null }).then(onF) },
    }
    return b
  }
  const storage = {
    from(bucket) {
      ops.push(`storage:${bucket}`)
      return {
        upload(path, file, opts) { uploads.push({ bucket, path, opts }); return Promise.resolve({ error: null }) },
        remove(paths) { removes.push({ bucket, paths }); return Promise.resolve({ error: null }) },
        createSignedUrl(path, ttl) {
          signedArgs = { bucket, path, ttl }
          return Promise.resolve({ data: { signedUrl: `https://signed/${path}` }, error: null })
        },
      }
    },
  }
  return { supabase: { from: tableBuilder, storage } }
})

import * as bg from '../lib/adminBackground.js'

beforeEach(() => {
  ops.length = 0; uploads.length = 0; removes.length = 0; updates.length = 0; upserts.length = 0
  signedArgs = null
})

const pngFile = () => ({ type: 'image/png', name: 'bg.png', size: 1024 })

describe('adminBackground — pure helpers', () => {
  it('backgroundPath is user-namespaced', () => {
    expect(bg.backgroundPath('user-1', 'png')).toBe('user-1/background.png')
    expect(bg.backgroundPath('abc', 'webp')).toBe('abc/background.webp')
  })

  it('clampOpacity clamps to ≤ 0.5 (and ≥ 0)', () => {
    expect(bg.clampOpacity(0.9)).toBe(0.5)
    expect(bg.clampOpacity(0.5)).toBe(0.5)
    expect(bg.clampOpacity(0.3)).toBe(0.3)
    expect(bg.clampOpacity(-1)).toBe(0)
    expect(bg.clampOpacity('nope')).toBe(bg.OPACITY_DEFAULT)
    expect(bg.OPACITY_MAX).toBe(0.5)
  })

  it('extForFile resolves from MIME, falls back to name, rejects junk', () => {
    expect(bg.extForFile({ type: 'image/png' })).toBe('png')
    expect(bg.extForFile({ type: 'image/jpeg' })).toBe('jpg')
    expect(bg.extForFile({ type: 'image/webp' })).toBe('webp')
    expect(bg.extForFile({ name: 'PHOTO.JPEG' })).toBe('jpg')
    expect(bg.extForFile({ name: 'x.gif', type: 'image/gif' })).toBeNull()
  })

  it('validateFile enforces type + size', () => {
    expect(bg.validateFile(pngFile()).ok).toBe(true)
    expect(bg.validateFile({ type: 'application/pdf', size: 10, name: 'x.pdf' }).ok).toBe(false)
    expect(bg.validateFile({ type: 'image/png', size: 11 * 1024 * 1024, name: 'big.png' }).ok).toBe(false)
    expect(bg.validateFile(null).ok).toBe(false)
  })
})

describe('adminBackground — storage + row wrappers', () => {
  it('uploadBackground builds the correct user-namespaced path with upsert', async () => {
    const path = await bg.uploadBackground({ userId: 'A', file: pngFile() })
    expect(path).toBe('A/background.png')
    expect(uploads[0].bucket).toBe('admin-backgrounds')
    expect(uploads[0].path).toBe('A/background.png')
    expect(uploads[0].opts.upsert).toBe(true)
  })

  it('uploadBackground rejects an invalid file before touching storage', async () => {
    await expect(bg.uploadBackground({ userId: 'A', file: { type: 'image/gif', size: 1, name: 'x.gif' } }))
      .rejects.toThrow()
    expect(uploads).toHaveLength(0)
  })

  it('savePrefs clamps opacity to ≤ 0.5 and upserts the own row', async () => {
    const row = await bg.savePrefs({ userId: 'A', image_path: 'A/background.png', opacity: 0.9, enabled: true })
    expect(row.opacity).toBe(0.5)
    expect(upserts[0].user_id).toBe('A')
    expect(upserts[0].opacity).toBe(0.5)
    expect(upserts[0].image_path).toBe('A/background.png')
  })

  it('removeBackground deletes the object and nulls image_path', async () => {
    await bg.removeBackground({ userId: 'A', image_path: 'A/background.png' })
    expect(removes[0].bucket).toBe('admin-backgrounds')
    expect(removes[0].paths).toEqual(['A/background.png'])
    expect(updates[0].image_path).toBeNull()
  })

  it('fetchPrefs reads the own row by user_id', async () => {
    const r = await bg.fetchPrefs('A')
    expect(r).toEqual(PREF_ROW)
    expect(ops).toContain('from:admin_background_prefs')
    expect(ops).toContain('eq')
    expect(ops).toContain('maybeSingle')
  })

  it('signedBackgroundUrl signs the private object with a TTL', async () => {
    const url = await bg.signedBackgroundUrl('A/background.png', 3600)
    expect(signedArgs.bucket).toBe('admin-backgrounds')
    expect(signedArgs.path).toBe('A/background.png')
    expect(signedArgs.ttl).toBe(3600)
    expect(url).toBe('https://signed/A/background.png')
  })
})

// ── Isolation: only ONE table + ONE bucket are ever reached (mission Step 4) ───
describe('adminBackground touches ONLY admin_background_prefs + admin-backgrounds', () => {
  it('every table/storage op targets the admin-only surfaces', async () => {
    await bg.fetchPrefs('A')
    await bg.uploadBackground({ userId: 'A', file: pngFile() })
    await bg.savePrefs({ userId: 'A', image_path: 'A/background.png', opacity: 0.3, enabled: true })
    await bg.signedBackgroundUrl('A/background.png')
    await bg.removeBackground({ userId: 'A', image_path: 'A/background.png' })
    for (const op of ops) {
      if (op.startsWith('from:'))    expect(op).toBe('from:admin_background_prefs')
      if (op.startsWith('storage:')) expect(op).toBe('storage:admin-backgrounds')
    }
    expect(bg.BUCKET).toBe('admin-backgrounds')
    expect(bg.TABLE).toBe('admin_background_prefs')
  })
})

// ── Migration 0102 contract: private bucket + per-user storage + own-row table ──
describe('migration 0102 — per-user isolation guarantees', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const sql = readFileSync(
    resolve(here, '../../../supabase/migrations/0102_admin_background_prefs.sql'),
    'utf8',
  )

  it('creates a PRIVATE admin-backgrounds bucket', () => {
    expect(sql).toMatch(/insert\s+into\s+storage\.buckets[\s\S]*'admin-backgrounds'/i)
    // public flag is false in the buckets insert.
    expect(sql).toMatch(/'admin-backgrounds',\s*'admin-backgrounds',\s*\n?\s*false/i)
  })

  it('scopes storage to the OWN folder via storage.foldername(name)[1] = auth.uid()', () => {
    expect(sql).toMatch(/\(storage\.foldername\(name\)\)\[1\]\s*=\s*auth\.uid\(\)::text/i)
  })

  it('scopes the table to the OWN row (user_id = auth.uid()) — not blanket super_admin', () => {
    // Every policy on the table must be own-row scoped.
    const policyCount = (sql.match(/create policy[\s\S]*?admin_background_prefs/gi) || []).length
    const ownRowCount = (sql.match(/user_id\s*=\s*auth\.uid\(\)/gi) || []).length
    expect(policyCount).toBeGreaterThanOrEqual(4)        // select/insert/update/delete
    expect(ownRowCount).toBeGreaterThanOrEqual(policyCount)
    // The 0090 lesson: an explicit own-row SELECT policy exists.
    expect(sql).toMatch(/for select[\s\S]*user_id\s*=\s*auth\.uid\(\)/i)
  })

  it('caps opacity at 0.5 in the schema and forbids anon (authenticated only)', () => {
    expect(sql).toMatch(/opacity\s+numeric[\s\S]*<=\s*0\.5/i)
    expect(sql).toMatch(/to authenticated/i)
  })
})
