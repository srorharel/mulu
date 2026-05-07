import { useRef, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const tealMarker = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" fill="none">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 6.63 12 24 12 24S24 18.63 24 12C24 5.37 18.63 0 12 0z" fill="#0EA5A4"/>
    <circle cx="12" cy="12" r="5" fill="white"/>
  </svg>`,
  iconSize: [24, 36],
  iconAnchor: [12, 36],
  popupAnchor: [0, -36],
  className: '',
})

// Pans the map to follow position changes after initial mount.
// Used by LocationSheet's forward-geocode flow to move the viewport when
// the user types an address that resolves to a different coordinate.
function PanController({ position }) {
  const map   = useMap()
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; return }
    if (position) map.panTo([position.lat, position.lng], { animate: true, duration: 0.5 })
  }, [position?.lat, position?.lng]) // eslint-disable-line
  return null
}

function DraggableMarker({ position, onChange }) {
  const markerRef = useRef(null)

  useMapEvents({
    click(e) {
      onChange({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })

  const eventHandlers = {
    dragend() {
      const m = markerRef.current
      if (m) {
        const ll = m.getLatLng()
        onChange({ lat: ll.lat, lng: ll.lng })
      }
    },
  }

  if (!position) return null
  return (
    <Marker
      draggable
      eventHandlers={eventHandlers}
      position={[position.lat, position.lng]}
      ref={markerRef}
      icon={tealMarker}
    />
  )
}

export default function MapPicker({ position, onChange, height = '280px' }) {
  const defaultCenter = position
    ? [position.lat, position.lng]
    : [31.7683, 35.2137] // Jerusalem fallback

  return (
    <div style={{ height }} className="rounded-2xl overflow-hidden border border-neutral-200">
      <MapContainer
        center={defaultCenter}
        zoom={14}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <PanController position={position} />
        <DraggableMarker position={position} onChange={onChange} />
      </MapContainer>
    </div>
  )
}
