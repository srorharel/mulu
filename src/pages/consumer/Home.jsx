import { useState, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Loader2, CheckCircle, MapPin, Droplets, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase.js'
import { useReverseGeocode } from '../../lib/geocode.js'
import { VAT_RATE, consumerBreakdown, priceForCategory } from '../../lib/pricing.js'
import { useGeolocation } from '../../hooks/useGeolocation.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../components/ui/Toast.jsx'
import PageShell from '../../components/ui/PageShell.jsx'
import GlassCard from '../../components/ui/GlassCard.jsx'
import MotionButton from '../../components/ui/MotionButton.jsx'
import LocationSheet from '../../components/consumer/LocationSheet.jsx'
import LicensePlatePicker from '../../components/consumer/LicensePlatePicker.jsx'
import CarPhotoUpload from '../../components/consumer/CarPhotoUpload.jsx'

function ToggleCard({ icon: Icon, label, desc, checked, onToggle }) {
  return (
    <MotionButton
      type="button"
      onClick={onToggle}
      className={`flex items-center gap-3 rounded-xl border p-3 text-start w-full transition-colors ${
        checked ? 'border-primary-500 bg-primary-50' : 'border-neutral-200 bg-white/70'
      }`}
      style={{ minHeight: 44 }}
    >
      <Icon className={`h-5 w-5 shrink-0 ${checked ? 'text-primary-600' : 'text-neutral-400'}`} />
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

  // Stable UUID for this booking session — used as storage folder for optional photos.
  const orderId = useMemo(() => crypto.randomUUID(), [])

  const [pin, setPin]                   = useState(null)
  const [sheetOpen, setSheetOpen]       = useState(false)
  const [accessNotes, setAccessNotes]   = useState('')
  const [siteHasWater, setSiteHasWater] = useState(false)
  const [siteHasPower, setSiteHasPower] = useState(false)
  const [submitting, setSubmitting]     = useState(false)
  const submittingRef                   = useRef(false)
  const [error, setError]               = useState('')

  // License plate / vehicle identity — category comes from plate lookup or manual picker
  const [licenseData, setLicenseData] = useState({ make: null, model: null, year: null, plate: null, color: null, category: null, isValid: false })

  const [photos, setPhotos] = useState([null, null])

  const effectivePin = pin ?? gpsPosition
  const { address: pinAddress } = useReverseGeocode(effectivePin?.lat, effectivePin?.lng)
  const { total: consumerTotal, vat } = consumerBreakdown(licenseData.category || 'private')
  const bothPhotosUploaded = photos[0] !== null && photos[1] !== null

  const canSubmit = !!effectivePin && licenseData.isValid && bothPhotosUploaded

  async function handleBook() {
    if (submittingRef.current) return
    if (!effectivePin) { setError(t('consumer.home.locationRequired')); return }
    if (!licenseData.isValid) { setError(t('consumer.home.plate.notFound')); return }

    if (!photos[0] || !photos[1]) { setError(t('consumer.home.submit.needsPhotos')); return }

    setError('')
    submittingRef.current = true
    setSubmitting(true)

    const address_label = pin?.address_label
      ?? pinAddress
      ?? `${effectivePin.lat.toFixed(4)}, ${effectivePin.lng.toFixed(4)}`

    const prices = priceForCategory(licenseData.category || 'private')

    const { data, error: dbError } = await supabase
      .from('orders')
      .insert({
        id:            orderId,
        consumer_id:   user.id,
        car_type:      licenseData.category || 'private',
        service_type:  'wash',
        location:      `POINT(${effectivePin.lng} ${effectivePin.lat})`,
        address_label,
        address_street: pin?.address_street ?? null,
        address_number: pin?.address_number ?? null,
        address_city:   pin?.address_city   ?? null,
        base_price:    prices.worker,
        platform_fee:  prices.platform,
        total_price:   prices.consumer,
        status:        'pending',
        key_location:  null,
        access_notes:  accessNotes.trim() || null,
        site_has_water:      siteHasWater,
        site_has_power:      siteHasPower,
        addon_wiper_fluid:   false,
        addon_tire_pressure: false,
        car_make:        licenseData.make,
        car_model:       licenseData.model,
        car_year:        licenseData.year,
        car_plate:       licenseData.plate ?? null,
        car_color:       licenseData.color ?? null,
        car_photo_1_path: photos[0]?.path ?? null,
        car_photo_2_path: photos[1]?.path ?? null,
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

          {/* License plate lookup — also detects vehicle category for pricing */}
          <LicensePlatePicker onChange={setLicenseData} />

          {/* Vehicle photos */}
          <div>
            <CarPhotoUpload
              orderId={orderId}
              onChange={(newPhotos) => setPhotos(newPhotos)}
            />
            {!bothPhotosUploaded && (
              <p className="text-xs text-neutral-400 mt-1">{t('consumer.home.submit.needsPhotos')}</p>
            )}
          </div>

          {/* Access notes */}
          <div>
            <label className="label">
              {t('consumer.home.fields.accessNotes')} <span className="font-normal text-neutral-400">{t('consumer.home.optional')}</span>
            </label>
            <textarea
              className="input min-h-[76px] resize-none"
              maxLength={300}
              placeholder={t('consumer.home.fields.accessNotesPlaceholder')}
              value={accessNotes}
              onChange={e => setAccessNotes(e.target.value)}
            />
          </div>

          {/* Site resources */}
          <div>
            <p className="label mb-2">{t('consumer.home.siteResources')}</p>
            <div className="flex flex-col gap-2">
              <ToggleCard icon={Droplets} label={t('consumer.home.waterAccessible')}    checked={siteHasWater} onToggle={() => setSiteHasWater(v => !v)} />
              <ToggleCard icon={Zap}      label={t('consumer.home.powerAccessible')} checked={siteHasPower} onToggle={() => setSiteHasPower(v => !v)} />
            </div>
            <p className="text-xs text-neutral-400 mt-1">{t('consumer.home.siteResourcesHint')}</p>
          </div>

          {/* Price summary — hidden until category is known from plate lookup */}
          {licenseData.category && (
            <div className="rounded-xl border border-neutral-100 bg-white/60 p-4 flex flex-col gap-1">
              <div className="flex justify-between font-bold items-center">
                <span>{t('consumer.home.price.total')}</span>
                <span className="text-primary-600">₪{consumerTotal}</span>
              </div>
              <p className="text-xs text-neutral-400">
                {t('consumer.home.price.includesVat', { rate: Math.round(VAT_RATE * 100), amount: vat.toFixed(2) })}
              </p>
            </div>
          )}

          {error && <p className="text-danger-500 text-sm bg-danger-50 rounded-lg p-3">{error}</p>}

          <MotionButton onClick={handleBook} disabled={submitting || !canSubmit} className="btn-primary">
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
