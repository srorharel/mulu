import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Search, MapPin, Car, Sparkles, AlertCircle } from 'lucide-react'
import {
  searchConsumers, adminCreateOrderForConsumer,
} from '../../lib/adminJobs.js'

// Multi-step admin "Create order on behalf of consumer" form.
// Step 1: pick consumer (search dropdown)
// Step 2: pick location (Leaflet map; click anywhere to drop pin)
// Step 3: category + car details
// Step 4: site flags + access notes + submit
//
// The created order enters the normal pipeline — washers nearby are notified
// by the existing trg_notify_on_new_order → fan-out-nearby-job path.

const CATEGORIES = [
  { id: 'private', label: 'Private (₪100)' },
  { id: 'jeep',    label: 'Jeep (₪120)'    },
  { id: 'pickup',  label: 'Pickup (₪130)'  },
]

const DEFAULT_CENTER = [32.0853, 34.7818] // Tel Aviv

export default function CreateOrderForm({ onClose, onCreated }) {
  const [step, setStep]         = useState(1)
  const [consumer, setConsumer] = useState(null)
  const [loc, setLoc]           = useState(null)   // { lat, lng }
  const [category, setCategory] = useState('private')
  const [car, setCar]           = useState({ plate: '', make: '', model: '', color: '', year: '' })
  const [site, setSite]         = useState({ water: false, power: false })
  const [notes, setNotes]       = useState('')
  const [busy, setBusy]         = useState(false)
  const [error, setError]       = useState(null)

  async function submit() {
    setBusy(true); setError(null)
    try {
      const id = await adminCreateOrderForConsumer({
        consumerId: consumer.id,
        lat:        loc.lat,
        lng:        loc.lng,
        category,
        carDetails: { ...car, year: car.year ? Number(car.year) : null },
        siteFlags:  site,
        accessNotes: notes || null,
      })
      onCreated?.(id)
    } catch (e) { setError(e.message) }
    finally    { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[55] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-surface rounded-2xl border border-edge shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <header className="border-b border-edge bg-surface-elevated px-5 py-3 flex items-center gap-3">
          <Sparkles size={18} className="text-admin-deep" />
          <div className="flex-1">
            <p className="text-[11px] uppercase tracking-wider text-ink-subtle">Step {step} of 4</p>
            <p className="text-sm font-semibold text-ink">{['Pick consumer','Drop location pin','Vehicle','Notes & submit'][step - 1]}</p>
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink p-1.5"><X size={16} /></button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="mb-3 flex items-start gap-2 px-3 py-2 rounded-xl border border-danger/30 bg-danger/10 text-danger text-xs">
              <AlertCircle size={14} className="shrink-0 mt-0.5" /><span className="font-mono">{error}</span>
            </div>
          )}
          {step === 1 && <ConsumerStep consumer={consumer} setConsumer={setConsumer} />}
          {step === 2 && <LocationStep loc={loc} setLoc={setLoc} />}
          {step === 3 && <VehicleStep category={category} setCategory={setCategory} car={car} setCar={setCar} />}
          {step === 4 && <NotesStep site={site} setSite={setSite} notes={notes} setNotes={setNotes}
                                    consumer={consumer} loc={loc} category={category} car={car} />}
        </div>

        <footer className="border-t border-edge bg-surface-elevated px-5 py-3 flex items-center gap-2 justify-end">
          {step > 1 && <button className="btn-ghost" onClick={() => setStep(step - 1)} disabled={busy}>Back</button>}
          {step < 4 && (
            <button className="btn-primary" onClick={() => setStep(step + 1)}
              disabled={
                (step === 1 && !consumer) ||
                (step === 2 && !loc) ||
                (step === 3 && !category)
              }
            >
              Next
            </button>
          )}
          {step === 4 && (
            <button className="btn-primary" onClick={submit} disabled={busy}>
              {busy ? 'Creating…' : 'Create order'}
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}

function ConsumerStep({ consumer, setConsumer }) {
  const [query, setQuery]   = useState('')
  const [rows, setRows]     = useState([])
  const [busy, setBusy]     = useState(false)

  useEffect(() => {
    let cancelled = false
    setBusy(true)
    searchConsumers(query, 30)
      .then(r => { if (!cancelled) setRows(r) })
      .catch(() => { if (!cancelled) setRows([]) })
      .finally(() => { if (!cancelled) setBusy(false) })
    return () => { cancelled = true }
  }, [query])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 bg-surface rounded-xl border border-edge px-3">
        <Search size={14} className="text-ink-subtle" />
        <input className="flex-1 bg-transparent outline-none text-sm py-2" placeholder="Search by name / phone" value={query} onChange={e => setQuery(e.target.value)} />
      </div>
      <div className="flex flex-col divide-y divide-edge border border-edge rounded-xl bg-surface max-h-[360px] overflow-y-auto">
        {rows.map(r => {
          const picked = consumer?.id === r.id
          return (
            <button
              key={r.id}
              onClick={() => setConsumer(r)}
              className={`text-start px-3 py-2 hover:bg-surface-elevated-2 ${picked ? 'bg-admin-soft' : ''}`}
            >
              <p className="text-sm text-ink font-medium">{r.full_name || '—'}</p>
              <p className="text-[11.5px] text-ink-muted">{r.phone || '—'} · <span className="font-mono">{r.id.slice(0, 8)}…</span></p>
            </button>
          )
        })}
        {rows.length === 0 && (
          <p className="text-center text-ink-subtle text-sm py-8">{busy ? 'Loading…' : 'No matches.'}</p>
        )}
      </div>
      {consumer && (
        <p className="text-[12px] text-success">Selected: <strong>{consumer.full_name}</strong></p>
      )}
    </div>
  )
}

function LocationStep({ loc, setLoc }) {
  const mapEl = useRef(null)
  const mapInst = useRef(null)
  const markerRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    // Lazy-load leaflet to keep the initial bundle small for the rest of the
    // admin app, and to avoid SSR/test issues if jsdom ever boots this file.
    Promise.all([
      import('leaflet'),
      import('leaflet/dist/leaflet.css'),
    ]).then(([Lmod]) => {
      if (cancelled || !mapEl.current) return
      const L = Lmod.default ?? Lmod
      // Fix Leaflet's default marker icon paths (broken in Vite bundles).
      delete L.Icon.Default.prototype._getIconUrl
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      })

      const map = L.map(mapEl.current).setView(loc ? [loc.lat, loc.lng] : DEFAULT_CENTER, 13)
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map)
      mapInst.current = map

      function place(latlng) {
        if (markerRef.current) markerRef.current.setLatLng(latlng)
        else markerRef.current = L.marker(latlng).addTo(map)
        setLoc({ lat: latlng.lat, lng: latlng.lng })
      }
      if (loc) place({ lat: loc.lat, lng: loc.lng })
      map.on('click', (e) => place(e.latlng))
    })
    return () => {
      cancelled = true
      if (mapInst.current) { mapInst.current.remove(); mapInst.current = null; markerRef.current = null }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-3">
      <div ref={mapEl} className="h-[400px] rounded-xl overflow-hidden border border-edge" />
      <p className="text-[12px] text-ink-muted flex items-center gap-1.5">
        <MapPin size={12} /> Click the map to drop a pin. {loc && (
          <span className="font-mono text-ink">{loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}</span>
        )}
      </p>
    </div>
  )
}

function VehicleStep({ category, setCategory, car, setCar }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className="label-uppercase">Category</span>
        <div className="flex gap-1.5">
          {CATEGORIES.map(c => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border transition-colors ${
                category === c.id ? 'bg-admin-soft border-admin text-admin-deep' : 'border-edge text-ink-muted hover:text-ink'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Plate"  value={car.plate}  onChange={v => setCar({ ...car, plate: v })} />
        <Field label="Year"   value={car.year}   onChange={v => setCar({ ...car, year:  v })} type="number" />
        <Field label="Make"   value={car.make}   onChange={v => setCar({ ...car, make:  v })} />
        <Field label="Model"  value={car.model}  onChange={v => setCar({ ...car, model: v })} />
        <Field label="Color"  value={car.color}  onChange={v => setCar({ ...car, color: v })} />
      </div>
    </div>
  )
}

function NotesStep({ site, setSite, notes, setNotes, consumer, loc, category, car }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="card flex flex-col gap-1">
        <p className="label-uppercase">Summary</p>
        <p className="text-[12.5px] text-ink"><strong>Consumer:</strong> {consumer?.full_name}</p>
        <p className="text-[12.5px] text-ink-muted font-mono">Loc: {loc?.lat.toFixed(5)}, {loc?.lng.toFixed(5)}</p>
        <p className="text-[12.5px] text-ink-muted">{category} · {[car.plate, car.make, car.model].filter(Boolean).join(' · ') || '—'}</p>
      </div>
      <div className="flex gap-3">
        <Toggle label="Site has water" value={site.water} onChange={v => setSite({ ...site, water: v })} />
        <Toggle label="Site has power" value={site.power} onChange={v => setSite({ ...site, power: v })} />
      </div>
      <label className="flex flex-col gap-1">
        <span className="label-uppercase">Access notes (optional)</span>
        <textarea rows={3} className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Gate code, parking, etc." />
      </label>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label-uppercase">{label}</span>
      <input type={type} className="input" value={value} onChange={e => onChange(e.target.value)} />
    </label>
  )
}

function Toggle({ label, value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`px-3 py-1.5 rounded-xl border text-[12px] font-semibold transition-colors ${
        value ? 'bg-admin-soft border-admin text-admin-deep' : 'border-edge text-ink-muted hover:text-ink'
      }`}
    >
      {label}: {value ? 'YES' : 'NO'}
    </button>
  )
}
