import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Loader2, MapPin, Droplets, Zap, User, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase.js'
import { useReverseGeocode } from '../../lib/geocode.js'
import { VAT_RATE, consumerBreakdown, priceForCategory } from '../../lib/pricing.js'
import { useGeolocation } from '../../hooks/useGeolocation.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useTheme } from '../../hooks/useTheme.js'
import { useToast } from '../../components/ui/Toast.jsx'
import { formatPlate } from '../../lib/formatPlate.js'
import PageShell from '../../components/ui/PageShell.jsx'
import GlassCard from '../../components/ui/GlassCard.jsx'
import MotionButton from '../../components/ui/MotionButton.jsx'
import WashMark from '../../components/ui/WashMark.jsx'
import IsraeliPlate from '../../components/ui/IsraeliPlate.jsx'
import LocationSheet from '../../components/consumer/LocationSheet.jsx'
import LicensePlatePicker from '../../components/consumer/LicensePlatePicker.jsx'
import CarPhotoUpload from '../../components/consumer/CarPhotoUpload.jsx'
import VehiclePickerSheet from '../../components/consumer/VehiclePickerSheet.jsx'
import SaveVehicleDialog from '../../components/consumer/SaveVehicleDialog.jsx'

// Derive up to 2 initials from profile.full_name, falling back to the email prefix.
function getInitials(profile, user) {
  const name = profile?.full_name || ''
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  const emailPrefix = user?.email?.split('@')[0] || ''
  return emailPrefix.slice(0, 2).toUpperCase() || null
}

// Return a time-of-day greeting key: morning / afternoon / evening.
function greetingKey() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

// Small site-resource toggle card (water tap / power outlet).
function SiteResourceCard({ icon: Icon, label, available, onToggle, t }) {
  return (
    <MotionButton
      type="button"
      onClick={onToggle}
      className={`flex items-center gap-2.5 p-3 rounded-glass-sm border backdrop-blur-xl transition-colors text-start w-full ${
        available
          ? 'border-primary-300 bg-primary-50/80'
          : 'border-glass-border bg-glass'
      }`}
    >
      <div className={`w-[34px] h-[34px] rounded-[11px] flex items-center justify-center shrink-0 ${
        available ? 'bg-primary-500 text-white' : 'bg-black/[0.06] text-ink-muted'
      }`}>
        <Icon className="h-[18px] w-[18px]" />
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-bold text-ink leading-tight">{label}</p>
        <p className={`text-[11px] ${available ? 'text-primary-800' : 'text-ink-muted'}`}>
          {available ? t('consumer.home.available') : t('consumer.home.notOnSite')}
        </p>
      </div>
    </MotionButton>
  )
}

// Confirmed vehicle summary — shown when a vehicle is selected (saved or free-text confirmed).
function ConfirmedVehicleDisplay({ licenseData, onChangeVehicle, t }) {
  return (
    <div className="flex items-center gap-3" dir="ltr">
      <IsraeliPlate number={formatPlate(licenseData.plate)} />
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-bold text-ink leading-snug" dir="auto">
          {[licenseData.make, licenseData.model, licenseData.year].filter(Boolean).join(' · ')}
        </p>
        <p className="text-[12px] text-ink-muted flex items-center gap-1.5" dir="auto">
          {[licenseData.color, licenseData.category ? t(`carLabels.${licenseData.category}`) : null].filter(Boolean).join(' · ')}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button type="button" onClick={onChangeVehicle} className="text-[11px] font-semibold text-primary-700 hover:underline">
          {t('consumer.home.changeVehicle')}
        </button>
        <div className="w-[26px] h-[26px] rounded-full bg-primary-500 flex items-center justify-center shadow-[0_1px_3px_rgba(38,181,95,0.4)]">
          <Check className="h-[14px] w-[14px] text-white" strokeWidth={3} />
        </div>
      </div>
    </div>
  )
}

const EMPTY_LICENSE = { make: null, model: null, year: null, plate: null, color: null, category: null, isValid: false }

export default function ConsumerHome() {
  const navigate        = useNavigate()
  const { user, profile } = useAuth()
  const { isDark } = useTheme()
  const { position: gpsPosition, error: geoError, permissionState, requestPermission } = useGeolocation()
  const showToast       = useToast()
  const { t }           = useTranslation()

  // Stable UUID for this booking session — used as storage folder for photos.
  const orderId = useMemo(() => crypto.randomUUID(), [])

  const [pin, setPin]                   = useState(null)
  const [sheetOpen, setSheetOpen]       = useState(false)
  const [accessNotes, setAccessNotes]   = useState('')
  const [siteHasWater, setSiteHasWater] = useState(false)
  const [siteHasPower, setSiteHasPower] = useState(false)
  const [submitting, setSubmitting]     = useState(false)
  const submittingRef                   = useRef(false)
  const [error, setError]               = useState('')

  const [photos, setPhotos] = useState({ front: null, back: null, driver: null, passenger: null })

  // ── Vehicle state ─────────────────────────────────────────────────────────
  const [licenseData, setLicenseData]       = useState(EMPTY_LICENSE)
  const [vehicleId, setVehicleId]           = useState(null)   // UUID when from saved vehicle
  const [savedVehicles, setSavedVehicles]   = useState([])
  const [vehiclesLoaded, setVehiclesLoaded] = useState(false)
  const [showPicker, setShowPicker]         = useState(false)  // true = show LicensePlatePicker
  const [pickerSheetOpen, setPickerSheetOpen] = useState(false)

  // Post-booking save-vehicle dialog state
  const [saveDialogData, setSaveDialogData]       = useState(null)  // licenseData snapshot
  const [saveDialogOrderId, setSaveDialogOrderId] = useState(null)

  // Fetch vehicles on mount; pre-select the default vehicle if one exists.
  useEffect(() => {
    supabase
      .from('vehicles')
      .select('*')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        const vehicles = data ?? []
        setSavedVehicles(vehicles)
        const defaultV = vehicles.find(v => v.is_default)
        if (defaultV) {
          setLicenseData({
            make:     defaultV.make,
            model:    defaultV.model,
            year:     defaultV.year,
            plate:    defaultV.plate,
            color:    defaultV.color,
            category: defaultV.category ?? 'private',
            isValid:  true,
          })
          setVehicleId(defaultV.id)
          setShowPicker(false)
        } else {
          setShowPicker(true)
        }
        setVehiclesLoaded(true)
      })
  }, [user.id])

  // Keep a ref in sync so the focus handler can read the current vehicleId
  // without needing to be in its dependency array (avoids re-registering on
  // every selection change).
  const vehicleIdRef = useRef(null)
  useEffect(() => { vehicleIdRef.current = vehicleId }, [vehicleId])

  // On window focus: refresh the vehicle list and invalidate any selection that
  // was deleted in another tab while this page was open.
  useEffect(() => {
    async function handleFocus() {
      const currentId = vehicleIdRef.current
      const { data } = await supabase
        .from('vehicles')
        .select('*')
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true })
      const vehicles = data ?? []
      setSavedVehicles(vehicles)

      // Only reconcile when a saved vehicle is selected; free-text mode (currentId === null)
      // just gets a refreshed list for the picker sheet.
      if (currentId !== null && !vehicles.find(v => v.id === currentId)) {
        const defaultV = vehicles.find(v => v.is_default)
        if (defaultV) {
          setLicenseData({ make: defaultV.make, model: defaultV.model, year: defaultV.year, plate: defaultV.plate, color: defaultV.color, category: defaultV.category ?? 'private', isValid: true })
          setVehicleId(defaultV.id)
          setShowPicker(false)
        } else {
          setLicenseData(EMPTY_LICENSE)
          setVehicleId(null)
          setShowPicker(true)
        }
      }
    }

    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, []) // stable — vehicleId accessed via ref

  const effectivePin = pin ?? gpsPosition
  const { address: pinAddress } = useReverseGeocode(effectivePin?.lat, effectivePin?.lng)
  const { total: consumerTotal, vat } = consumerBreakdown(licenseData.category || 'private')
  const uploadedCount      = Object.values(photos).filter(Boolean).length
  const allPhotosUploaded  = uploadedCount === 4
  const canSubmit = !!effectivePin && licenseData.isValid && allPhotosUploaded

  const initials = getInitials(profile, user)
  const firstName = profile?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || ''
  const greeting  = t(`consumer.home.greeting.${greetingKey()}`, { name: firstName })

  const displayAddress = effectivePin
    ? (pin?.address_label ?? pinAddress ?? `${effectivePin.lat.toFixed(4)}, ${effectivePin.lng.toFixed(4)}`)
    : null

  // ── Vehicle selection handlers ────────────────────────────────────────────

  function handleSelectSavedVehicle(v) {
    setLicenseData({
      make:     v.make,
      model:    v.model,
      year:     v.year,
      plate:    v.plate,
      color:    v.color,
      category: v.category ?? 'private',
      isValid:  true,
    })
    setVehicleId(v.id)
    setShowPicker(false)
  }

  function handleEnterNewPlate() {
    setLicenseData(EMPTY_LICENSE)
    setVehicleId(null)
    setShowPicker(true)
  }

  // ── Post-booking dialog handlers ──────────────────────────────────────────

  function navigateToOrder() {
    const id = saveDialogOrderId
    setSaveDialogData(null)
    setSaveDialogOrderId(null)
    navigate(`/order/${id}`)
  }

  function handleDialogSaved(newVehicle) {
    setSavedVehicles(vs => [
      ...(newVehicle.is_default ? vs.map(v => ({ ...v, is_default: false })) : vs),
      newVehicle,
    ])
    navigateToOrder()
  }

  // ── Booking ───────────────────────────────────────────────────────────────

  async function handleBook() {
    if (submittingRef.current) return
    if (!effectivePin) { setError(t('consumer.home.locationRequired')); return }
    if (!licenseData.isValid) { setError(t('consumer.home.plate.notFound')); return }
    if (!allPhotosUploaded) { setError(t('consumer.home.submit.needsPhotos')); return }

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
        car_photo_front:     photos.front?.path     ?? null,
        car_photo_back:      photos.back?.path      ?? null,
        car_photo_driver:    photos.driver?.path    ?? null,
        car_photo_passenger: photos.passenger?.path ?? null,
        vehicle_id:    vehicleId ?? null,
      })
      .select('id')
      .single()

    submittingRef.current = false
    setSubmitting(false)
    if (dbError) { setError(dbError.message); return }
    showToast(t('consumer.home.bookingSuccess'), 'success')

    if (vehicleId === null && licenseData.plate) {
      // Free-text path: offer to save the vehicle before navigating away.
      setSaveDialogData({ ...licenseData })
      setSaveDialogOrderId(data.id)
    } else {
      navigate(`/order/${data.id}`)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <PageShell>
      <div className="bg-mesh min-h-full flex flex-col">

        {/* ── Header ── */}
        <div className="px-5 pt-4 pb-2 flex items-center justify-between shrink-0">
          <WashMark />
          <div
            className="w-[38px] h-[38px] rounded-[14px] flex items-center justify-center text-white font-bold text-[14px] shadow-[0_2px_6px_rgba(38,181,95,0.3)]"
            style={{ background: 'linear-gradient(135deg, #B9E5CB, #47D17F)' }}
          >
            {initials ?? <User className="h-5 w-5" />}
          </div>
        </div>

        {/* ── Greeting + title ── */}
        <div className="px-5 pt-1 pb-5 shrink-0">
          <p className="text-[13px] font-medium text-ink-muted tracking-[0.2px]">{greeting}</p>
          <h1 className="text-[26px] font-extrabold text-ink tracking-[-0.7px] mt-0.5 leading-tight">
            {t('consumer.home.subtitle')}
          </h1>
        </div>

        {/* ── Scrollable cards ── */}
        <div className="flex-1 px-4 flex flex-col gap-3 pb-4">

          {/* Location permission banners */}
          {permissionState === 'idle' && (
            <GlassCard className="p-5 flex flex-col gap-3">
              <p className="text-sm font-bold text-ink">{t('consumer.home.locationPrompt.title')}</p>
              <p className="text-sm text-ink-muted">{t('consumer.home.locationPrompt.body')}</p>
              <button onClick={requestPermission} className="btn-primary">
                {t('consumer.home.locationPrompt.button')}
              </button>
            </GlassCard>
          )}

          {permissionState === 'denied' && (
            <div className="bg-warning-50 border border-warning-200 rounded-glass p-5 flex flex-col gap-2">
              <p className="text-sm font-bold text-warning-800">{t('consumer.home.locationDenied.title')}</p>
              <p className="text-sm text-warning-700">{t('consumer.home.locationDenied.body')}</p>
            </div>
          )}

          {/* ── Location card ── */}
          <MotionButton
            type="button"
            onClick={() => setSheetOpen(true)}
            className="flex items-stretch w-full text-start rounded-glass overflow-hidden bg-glass border border-glass-border backdrop-blur-xl shadow-glass"
            style={{ minHeight: 78 }}
          >
            <div className="w-[78px] shrink-0 bg-primary-50 dark:bg-accent-muted flex items-center justify-center border-e border-glass-border">
              <MapPin className="h-[22px] w-[22px] text-primary-700" />
            </div>
            <div className="flex-1 px-4 py-3.5 flex flex-col justify-center min-w-0">
              <p className="text-[11px] font-semibold text-primary-700 uppercase tracking-[0.4px]">
                {t('consumer.home.pickupLocation')}
              </p>
              {displayAddress ? (
                <>
                  <p className="text-[15px] font-bold text-ink mt-0.5 truncate">{displayAddress}</p>
                  {geoError
                    ? <p className="text-[12px] text-warning-600 mt-0.5">{t('consumer.home.locationError')}</p>
                    : <p className="text-[12px] text-ink-muted mt-0.5">{t('consumer.home.tapToAdjust')}</p>
                  }
                </>
              ) : (
                <p className="text-[15px] font-bold text-ink-muted mt-0.5">{t('consumer.home.tapToSetLocation')}</p>
              )}
            </div>
            <div className="px-3 flex items-center text-ink-subtle shrink-0">
              <ChevronRight className="h-5 w-5" />
            </div>
          </MotionButton>

          {/* ── Vehicle card ── */}
          <GlassCard className="p-4">
            <div className="flex justify-between items-center mb-2.5">
              <p className="text-[11px] font-semibold text-primary-700 uppercase tracking-[0.4px]">
                {t('consumer.home.vehicle')}
              </p>
            </div>

            {!vehiclesLoaded ? (
              <div className="h-[44px] rounded-xl bg-neutral-100/60 animate-pulse" />
            ) : showPicker ? (
              <div className="flex flex-col gap-3">
                {savedVehicles.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setPickerSheetOpen(true)}
                    className="text-[12px] font-semibold text-primary-700 hover:underline self-start"
                  >
                    {t('consumer.home.pickVehicle.chooseSaved')}
                  </button>
                )}
                <LicensePlatePicker
                  onChange={data => { setLicenseData(data); setVehicleId(null) }}
                />
              </div>
            ) : (
              <ConfirmedVehicleDisplay
                licenseData={licenseData}
                onChangeVehicle={() => setPickerSheetOpen(true)}
                t={t}
              />
            )}
          </GlassCard>

          {/* ── Photos card ── */}
          <GlassCard className="p-4">
            <div className="flex justify-between items-start mb-2.5">
              <div>
                <p className="text-[11px] font-semibold text-primary-700 uppercase tracking-[0.4px]">
                  {t('consumer.home.carPhotos.title')}
                </p>
                <p className="text-[11px] text-ink-muted mt-0.5">
                  {t('consumer.home.carPhotos.subtitle')}
                </p>
              </div>
              <p className="text-[11px] font-semibold text-primary-700 shrink-0 mt-0.5">{uploadedCount}/4</p>
            </div>
            <CarPhotoUpload
              orderId={orderId}
              userId={user.id}
              showLabel={false}
              onChange={(newPhotos) => setPhotos(newPhotos)}
            />
            {!allPhotosUploaded && (
              <p className="text-[12px] text-ink-muted mt-2">{t('consumer.home.submit.needsPhotos')}</p>
            )}
          </GlassCard>

          {/* ── Site resources ── */}
          <div className="grid grid-cols-2 gap-2.5">
            <SiteResourceCard
              icon={Droplets}
              label={t('consumer.home.waterAccessible')}
              available={siteHasWater}
              onToggle={() => setSiteHasWater(v => !v)}
              t={t}
            />
            <SiteResourceCard
              icon={Zap}
              label={t('consumer.home.powerAccessible')}
              available={siteHasPower}
              onToggle={() => setSiteHasPower(v => !v)}
              t={t}
            />
          </div>

          {/* ── Access notes ── */}
          <GlassCard className="p-4">
            <label className="label">
              {t('consumer.home.fields.accessNotes')}{' '}
              <span className="font-normal text-ink-muted">{t('consumer.home.optional')}</span>
            </label>
            <textarea
              className="input min-h-[76px] resize-none mt-1"
              maxLength={300}
              placeholder={t('consumer.home.fields.accessNotesPlaceholder')}
              value={accessNotes}
              onChange={e => setAccessNotes(e.target.value)}
            />
          </GlassCard>

          {/* Error */}
          {error && (
            <p className="text-danger-500 text-sm bg-danger-50 border border-danger-200 rounded-glass p-3">{error}</p>
          )}

          {/* ── Price + CTA ── */}
          <GlassCard
            className="p-3.5"
            style={isDark ? undefined : { background: 'linear-gradient(135deg, rgba(255,255,255,0.85), rgba(243,252,247,0.85))', borderColor: '#B9E5CB' }}
          >
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-primary-700 uppercase tracking-[0.4px]">
                  {t('consumer.home.price.totalVat')}
                </p>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-[26px] font-extrabold text-ink tracking-[-0.6px] leading-none">₪{consumerTotal}</span>
                  <span className="text-[11px] text-ink-muted">
                    {t('consumer.home.price.vatBreakdown', { rate: Math.round(VAT_RATE * 100), amount: vat.toFixed(2) })}
                  </span>
                </div>
              </div>
              <MotionButton
                onClick={handleBook}
                disabled={submitting || !canSubmit}
                className="h-[52px] px-[22px] rounded-2xl border-none bg-gradient-to-b from-primary-500 to-primary-600 text-white font-bold text-[15px] flex items-center gap-2 disabled:opacity-50 shadow-[0_4px_14px_rgba(38,181,95,0.4)] dark:shadow-[0_4px_14px_rgba(38,181,95,0.15)]"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {submitting ? t('consumer.home.booking') : t('consumer.home.bookNow')}
                {!submitting && <ChevronRight className="h-[18px] w-[18px]" strokeWidth={2.5} />}
              </MotionButton>
            </div>
          </GlassCard>

        </div>
      </div>

      <LocationSheet
        open={sheetOpen}
        initialPosition={effectivePin}
        onConfirm={result => { setPin(result); setSheetOpen(false) }}
        onClose={() => setSheetOpen(false)}
      />

      <VehiclePickerSheet
        open={pickerSheetOpen}
        vehicles={savedVehicles}
        selectedId={vehicleId}
        onSelectVehicle={handleSelectSavedVehicle}
        onEnterNew={handleEnterNewPlate}
        onClose={() => setPickerSheetOpen(false)}
      />

      <SaveVehicleDialog
        open={!!saveDialogData}
        plateData={saveDialogData}
        consumerId={user.id}
        onSaved={handleDialogSaved}
        onDismiss={navigateToOrder}
      />
    </PageShell>
  )
}
