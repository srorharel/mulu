import { useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useTheme } from '../../hooks/useTheme.js'
import { mapTiles, routeColor, mapThemeClass } from '../../lib/mapTheme.js'
import { lerpLatLng } from '../../lib/geo.js'

const DEFAULT_CENTER = [31.7683, 35.2137] // Jerusalem fallback
const JOB_ZOOM       = 15
const TWEEN_MS       = 700 // ease-out glide between 6s GPS polls

// Leaflet throws synchronously on undefined/NaN coords — guard every pin.
function validCoord(lat, lng) {
  return (
    typeof lat === 'number' && typeof lng === 'number' &&
    !Number.isNaN(lat) && !Number.isNaN(lng)
  )
}

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3)

// Green "W" washer marker — matches the page's green-circle washer styling.
const WASHER_ICON = L.divIcon({
  html:
    '<div style="width:38px;height:38px;border-radius:9999px;background:#26B55F;' +
    'border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,0.3);display:flex;' +
    'align-items:center;justify-content:center;color:#fff;font-weight:800;' +
    'font-size:14px;font-family:Inter,system-ui,sans-serif;">W</div>',
  iconSize:   [38, 38],
  iconAnchor: [19, 19],
  className:  'order-washer-marker',
})

// Concentric-ring destination pin — mirrors the old static-SVG destination marker.
const JOB_PIN_ICON = L.divIcon({
  html:
    '<div style="position:relative;width:40px;height:40px;">' +
    '<div style="position:absolute;inset:0;border-radius:9999px;background:rgba(125,217,162,0.22);"></div>' +
    '<div style="position:absolute;inset:7px;border-radius:9999px;background:#fff;border:2px solid #26B55F;"></div>' +
    '<div style="position:absolute;inset:16px;border-radius:9999px;background:#26B55F;"></div>' +
    '</div>',
  iconSize:   [40, 40],
  iconAnchor: [20, 20],
  className:  'order-job-pin',
})

// Imperative washer marker + washer→job polyline, RAF-tweened between GPS polls so
// the marker glides instead of jumping. The line's washer endpoint follows the
// tween. Hidden entirely when washerLocation is null.
function WasherTweenLayer({ washerLocation, jobLat, jobLng, isDark }) {
  const map        = useMap()
  const markerRef  = useRef(null)
  const lineRef    = useRef(null)
  const displayRef = useRef(null) // current on-screen { lat, lng }
  const rafRef     = useRef(null)
  const fittedRef  = useRef(false)

  // Tear down marker/line + cancel any in-flight tween on unmount.
  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    markerRef.current?.remove()
    lineRef.current?.remove()
    markerRef.current = null
    lineRef.current   = null
  }, [])

  useEffect(() => {
    const hasJob = validCoord(jobLat, jobLng)

    // No washer location → remove marker + line (hide) and reset.
    if (!washerLocation || !validCoord(washerLocation.lat, washerLocation.lng)) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
      markerRef.current?.remove(); markerRef.current = null
      lineRef.current?.remove();   lineRef.current   = null
      displayRef.current = null
      return
    }

    const target = { lat: washerLocation.lat, lng: washerLocation.lng }

    function draw(p) {
      if (!markerRef.current) {
        markerRef.current = L.marker([p.lat, p.lng], {
          icon: WASHER_ICON, zIndexOffset: 1000, interactive: false,
        }).addTo(map)
      } else {
        markerRef.current.setLatLng([p.lat, p.lng])
      }
      if (hasJob) {
        const pts = [[p.lat, p.lng], [jobLat, jobLng]]
        if (!lineRef.current) {
          lineRef.current = L.polyline(pts, {
            color: routeColor(isDark), weight: 3, opacity: 0.85, dashArray: '6 8',
          }).addTo(map)
        } else {
          lineRef.current.setLatLngs(pts)
        }
      }
    }

    // First appearance → place immediately (no tween-from-nowhere) + fit once.
    if (!displayRef.current) {
      displayRef.current = target
      draw(target)
      if (hasJob && !fittedRef.current) {
        fittedRef.current = true
        map.fitBounds(
          L.latLngBounds([target.lat, target.lng], [jobLat, jobLng]),
          { padding: [70, 70], animate: true, duration: 0.6 },
        )
      }
      return
    }

    // Tween current display → new target with ease-out.
    const from = displayRef.current
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const start = performance.now()
    function step(now) {
      const t = Math.min(1, (now - start) / TWEEN_MS)
      const p = lerpLatLng(from, target, easeOutCubic(t))
      displayRef.current = p
      draw(p)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step)
      } else {
        rafRef.current = null
        displayRef.current = target
      }
    }
    rafRef.current = requestAnimationFrame(step)
  }, [washerLocation?.lat, washerLocation?.lng, jobLat, jobLng, isDark, map]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

// Live consumer tracking map: static job pin + live, tweened washer marker.
// Props:
//   jobLat, jobLng   destination coords (orders.lat/lng) | null
//   washerLocation   { lat, lng } | null  (from useOrderWasherTracking)
export default function OrderTrackingMap({ jobLat, jobLng, washerLocation }) {
  const { isDark } = useTheme()
  const tiles  = mapTiles(isDark)
  const hasJob = validCoord(jobLat, jobLng)
  const center = hasJob ? [jobLat, jobLng] : DEFAULT_CENTER

  return (
    <div dir="ltr" className={`absolute inset-0 isolate ${mapThemeClass(isDark)}`}>
      <MapContainer
        center={center}
        zoom={JOB_ZOOM}
        zoomControl={false}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={false}
      >
        {/* key on URL → Leaflet re-mounts the TileLayer when theme flips */}
        <TileLayer
          key={tiles.url}
          url={tiles.url}
          attribution={tiles.attribution}
          subdomains={tiles.subdomains}
          maxZoom={tiles.maxZoom}
        />
        {hasJob && <Marker position={[jobLat, jobLng]} icon={JOB_PIN_ICON} />}
        <WasherTweenLayer
          washerLocation={washerLocation}
          jobLat={jobLat}
          jobLng={jobLng}
          isDark={isDark}
        />
      </MapContainer>
    </div>
  )
}
