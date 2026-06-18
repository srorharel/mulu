import { describe, it, expect } from 'vitest'
import { isInServiceArea, SERVICE_AREA_CITY } from '../lib/serviceArea.js'

// Pilot service-area geofence. During the pilot MULU only takes orders inside
// Holon, enforced client-side in consumer/Home.jsx via isInServiceArea(). This
// pins the embedded Holon polygon so a future edit can't silently start letting
// neighbouring cities through (or start rejecting real Holon addresses).

describe('serviceArea — Holon pilot geofence', () => {
  it('serves Holon during the pilot', () => {
    expect(SERVICE_AREA_CITY).toBe('Holon')
  })

  it.each([
    ['Holon centre',                32.0167, 34.7795],
    ['Holon — Wolfson / Eilat St.', 32.0237, 34.7720],
  ])('accepts %s', (_name, lat, lng) => {
    expect(isInServiceArea(lat, lng)).toBe(true)
  })

  it.each([
    ['Bat Yam',     32.0231, 34.7503],
    ['Tel Aviv',    32.0853, 34.7818],
    ['Azor',        32.0228, 34.8100],
    ['Rishon LeZion', 31.9730, 34.8066],
    ['Jerusalem',   31.7683, 35.2137],
  ])('rejects %s (outside Holon)', (_name, lat, lng) => {
    expect(isInServiceArea(lat, lng)).toBe(false)
  })

  it.each([
    ['null lat',  null, 34.78],
    ['null lng',  32.01, null],
    ['NaN',       NaN, NaN],
    ['undefined', undefined, undefined],
  ])('treats %s as out of area (no location = not bookable)', (_name, lat, lng) => {
    expect(isInServiceArea(lat, lng)).toBe(false)
  })
})
