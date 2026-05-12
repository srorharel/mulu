import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import { LocateFixed } from 'lucide-react'
import 'leaflet/dist/leaflet.css'
import './WasherMarker.css'

const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const DARK_ATTR  = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'

const DEFAULT_CENTER   = [31.7683, 35.2137] // Jerusalem fallback
const FOLLOW_ZOOM      = 16
const FOLLOW_DIST_M    = 20  // min metres of movement before panning

// ── OSRM routing ──────────────────────────────────────────────────────────────

const OSRM_BASE            = 'https://router.project-osrm.org/route/v1/driving'
const ROUTE_REFETCH_DIST_M = 100
const ROUTE_DEBOUNCE_MS    = 500
const ROUTE_TIMEOUT_MS     = 5000

// Defensive guard — Leaflet throws synchronously on undefined/NaN coords
function validCoord(lat, lng) {
  return (
    typeof lat === 'number' && typeof lng === 'number' &&
    !Number.isNaN(lat) && !Number.isNaN(lng)
  )
}

function haversineM(p1, p2) {
  const R    = 6371000
  const dLat = (p2.lat - p1.lat) * Math.PI / 180
  const dLng = (p2.lng - p1.lng) * Math.PI / 180
  const a    =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(p1.lat * Math.PI / 180) * Math.cos(p2.lat * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Returns [[lat,lng], ...] route from OSRM, or null on failure (→ straight-line fallback).
// Re-fetches when activeJob changes (immediate) or washerPosition moves >100m (debounced).
function useOsrmRoute(washerPosition, activeJob) {
  const [routeCoords, setRouteCoords] = useState(null)
  const lastFetchPos  = useRef(null)
  const debounceTimer = useRef(null)
  const abortCtrl     = useRef(null)
  const activeJobRef  = useRef(activeJob)
  const positionRef   = useRef(washerPosition)

  useEffect(() => { activeJobRef.current = activeJob    })
  useEffect(() => { positionRef.current  = washerPosition })

  function fetchRoute(from, job) {
    if (!from || !job) return
    if (!validCoord(from.lat, from.lng) || !validCoord(job.lat, job.lng)) return
    abortCtrl.current?.abort()
    const ctrl = new AbortController()
    abortCtrl.current = ctrl
    const tid  = setTimeout(() => ctrl.abort(), ROUTE_TIMEOUT_MS)
    const url  = `${OSRM_BASE}/${from.lng},${from.lat};${job.lng},${job.lat}?overview=full&geometries=geojson`
    fetch(url, { signal: ctrl.signal })
      .then(r => { clearTimeout(tid); if (!r.ok) throw new Error(); return r.json() })
      .then(data => {
        const coords = data?.routes?.[0]?.geometry?.coordinates
        if (!coords?.length) throw new Error()
        setRouteCoords(coords.map(([lng, lat]) => [lat, lng]))
        lastFetchPos.current = from
      })
      .catch(() => { clearTimeout(tid); setRouteCoords(null) })
  }

  useEffect(() => {
    clearTimeout(debounceTimer.current)
    abortCtrl.current?.abort()
    lastFetchPos.current = null
    setRouteCoords(null)
    if (activeJob && washerPosition) fetchRoute(washerPosition, activeJob)
  }, [activeJob?.lat, activeJob?.lng]) // eslint-disable-line

  useEffect(() => {
    if (!washerPosition || !activeJobRef.current) return
    if (!validCoord(washerPosition.lat, washerPosition.lng)) return
    if (!validCoord(activeJobRef.current.lat, activeJobRef.current.lng)) return
    const dist = lastFetchPos.current
      ? haversineM(lastFetchPos.current, washerPosition)
      : Infinity
    if (dist < ROUTE_REFETCH_DIST_M) return
    clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(
      () => fetchRoute(positionRef.current, activeJobRef.current),
      ROUTE_DEBOUNCE_MS
    )
    return () => clearTimeout(debounceTimer.current)
  }, [washerPosition?.lat, washerPosition?.lng]) // eslint-disable-line

  return routeCoords
}

// ── Pre-built icons (created once, outside render cycle) ─────────────────────

const washerIcon = L.divIcon({
  html:       '<div class="washer-dot"><div class="washer-dot__core"></div><div class="washer-dot__ring"></div></div>',
  iconSize:   [24, 24],
  iconAnchor: [12, 12],
  className:  'washer-marker-icon',
})

const jobPinIcon = L.divIcon({
  html:       '<div class="job-pin-dot"></div>',
  iconSize:   [12, 12],
  iconAnchor: [6, 6],
  className:  'job-pin-icon',
})

// ── Captures the Leaflet map instance into a ref so siblings can call map APIs ─
function MapCapture({ mapRef }) {
  const map = useMap()
  useEffect(() => { mapRef.current = map }, [map])
  return null
}

// ── Imperative washer marker (smooth GPS animation via CSS transition) ─────────
function WasherMarkerLayer({ position }) {
  const map       = useMap()
  const markerRef = useRef(null)

  useEffect(() => {
    if (!position || !validCoord(position.lat, position.lng)) return
    if (!markerRef.current) {
      markerRef.current = L.marker([position.lat, position.lng], {
        icon: washerIcon,
        zIndexOffset: 1000,
        interactive: false,
      }).addTo(map)
    } else {
      markerRef.current.setLatLng([position.lat, position.lng])
    }
  }, [position?.lat, position?.lng]) // eslint-disable-line

  useEffect(() => {
    return () => {
      if (markerRef.current) {
        markerRef.current.remove()
        markerRef.current = null
      }
    }
  }, [])

  return null
}

// ── Auto-fit camera when activeJob changes (not on every GPS tick) ─────────────
function AutoFitLayer({ washerPosition, activeJob }) {
  const map = useMap()

  useEffect(() => {
    if (!washerPosition || !activeJob) return
    if (!validCoord(washerPosition.lat, washerPosition.lng)) return
    if (!validCoord(activeJob.lat, activeJob.lng)) return
    const bounds = L.latLngBounds(
      [washerPosition.lat, washerPosition.lng],
      [activeJob.lat,      activeJob.lng],
    )
    map.fitBounds(bounds, { padding: [80, 80], animate: true, duration: 0.8 })
  }, [activeJob?.lat, activeJob?.lng]) // eslint-disable-line

  return null
}

// ── Camera follow + manual-pan pause ──────────────────────────────────────────
function FollowLayer({ washerPosition, activeJob, followPaused, setFollowPaused }) {
  const map = useMap()
  const initializedRef  = useRef(false)
  const activeJobRef    = useRef(activeJob)
  const followPausedRef = useRef(followPaused)

  useEffect(() => { activeJobRef.current    = activeJob    })
  useEffect(() => { followPausedRef.current = followPaused })

  useEffect(() => {
    if (!washerPosition || initializedRef.current || activeJobRef.current) return
    if (!validCoord(washerPosition.lat, washerPosition.lng)) return
    initializedRef.current = true
    map.setView([washerPosition.lat, washerPosition.lng], FOLLOW_ZOOM, { animate: false })
  }, [washerPosition?.lat, washerPosition?.lng]) // eslint-disable-line

  useEffect(() => {
    if (!washerPosition || activeJobRef.current || followPausedRef.current) return
    if (!validCoord(washerPosition.lat, washerPosition.lng)) return
    const dist = haversineM(map.getCenter(), washerPosition)
    if (dist > FOLLOW_DIST_M) {
      map.panTo([washerPosition.lat, washerPosition.lng], { animate: true, duration: 0.8 })
    }
  }, [washerPosition?.lat, washerPosition?.lng]) // eslint-disable-line

  useEffect(() => {
    const pause = () => setFollowPaused(true)
    map.on('dragstart', pause)
    map.on('zoomstart', pause)
    return () => {
      map.off('dragstart', pause)
      map.off('zoomstart', pause)
    }
  }, [map, setFollowPaused]) // eslint-disable-line

  return null
}

// ── WorkerMap ──────────────────────────────────────────────────────────────────
// Props:
//   washerPosition  { lat, lng } | null
//   jobs            array from useNearbyJobs
//   activeJob       { lat, lng, id } | null
//   onJobPinTap     (jobId) => void
export default function WorkerMap({ washerPosition, jobs, activeJob, onJobPinTap }) {
  const [followPaused, setFollowPaused] = useState(false)
  const mapRef = useRef(null)

  useEffect(() => {
    if (!activeJob) setFollowPaused(false)
  }, [activeJob])

  const washerCoordsValid = validCoord(washerPosition?.lat, washerPosition?.lng)
  const activeCoordsValid = validCoord(activeJob?.lat, activeJob?.lng)

  const initialCenter = washerPosition && washerCoordsValid
    ? [washerPosition.lat, washerPosition.lng]
    : DEFAULT_CENTER

  const routeCoords = useOsrmRoute(washerPosition, activeJob)

  function handleRecenter() {
    if (!mapRef.current || !washerPosition || !washerCoordsValid) return
    mapRef.current.setView(
      [washerPosition.lat, washerPosition.lng],
      FOLLOW_ZOOM,
      { animate: true, duration: 0.5 },
    )
    setFollowPaused(false)
  }

  return (
    <div dir="ltr" className="absolute inset-0 isolate">
      <MapContainer
        center={initialCenter}
        zoom={FOLLOW_ZOOM}
        zoomControl={false}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={false}
      >
        <TileLayer url={DARK_TILES} attribution={DARK_ATTR} />

        <MapCapture mapRef={mapRef} />
        <WasherMarkerLayer position={washerPosition} />
        <AutoFitLayer washerPosition={washerPosition} activeJob={activeJob} />
        <FollowLayer
          washerPosition={washerPosition}
          activeJob={activeJob}
          followPaused={followPaused}
          setFollowPaused={setFollowPaused}
        />

        {/* Road polyline — only when both endpoints have valid coords */}
        {washerCoordsValid && activeCoordsValid && (
          <Polyline
            positions={
              routeCoords ?? [
                [washerPosition.lat, washerPosition.lng],
                [activeJob.lat,      activeJob.lng],
              ]
            }
            color="#7DD9A2"
            weight={3}
            opacity={0.85}
            dashArray="6 8"
          />
        )}

        {/* Job pins — skip any pin with missing or invalid coords */}
        {jobs.map(job => {
          if (!validCoord(job.lat, job.lng)) return null
          return (
            <Marker
              key={job.id}
              position={[job.lat, job.lng]}
              icon={jobPinIcon}
              eventHandlers={{ click: () => onJobPinTap(job.id) }}
            />
          )
        })}
      </MapContainer>

      {/* Recenter FAB — hidden while auto-fit owns the camera or coords unavailable */}
      {!activeJob && washerCoordsValid && (
        <button
          onClick={handleRecenter}
          aria-label="Recenter map on my location"
          className="absolute z-[800] flex items-center justify-center rounded-2xl bg-glass border border-glass-border backdrop-blur-xl shadow-lg transition-transform active:scale-90"
          style={{
            bottom: 'calc(56px + 120px + 1.5rem)',
            insetInlineEnd: '1rem',
            width:  44,
            height: 44,
          }}
        >
          <LocateFixed className="h-5 w-5 text-ink" />
        </button>
      )}
    </div>
  )
}
