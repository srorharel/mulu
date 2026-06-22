import { describe, it, expect, beforeEach } from 'vitest'
import {
  cacheProfile, readCachedProfile,
  cacheActiveJob, readCachedActiveJob,
  cacheOrder, readCachedOrder, removeCachedOrder,
  clearOfflineCache,
} from '../offlineCache.js'

// The global test setup clears localStorage before each test (src/test/setup.js).
beforeEach(() => { localStorage.clear() })

describe('offlineCache', () => {
  it('round-trips a profile keyed by user id', () => {
    cacheProfile({ id: 'u1', role: 'washer', full_name: 'W' })
    expect(readCachedProfile('u1')).toMatchObject({ id: 'u1', role: 'washer' })
    // Isolated per user.
    expect(readCachedProfile('u2')).toBeNull()
  })

  it('round-trips the active job and clears it with null', () => {
    cacheActiveJob('u1', { id: 'job-1', status: 'en_route' })
    expect(readCachedActiveJob('u1')).toMatchObject({ id: 'job-1' })
    cacheActiveJob('u1', null)
    expect(readCachedActiveJob('u1')).toBeNull()
  })

  it('round-trips an order keyed by order id and removes it', () => {
    cacheOrder({ id: 'o1', status: 'in_progress' })
    expect(readCachedOrder('o1')).toMatchObject({ id: 'o1', status: 'in_progress' })
    removeCachedOrder('o1')
    expect(readCachedOrder('o1')).toBeNull()
  })

  it('clearOfflineCache drops the per-user profile + active job', () => {
    cacheProfile({ id: 'u1', role: 'washer' })
    cacheActiveJob('u1', { id: 'job-1' })
    clearOfflineCache('u1')
    expect(readCachedProfile('u1')).toBeNull()
    expect(readCachedActiveJob('u1')).toBeNull()
  })

  it('never throws on missing ids or malformed stored JSON', () => {
    expect(readCachedProfile(undefined)).toBeNull()
    expect(readCachedActiveJob(null)).toBeNull()
    expect(readCachedOrder('')).toBeNull()
    // Writers ignore objects without an id (nothing to key on).
    expect(() => cacheProfile({})).not.toThrow()
    expect(() => cacheOrder(null)).not.toThrow()
    // Corrupt payload → null, not a throw.
    localStorage.setItem('mulu.cache.order.bad', '{not json')
    expect(readCachedOrder('bad')).toBeNull()
  })
})
