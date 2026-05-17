import { MapContainer, TileLayer, CircleMarker } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const LIGHT_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const LIGHT_ATTR  = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

// maxZoom prevents fitBounds from zooming in too far when the two points are
// identical or within a few meters (Leaflet would otherwise snap to max tile zoom).
const BOUNDS_OPTS = { padding: [30, 30], maxZoom: 16 }

export default function MiniMap({ lat, lng, secondLat, secondLng }) {
  if (lat == null || lng == null) return null

  const hasBoth  = secondLat != null && secondLng != null
  const mapProps = hasBoth
    ? { bounds: [[lat, lng], [secondLat, secondLng]], boundsOptions: BOUNDS_OPTS }
    : { center: [lat, lng], zoom: 15 }

  return (
    <div style={{ height: 150, borderRadius: 10, overflow: 'hidden' }}>
      <MapContainer
        {...mapProps}
        zoomControl={false}
        dragging={false}
        scrollWheelZoom={false}
        touchZoom={false}
        doubleClickZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer url={LIGHT_TILES} attribution={LIGHT_ATTR} />
        {/* Primary pin — red: washer's submitted GPS */}
        <CircleMarker
          center={[lat, lng]}
          radius={9}
          pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.9, weight: 2 }}
        />
        {/* Secondary pin — indigo: order address */}
        {hasBoth && (
          <CircleMarker
            center={[secondLat, secondLng]}
            radius={9}
            pathOptions={{ color: '#4f46e5', fillColor: '#4f46e5', fillOpacity: 0.9, weight: 2 }}
          />
        )}
      </MapContainer>
    </div>
  )
}
