import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Loader2, CheckCircle, MapPin } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '../../lib/supabase.js'
import { calcPrice, BASE_PRICES, ADDON_PRICE } from '../../lib/pricing.js'
import { useGeolocation } from '../../hooks/useGeolocation.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../components/ui/Toast.jsx'
import PageShell from '../../components/ui/PageShell.jsx'
import GlassCard from '../../components/ui/GlassCard.jsx'
import MotionButton from '../../components/ui/MotionButton.jsx'
import LocationSheet from '../../components/consumer/LocationSheet.jsx'

const CAR_TYPES = [
  { value: 'sedan',  label: 'Sedan'  },
  { value: 'suv',    label: 'SUV'    },
  { value: 'pickup', label: 'Pickup' },
  { value: 'van',    label: 'Van'    },
]

const SERVICE_TYPES = [
  { value: 'exterior', label: 'Exterior', desc: 'Outside wash & dry'     },
  { value: 'interior', label: 'Interior', desc: 'Inside vacuum & wipe'   },
  { value: 'full',     label: 'Full',     desc: 'Complete inside & out'  },
]

const SPRING = { type: 'spring', stiffness: 300, damping: 30 }

function ToggleCard({ emoji, label, desc, checked, onToggle }) {
  return (
    <MotionButton
      type="button"
      onClick={onToggle}
      className={`flex items-center gap-3 rounded-xl border p-3 text-left w-full transition-colors ${
        checked ? 'border-primary-500 bg-primary-50' : 'border-neutral-200 bg-white/70'
      }`}
      style={{ minHeight: 44 }}
    >
      <span className="text-lg leading-none">{emoji}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${checked ? 'text-primary-700' : 'text-neutral-800'}`}>{label}</p>
        {desc && <p className="text-xs text-neutral-500">{desc}</p>}
      </div>
      {checked && <CheckCircle className="h-4 w-4 text-primary-500 shrink-0" />}
    </MotionButton>
  )
}

export default function ConsumerHome() {
  const navigate        = useNavigate()
  const { user }        = useAuth()
  const { position: gpsPosition, error: geoError } = useGeolocation()
  const showToast       = useToast()

  const [pin, setPin]                   = useState(null)
  const [sheetOpen, setSheetOpen]       = useState(false)
  const [carType, setCarType]           = useState('sedan')
  const [serviceType, setServiceType]   = useState('exterior')
  const [keyLocation, setKeyLocation]   = useState('')
  const [siteHasWater, setSiteHasWater] = useState(false)
  const [siteHasPower, setSiteHasPower] = useState(false)
  const [addonWiper, setAddonWiper]     = useState(false)
  const [addonTire, setAddonTire]       = useState(false)
  const [submitting, setSubmitting]     = useState(false)
  const submittingRef                   = useRef(false)
  const [error, setError]               = useState('')

  const effectivePin = pin ?? gpsPosition
  const { basePrice, platformFee, totalPrice } = calcPrice(
    carType, serviceType, { wiper_fluid: addonWiper, tire_pressure: addonTire }
  )
  const serviceBase = BASE_PRICES[carType][serviceType]

  async function handleBook() {
    if (submittingRef.current) return
    if (!effectivePin) { setError('Please allow location or tap "Choose location" to set your pin'); return }
    setError('')
    submittingRef.current = true
    setSubmitting(true)

    const { data, error: dbError } = await supabase
      .from('orders')
      .insert({
        consumer_id:   user.id,
        car_type:      carType,
        service_type:  serviceType,
        location:      `POINT(${effectivePin.lng} ${effectivePin.lat})`,
        address_label: `${effectivePin.lat.toFixed(4)}, ${effectivePin.lng.toFixed(4)}`,
        base_price:    basePrice,
        platform_fee:  platformFee,
        total_price:   totalPrice,
        status:        'pending',
        key_location:  keyLocation.trim() || null,
        site_has_water:      siteHasWater,
        site_has_power:      siteHasPower,
        addon_wiper_fluid:   addonWiper,
        addon_tire_pressure: addonTire,
      })
      .select('id')
      .single()

    submittingRef.current = false
    setSubmitting(false)
    if (dbError) { setError(dbError.message); return }
    showToast('Your wash is booked! Looking for a washer…', 'success')
    navigate(`/order/${data.id}`)
  }

  return (
    <PageShell>
      <div className="bg-mesh min-h-full px-4 pt-6 pb-4 flex flex-col gap-4">
        <h1 className="text-xl font-bold text-neutral-900">Book a wash</h1>

        <GlassCard className="p-5 flex flex-col gap-5">
          {/* Location — button triggers full-screen sheet */}
          <div>
            <p className="label mb-2">Your location</p>
            <MotionButton
              type="button"
              onClick={() => setSheetOpen(true)}
              className="flex items-center gap-2 w-full rounded-xl border border-neutral-200 bg-white/70 px-4 py-3 text-sm text-left transition-colors hover:border-primary-400"
              style={{ minHeight: 44 }}
            >
              <MapPin className="h-4 w-4 text-primary-500 shrink-0" />
              <span className={effectivePin ? 'text-neutral-700' : 'text-neutral-400'}>
                {effectivePin
                  ? `${effectivePin.lat.toFixed(4)}, ${effectivePin.lng.toFixed(4)}`
                  : 'Tap to set location'
                }
              </span>
            </MotionButton>
            {geoError
              ? <p className="text-xs text-warning-600 mt-1">Couldn't get your location — tap above to set it manually</p>
              : effectivePin
                ? <p className="text-xs text-neutral-400 mt-1">Tap to adjust pin</p>
                : <p className="text-xs text-neutral-400 mt-1">Or allow location access for auto-detect</p>
            }
          </div>

          {/* Car type — layoutId morphing background between selections */}
          <div>
            <p className="label mb-2">Car type</p>
            <div className="grid grid-cols-2 gap-2">
              {CAR_TYPES.map(c => (
                <motion.button
                  key={c.value}
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  transition={SPRING}
                  onClick={() => setCarType(c.value)}
                  className={`relative rounded-xl border p-3 text-sm font-medium text-left overflow-hidden ${
                    carType === c.value ? 'border-primary-500 text-primary-700' : 'border-neutral-200 text-neutral-700'
                  }`}
                  style={{ minHeight: 44 }}
                >
                  {carType === c.value && (
                    <motion.div
                      layoutId="car-type-active"
                      className="absolute inset-0 bg-primary-50"
                      transition={SPRING}
                    />
                  )}
                  <span className="relative z-10">{c.label}</span>
                </motion.button>
              ))}
            </div>
          </div>

          {/* Service type — layoutId morphing background */}
          <div>
            <p className="label mb-2">Service</p>
            <div className="flex flex-col gap-2">
              {SERVICE_TYPES.map(s => (
                <motion.button
                  key={s.value}
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  transition={SPRING}
                  onClick={() => setServiceType(s.value)}
                  className={`relative flex items-center justify-between rounded-xl border p-3 text-left overflow-hidden ${
                    serviceType === s.value ? 'border-primary-500' : 'border-neutral-200'
                  }`}
                  style={{ minHeight: 44 }}
                >
                  {serviceType === s.value && (
                    <motion.div
                      layoutId="service-type-active"
                      className="absolute inset-0 bg-primary-50"
                      transition={SPRING}
                    />
                  )}
                  <div className="relative z-10">
                    <p className={`text-sm font-medium ${serviceType === s.value ? 'text-primary-700' : 'text-neutral-800'}`}>
                      {s.label}
                    </p>
                    <p className="text-xs text-neutral-500">{s.desc}</p>
                  </div>
                  <span className={`relative z-10 text-sm font-bold shrink-0 ml-2 ${serviceType === s.value ? 'text-primary-600' : 'text-neutral-500'}`}>
                    ₪{BASE_PRICES[carType][s.value]}
                  </span>
                </motion.button>
              ))}
            </div>
          </div>

          {/* Key location */}
          <div>
            <label className="label">
              Key location <span className="font-normal text-neutral-400">(optional)</span>
            </label>
            <textarea
              className="input min-h-[76px] resize-none"
              maxLength={200}
              placeholder="e.g. At the front desk, in the electric cabinet, leave keys with doorman"
              value={keyLocation}
              onChange={e => setKeyLocation(e.target.value)}
            />
            <p className="text-xs text-neutral-400 mt-1">Only your washer will see this, after they accept the job.</p>
          </div>

          {/* Site resources */}
          <div>
            <p className="label mb-2">What's available at the location?</p>
            <div className="flex flex-col gap-2">
              <ToggleCard emoji="💧" label="Water tap accessible"    checked={siteHasWater} onToggle={() => setSiteHasWater(v => !v)} />
              <ToggleCard emoji="🔌" label="Power outlet accessible" checked={siteHasPower} onToggle={() => setSiteHasPower(v => !v)} />
            </div>
            <p className="text-xs text-neutral-400 mt-1">This helps the washer know what to bring.</p>
          </div>

          {/* Add-ons */}
          <div>
            <p className="label mb-2">Add-ons <span className="font-normal text-neutral-400">(optional)</span></p>
            <div className="flex flex-col gap-2">
              <ToggleCard emoji="💧" label="Wiper Fluid Refill"   desc={`+₪${ADDON_PRICE}`} checked={addonWiper} onToggle={() => setAddonWiper(v => !v)} />
              <ToggleCard emoji="🛞" label="Tire Pressure Check"  desc={`+₪${ADDON_PRICE}`} checked={addonTire}  onToggle={() => setAddonTire(v => !v)} />
            </div>
          </div>

          {/* Price summary — total price animates on change */}
          <div className="rounded-xl border border-neutral-100 bg-white/60 p-4 flex flex-col gap-2">
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Service</span>
              <span className="font-medium">₪{serviceBase}</span>
            </div>
            {addonWiper && (
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">Wiper Fluid Refill</span>
                <span className="font-medium">₪{ADDON_PRICE}</span>
              </div>
            )}
            {addonTire && (
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">Tire Pressure Check</span>
                <span className="font-medium">₪{ADDON_PRICE}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">Platform fee (15%)</span>
              <span className="font-medium">₪{platformFee}</span>
            </div>
            <div className="border-t border-neutral-100 pt-2 flex justify-between font-bold items-center">
              <span>Total</span>
              <AnimatePresence mode="wait">
                <motion.span
                  key={totalPrice}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  transition={{ duration: 0.15 }}
                  className="text-primary-600"
                >
                  ₪{totalPrice}
                </motion.span>
              </AnimatePresence>
            </div>
          </div>

          {error && <p className="text-danger-500 text-sm bg-danger-50 rounded-lg p-3">{error}</p>}

          <MotionButton onClick={handleBook} disabled={submitting} className="btn-primary">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {submitting ? 'Booking…' : 'Book Now'}
            {!submitting && <ChevronRight className="h-4 w-4" />}
          </MotionButton>
        </GlassCard>
      </div>

      {/* Location sheet — portaled to document.body */}
      <LocationSheet
        open={sheetOpen}
        initialPosition={effectivePin}
        onConfirm={pos => { setPin(pos); setSheetOpen(false) }}
        onClose={() => setSheetOpen(false)}
      />
    </PageShell>
  )
}
