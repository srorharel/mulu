import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the supabase client BEFORE importing the module under test.
const rpcCalls = []
const fromCalls = []
const storageCalls = []

vi.mock('../lib/supabase.js', () => {
  function chain(table) {
    const ctx = { table, ops: [] }
    fromCalls.push(ctx)
    const obj = {
      select(s) { ctx.ops.push(['select', s]); return obj },
      eq(c, v) { ctx.ops.push(['eq', c, v]); return obj },
      or(s)    { ctx.ops.push(['or', s]); return obj },
      order(c, o = {}) { ctx.ops.push(['order', c, o]); return obj },
      limit(n) { ctx.ops.push(['limit', n]); return obj },
      single() { return Promise.resolve({ data: ctx._row, error: null }) },
      then(resolve) {
        return Promise.resolve({ data: ctx._rows ?? [], error: null }).then(resolve)
      },
    }
    return obj
  }
  return {
    supabase: {
      from(table) { return chain(table) },
      rpc(name, args) {
        rpcCalls.push({ name, args })
        return Promise.resolve({ data: name === 'admin_create_order_for_consumer' ? 'order-uuid-123' : null, error: null })
      },
      storage: {
        from(bucket) {
          return {
            createSignedUrl(path, ttl) {
              storageCalls.push({ kind: 'sign', bucket, path, ttl })
              return Promise.resolve({ data: { signedUrl: `https://signed/${bucket}/${path}` }, error: null })
            },
            upload(path, file, opts) {
              storageCalls.push({ kind: 'upload', bucket, path, fileName: file?.name, opts })
              return Promise.resolve({ error: null })
            },
          }
        },
      },
    },
  }
})

import {
  fetchJobs, fetchProfileBrief, signedUrlFor, uploadReplacement, logPhotoReplacement,
  adminTransitionStatus, adminReassignWasher, adminOverridePrice, adminCreateOrderForConsumer,
  STATUSES, statusColor, PHOTO_FIELDS, bucketForField,
} from '../lib/adminJobs.js'

beforeEach(() => {
  rpcCalls.length = 0
  fromCalls.length = 0
  storageCalls.length = 0
})

describe('adminJobs RPC wrappers', () => {
  it('adminTransitionStatus always passes p_admin_override=true', async () => {
    await adminTransitionStatus({ orderId: 'o1', newStatus: 'completed' })
    expect(rpcCalls).toHaveLength(1)
    expect(rpcCalls[0].name).toBe('transition_order_status')
    expect(rpcCalls[0].args).toMatchObject({
      order_id: 'o1', new_status: 'completed', p_admin_override: true,
    })
  })

  it('adminReassignWasher forwards reason', async () => {
    await adminReassignWasher({ orderId: 'o1', newWasherId: 'w1', reason: 'rescue' })
    expect(rpcCalls[0]).toEqual({
      name: 'admin_reassign_washer',
      args: { p_order_id: 'o1', p_new_washer_id: 'w1', p_reason: 'rescue' },
    })
  })

  it('adminOverridePrice maps fields correctly', async () => {
    await adminOverridePrice({ orderId: 'o1', newConsumerPrice: 120, newPayout: 70, reason: 'comp' })
    expect(rpcCalls[0].args).toEqual({
      p_order_id: 'o1',
      p_new_consumer_price: 120,
      p_new_payout: 70,
      p_reason: 'comp',
    })
  })

  it('adminCreateOrderForConsumer returns new order id', async () => {
    const id = await adminCreateOrderForConsumer({
      consumerId: 'c1', lat: 32, lng: 34, category: 'private',
      carDetails: { plate: '11-22-33' }, siteFlags: { water: true }, accessNotes: 'gate 5',
    })
    expect(id).toBe('order-uuid-123')
    expect(rpcCalls[0].name).toBe('admin_create_order_for_consumer')
    expect(rpcCalls[0].args).toMatchObject({
      p_consumer_id: 'c1', p_lat: 32, p_lng: 34, p_category: 'private',
      p_car_details: { plate: '11-22-33' }, p_site_flags: { water: true },
      p_access_notes: 'gate 5', p_skip_payment: false,
    })
  })
})

describe('adminJobs storage helpers', () => {
  it('signedUrlFor returns null for missing path', async () => {
    expect(await signedUrlFor('car-photos', null)).toBeNull()
  })
  it('signedUrlFor calls createSignedUrl with TTL', async () => {
    const url = await signedUrlFor('job-evidence', 'orders/abc/arrival_front.jpg')
    expect(url).toContain('signed/job-evidence/')
    expect(storageCalls[0]).toMatchObject({ kind: 'sign', bucket: 'job-evidence', ttl: 600 })
  })
  it('uploadReplacement upserts at the same path', async () => {
    const file = new Blob(['x'], { type: 'image/jpeg' })
    file.name = 'replace.jpg'
    await uploadReplacement({ bucket: 'car-photos', path: 'o1/car_photo_front.jpg', file })
    expect(storageCalls[0]).toMatchObject({
      kind: 'upload', bucket: 'car-photos', path: 'o1/car_photo_front.jpg',
    })
    expect(storageCalls[0].opts.upsert).toBe(true)
  })
  it('logPhotoReplacement maps field/path/reason', async () => {
    await logPhotoReplacement({ orderId: 'o1', field: 'arrival_photo_front', newPath: 'o1/x.jpg', reason: 'fix' })
    expect(rpcCalls[0]).toEqual({
      name: 'admin_log_photo_replacement',
      args: { p_order_id: 'o1', p_field: 'arrival_photo_front', p_new_path: 'o1/x.jpg', p_reason: 'fix' },
    })
  })
})

describe('adminJobs display helpers', () => {
  it('STATUSES starts with all + has 8 concrete statuses', () => {
    expect(STATUSES[0]).toBe('all')
    expect(STATUSES.length).toBe(9)
  })
  it('statusColor returns class strings for every known status', () => {
    for (const s of STATUSES) expect(typeof statusColor(s)).toBe('string')
  })
  it('PHOTO_FIELDS groups 4 angles for each phase', () => {
    expect(PHOTO_FIELDS.car).toHaveLength(4)
    expect(PHOTO_FIELDS.arrival).toHaveLength(4)
    expect(PHOTO_FIELDS.completion).toHaveLength(4)
  })
  it('bucketForField maps car_* to car-photos and others to job-evidence', () => {
    expect(bucketForField('car_photo_front')).toBe('car-photos')
    expect(bucketForField('arrival_photo_back')).toBe('job-evidence')
    expect(bucketForField('completion_photo_driver')).toBe('job-evidence')
  })
})

describe('adminJobs fetchJobs', () => {
  it('does not add eq filter for status=all', async () => {
    await fetchJobs({ status: 'all' })
    const ops = fromCalls[0].ops
    const eqs = ops.filter(o => o[0] === 'eq')
    expect(eqs).toHaveLength(0)
  })
  it('adds eq status filter for a concrete status', async () => {
    await fetchJobs({ status: 'pending' })
    const ops = fromCalls[0].ops
    const eq = ops.find(o => o[0] === 'eq')
    expect(eq).toEqual(['eq', 'status', 'pending'])
  })
})
