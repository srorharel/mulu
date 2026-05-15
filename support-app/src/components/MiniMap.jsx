import { MapContainer, TileLayer, CircleMarker } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const LIGHT_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const LIGHT_ATTR  = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

export default function MiniMap({ lat, lng }) {
  if (lat == null || lng == null) return null
  return (
    <div style={{ height: 150, borderRadius: 10, overflow: 'hidden' }}>
      <MapContainer
        center={[lat, lng]}
        zoom={15}
        zoomControl={false}
        dragging={false}
        scrollWheelZoom={false}
        touchZoom={false}
        doubleClickZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer url={LIGHT_TILES} attribution={LIGHT_ATTR} />
        <CircleMarker
          center={[lat, lng]}
          radius={9}
          pathOptions={{ color: '#4f46e5', fillColor: '#4f46e5', fillOpacity: 0.9, weight: 2 }}
        />
      </MapContainer>
    </div>
  )
}
