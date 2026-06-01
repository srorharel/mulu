import { describe, it, expect } from 'vitest'
import { haversineKm, etaMinutes, lerpLatLng, AVG_WASHER_SPEED_KMH } from '../geo.js'

describe('haversineKm', () => {
  it('measures ~1km between two known Holon points (within tolerance)', () => {
    // ~0.009° of latitude ≈ 1.0 km. Two points in Holon, same longitude.
    const d = haversineKm(32.0100, 34.7700, 32.0190, 34.7700)
    expect(d).toBeGreaterThan(0.9)
    expect(d).toBeLessThan(1.1)
  })

  it('returns 0 for identical points', () => {
    expect(haversineKm(32.0167, 34.7795, 32.0167, 34.7795)).toBe(0)
  })
})

describe('etaMinutes', () => {
  it('15 km at 30 km/h => 30 minutes', () => {
    expect(etaMinutes(15, 30)).toBe(30)
  })

  it('defaults to AVG_WASHER_SPEED_KMH', () => {
    // One hour of travel at the default speed.
    expect(etaMinutes(AVG_WASHER_SPEED_KMH)).toBe(60)
  })

  it('floors to a minimum of 1 minute (0 km => 1)', () => {
    expect(etaMinutes(0)).toBe(1)
  })

  it('returns null when distance is null', () => {
    expect(etaMinutes(null)).toBeNull()
  })
})

describe('lerpLatLng', () => {
  const a = { lat: 0, lng: 0 }
  const b = { lat: 10, lng: 20 }

  it('t=0 => a', () => {
    expect(lerpLatLng(a, b, 0)).toEqual({ lat: 0, lng: 0 })
  })

  it('t=1 => b', () => {
    expect(lerpLatLng(a, b, 1)).toEqual({ lat: 10, lng: 20 })
  })

  it('t=0.5 => midpoint', () => {
    expect(lerpLatLng(a, b, 0.5)).toEqual({ lat: 5, lng: 10 })
  })
})
