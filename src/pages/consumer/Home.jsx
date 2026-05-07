import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Loader2, CheckCircle, MapPin } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase.js'
import { useReverseGeocode } from '../../lib/geocode.js'
import { calcPrice, BASE_PRICES, ADDON_PRICE } from '../../lib/pricing.js'
import { useGeolocation } from '../../hooks/useGeolocation.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../components/ui/Toast.jsx'
import PageShell from '../../components/ui/PageShell.jsx'
import GlassCard from '../../components/ui/GlassCard.jsx'
import MotionButton from '../../components/ui/MotionButton.jsx'
import LocationSheet from '../../components/consumer/LocationSheet.jsx'

const SPRING = { type: 'spring', stiffness: 300, damping: 30 }

function ToggleCard({ emoji, label, desc, checked, onToggle }) {
  return (
    <MotionButton
      type="button"
      onClick={onToggle}
      className={`flex items-center gap-3 rounded-xl border p-3 text-start w-full transition-colors ${
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
  const { position: gpsPosition, error: geoError, permissionState, requestPermission } = useGeolocation()
  const showToast       = useToast()
  const { t }           = useTranslation()

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

  const CAR_TYPES = [
    { value: 'sedan',  label: t('carLabels.sedan')  },
    { value: 'suv',    label: t('carLabels.suv')    },
    { value: 'pickup', label: t('carLabels.pickup') },
    { value: 'van',    label: t('carLabels.van')    },
  ]

  const SERVICE_TYPES = [
    { value: 'exterior', label: t('serviceLabels.exterior'), desc: t('consumer.home.exteriorDesc') },
    { value: 'interior', label: t('serviceLabels.interior'), desc: t('consumer.home.interiorDesc') },
    { value: 'full',     label: t('serviceLabels.full'),     desc: t('consumer.home.fullDesc')     },
  ]

  const effectivePin = pin ?? gpsPosition
  const { basePrice, platformFee, totalPrice } = calcPrice(
    carType, serviceType, { wiper_fluid: addonWiper, tire_pressure: addonTire }
  )
  const serviceBase = BASE_PRICES[carType][serviceType]
  const { address: pinAddress } = useReverseGeocode(effectivePin?.lat, effectivePin?.lng)

  async function handleBook() {
    if (submittingRef.current) return
    if (!effectivePin) { setError(t('consumer.home.locationRequired')); return }
    setError('')
    submittingRef.current = true
    setSubmitting(true)

    // address_label: prefer the user-confirmed label from LocationSheet,
    // fall back to the geocode hook's result (already resolved for GPS-only flow),
    // then to raw coords as last resort.
    const address_label = pin?.address_label
      ?? pinAddress
      ?? `${effectivePin.lat.toFixed(4)}, ${effectivePin.lng.toFixed(4)}`

    const { data, error: dbError } = await supabase
      .from('orders')
      .insert({
        consumer_id:   user.id,
        car_type:      carType,
        service_type:  serviceType,
        location:      `POINT(${effectivePin.lng} ${effectivePin.lat})`,
        address_label,
        address_street: pin?.address_street ?? null,
        address_number: pin?.address_number ?? null,
        address_city:   pin?.address_city   ?? null,
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
    showToast(t('consumer.home.bookingSuccess'), 'success')
    navigate(`/order/${data.id}`)
  }

  return (
    <PageShell>
      <div className="bg-mesh min-h-full px-4 pt-6 pb-4 flex flex-col gap-4">
        <h1 className="text-xl font-bold text-neutral-900">{t('consumer.home.title')}</h1>

        {permissionState === 'idle' && (
          <div className="bg-white/80 border border-primary-200 backdrop-blur-xl rounded-2xl p-5 flex flex-col gap-3 shadow">
            <p className="text-sm font-bold text-neutral-800">{t('consumer.home.locationPrompt.title')}</p>
            <p className="text-sm text-neutral-600">{t('consumer.home.locationPrompt.body')}</p>
            <button onClick={requestPermission} className="btn-primary">
              {t('consumer.home.locationPrompt.button')}
            </button>
          </div>
        )}

        {permissionState === 'denied' && (
          <div className="bg-warning-50 border border-warning-200 rounded-2xl p-5 flex flex-col gap-2">
            <p className="text-sm font-bold text-warning-800">{t('consumer.home.locationDenied.title')}</p>
            <p className="text-sm text-warning-700">{t('consumer.home.locationDenied.body')}</p>
          </div>
        )}

        <GlassCard className="p-5 flex flex-col gap-5">
          {/* Location */}
          <div>
            <p className="label mb-2">{t('consumer.home.yourLocation')}</p>
            <MotionButton
              type="button"
              onClick={() => setSheetOpen(true)}
              className="flex items-center gap-2 w-full rounded-xl border border-neutral-200 bg-white/70 px-4 py-3 text-sm text-start transition-colors hover:border-primary-400"
              style={{ minHeight: 44 }}
            >
              <MapPin className="h-4 w-4 text-primary-500 shrink-0" />
              <span className={effectivePin ? 'text-neutral-700' : 'text-neutral-400'}>
                {effectivePin
                  ? (pin?.address_label ?? pinAddress ?? `${effectivePin.lat.toFixed(4)}, ${effectivePin.lng.toFixed(4)}`)
                  : t('consumer.home.tapToSetLocation')
                }
              </span>
            </MotionButton>
            {geoError
              ? <p className="text-xs text-warning-600 mt-1">{t('consumer.home.locationError')}</p>
              : effectivePin
                ? <p className="text-xs text-neutral-400 mt-1">{t('consumer.home.tapToAdjust')}</p>
                : <p className="text-xs text-neutral-400 mt-1">{t('consumer.home.allowLocation')}</p>
            }
          </div>

          {/* Car type */}
          <div>
            <p className="label mb-2">{t('consumer.home.carType')}</p>
            <div className="grid grid-cols-2 gap-2">
              {CAR_TYPES.map(c => (
                <motion.button
                  key={c.value}
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  transition={SPRING}
                  onClick={() => setCarType(c.value)}
                  className={`relative rounded-xl border p-3 text-sm font-medium text-start overflow-hidden ${
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

          {/* Service type */}
          <div>
            <p className="label mb-2">{t('consumer.home.service')}</p>
            <div className="flex flex-col gap-2">
              {SERVICE_TYPES.map(s => (
                <motion.button
                  key={s.value}
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  transition={SPRING}
                  onClick={() => setServiceType(s.value)}
                  className={`relative flex items-center justify-between rounded-xl border p-3 text-start overflow-hidden ${
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
                  <span className={`relative z-10 text-sm font-bold shrink-0 ms-2 ${serviceType === s.value ? 'text-primary-600' : 'text-neutral-500'}`}>
                    ₪{BASE_PRICES[carType][s.value]}
                  </span>
                </motion.button>
              ))}
            </div>
          </div>

          {/* Key location */}
          <div>
            <label className="label">
              {t('consumer.home.keyLocation')} <span className="font-normal text-neutral-400">{t('consumer.home.optional')}</span>
            </label>
            <textarea
              className="input min-h-[76px] resize-none"
              maxLength={200}
              placeholder={t('consumer.home.keyLocationPlaceholder')}
              value={keyLocation}
              onChange={e => setKeyLocation(e.target.value)}
            />
            <p className="text-xs text-neutral-400 mt-1">{t('consumer.home.keyLocationHint')}</p>
          </div>

          {/* Site resources */}
          <div>
            <p className="label mb-2">{t('consumer.home.siteResources')}</p>
            <div className="flex flex-col gap-2">
              <ToggleCard emoji="💧" label={t('consumer.home.waterAccessible')}    checked={siteHasWater} onToggle={() => setSiteHasWater(v => !v)} />
              <ToggleCard emoji="🔌" label={t('consumer.home.powerAccessible')} checked={siteHasPower} onToggle={() => setSiteHasPower(v => !v)} />
            </div>
            <p className="text-xs text-neutral-400 mt-1">{t('consumer.home.siteResourcesHint')}</p>
          </div>

          {/* Add-ons */}
          <div>
            <p className="label mb-2">{t('consumer.home.addons')} <span className="font-normal text-neutral-400">{t('consumer.home.optional')}</span></p>
            <div className="flex flex-col gap-2">
              <ToggleCard emoji="💧" label={t('consumer.home.wiperFluidRefill')}  desc={`+₪${ADDON_PRICE}`} checked={addonWiper} onToggle={() => setAddonWiper(v => !v)} />
              <ToggleCard emoji="🛞" label={t('consumer.home.tirePressureCheck')} desc={`+₪${ADDON_PRICE}`} checked={addonTire}  onToggle={() => setAddonTire(v => !v)} />
            </div>
          </div>

          {/* Price summary */}
          <div className="rounded-xl border border-neutral-100 bg-white/60 p-4 flex flex-col gap-2">
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">{t('consumer.home.serviceLine')}</span>
              <span className="font-medium">₪{serviceBase}</span>
            </div>
            {addonWiper && (
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">{t('consumer.home.wiperFluidRefill')}</span>
                <span className="font-medium">₪{ADDON_PRICE}</span>
              </div>
            )}
            {addonTire && (
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">{t('consumer.home.tirePressureCheck')}</span>
                <span className="font-medium">₪{ADDON_PRICE}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-neutral-500">{t('consumer.home.platformFee')}</span>
              <span className="font-medium">₪{platformFee}</span>
            </div>
            <div className="border-t border-neutral-100 pt-2 flex justify-between font-bold items-center">
              <span>{t('consumer.home.total')}</span>
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
            {submitting ? t('consumer.home.booking') : t('consumer.home.bookNow')}
            {!submitting && <ChevronRight className="h-4 w-4 rtl:rotate-180" />}
          </MotionButton>
        </GlassCard>
      </div>

      <LocationSheet
        open={sheetOpen}
        initialPosition={effectivePin}
        onConfirm={result => { setPin(result); setSheetOpen(false) }}
        onClose={() => setSheetOpen(false)}
      />
    </PageShell>
  )
}
