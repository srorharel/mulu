import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../../../hooks/useTheme.js', () => ({ useTheme: () => ({ isDark: false }) }))

// Stub react-leaflet so the Polyline's props are inspectable in jsdom (Leaflet
// can't actually render without a sized DOM).
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }) => <div data-testid="map">{children}</div>,
  TileLayer: () => null,
  Marker: () => null,
  Polyline: (props) => <div data-testid="route" data-color={props.color} />,
  useMap: () => ({
    fitBounds: () => {}, getCenter: () => ({ lat: 0, lng: 0 }),
    panTo: () => {}, setView: () => {}, on: () => {}, off: () => {},
  }),
}))

vi.mock('leaflet', () => {
  const chain = { addTo: () => chain, setLatLng: () => chain, setLatLngs: () => chain, remove: () => {} }
  return { default: { divIcon: () => ({}), marker: () => chain, polyline: () => chain, latLngBounds: () => ({}) } }
})

import WorkerMap from '../WorkerMap.jsx'

beforeEach(() => {
  // OSRM unreachable in tests → WorkerMap falls back to a straight green line.
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('no network'))))
})
afterEach(() => { vi.unstubAllGlobals() })

describe('WorkerMap — washer→job route line', () => {
  it('draws a green route polyline when washer + job coords are present', () => {
    render(
      <WorkerMap
        washerPosition={{ lat: 32.00, lng: 34.80 }}
        jobs={[]}
        activeJob={{ id: 'j1', lat: 32.05, lng: 34.80 }}
        onJobPinTap={() => {}}
        recenterRef={{ current: null }}
      />
    )
    const route = screen.getByTestId('route')
    expect(route).toBeInTheDocument()
    // routeColor(isDark=false) === primary-700 green (DESIGN.md route polyline token)
    expect(route.getAttribute('data-color')).toBe('#26B55F')
  })

  it('draws no route polyline without an active job', () => {
    render(
      <WorkerMap
        washerPosition={{ lat: 32.00, lng: 34.80 }}
        jobs={[]}
        activeJob={null}
        onJobPinTap={() => {}}
        recenterRef={{ current: null }}
      />
    )
    expect(screen.queryByTestId('route')).toBeNull()
  })
})
