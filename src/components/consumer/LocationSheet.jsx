import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useHistoryDismissible } from '../../hooks/useHistoryDismissible.js'
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js'
import { forwardGeocode } from '../../lib/geocode.js'

const MapPicker = lazy(() => import('../MapPicker.jsx'))

const SPRING                 = { type: 'spring', stiffness: 300, damping: 30 }
const NOMINATIM_REVERSE      = 'https://nominatim.openstreetmap.org/reverse'
const NUMBER_FIRST_COUNTRIES = ['us', 'gb', 'ca', 'au', 'nz', 'ie']

// Locale-aware address label builder — mirrors geocode.js buildShortAddress.
function buildLabel(street, number, city, countryCode) {
  const s = street.trim()
  const n = number.trim()
  const c = city.trim()
  const numberFirst = NUMBER_FIRST_COUNTRIES.includes(countryCode)

  let streetPart
  if (s && n) {
    streetPart = numberFirst ? `${n} ${s}` : `${s} ${n}`
  } else if (s) {
    streetPart = s
  } else {
    streetPart = null
  }

  if (streetPart && c) return `${streetPart}, ${c}`
  if (streetPart) return streetPart
  if (c) return c
  return null
}

export default function LocationSheet({ open, initialPosition, onConfirm, onClose }) {
  const { t, i18n } = useTranslation()
  const [draft, setDraft] = useState(initialPosition)

  // Address field values
  const [street, setStreet] = useState('')
  const [number, setNumber] = useState('')
  const [city,   setCity]   = useState('')

  // Per-field touch flags — once true, reverse-geocode pre-fill leaves that field alone
  const streetEditedRef = useRef(false)
  const numberEditedRef = useRef(false)
  const cityEditedRef   = useRef(false)

  // Country code from the most recent reverse geocode — used to bias forward geocoding
  const [countryCode,    setCountryCode]    = useState(null)
  const countryCodeRef                      = useRef(null)

  // Read-only "from map" preview line
  const [geocodePreview, setGeocodePreview] = useState(null)

  // Forward geocode status
  const [forwardSearching,  setForwardSearching]  = useState(false)
  const [notFoundVisible,   setNotFoundVisible]    = useState(false)
  const notFoundTimerRef = useRef(null)

  // Prevents reverse-geocode from overwriting fields immediately after a
  // forward-geocode-triggered pin move (breaks the type→pin→reverse loop)
  const suppressNextFieldsUpdateRef = useRef(false)

  // Reset all state when the sheet opens so each session starts fresh
  useEffect(() => {
    if (!open) return
    setDraft(initialPosition)
    setStreet('')
    setNumber('')
    setCity('')
    streetEditedRef.current           = false
    numberEditedRef.current           = false
    cityEditedRef.current             = false
    countryCodeRef.current            = null
    suppressNextFieldsUpdateRef.current = false
    setCountryCode(null)
    setGeocodePreview(null)
    setForwardSearching(false)
    setNotFoundVisible(false)
    clearTimeout(notFoundTimerRef.current)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup notFound timer on unmount
  useEffect(() => () => clearTimeout(notFoundTimerRef.current), [])

  const { dismiss } = useHistoryDismissible(open, onClose, 'location-sheet')

  // Wraps setDraft so that a deliberate drag clears the suppression flag —
  // a drag is always a user intent and should re-enable field pre-fill.
  function handleDraftChange(newPos) {
    suppressNextFieldsUpdateRef.current = false
    setDraft(newPos)
  }

  // ── Reverse geocode: fires 500ms after pin settles ──────────────────────────
  const debouncedDraft = useDebouncedValue(draft, 500)

  useEffect(() => {
    if (!debouncedDraft) return
    const ctrl = new AbortController()
    const lang = i18n.language ?? 'en'
    fetch(
      `${NOMINATIM_REVERSE}?format=jsonv2&lat=${debouncedDraft.lat}&lon=${debouncedDraft.lng}&accept-language=${lang},en`,
      { signal: ctrl.signal },
    )
      .then(r => (r.ok ? r.json() : null))
      .catch(() => null)
      .then(data => {
        if (!data || ctrl.signal.aborted) return
        const a  = data.address ?? {}
        const cc = a.country_code ?? null
        countryCodeRef.current = cc
        setCountryCode(cc)

        const gStreet = a.road ?? a.pedestrian ?? a.footway ?? a.path ?? a.cycleway ?? ''
        const gNumber = a.house_number ?? ''
        const gCity   = a.city ?? a.town ?? a.village ?? a.suburb ?? a.neighbourhood ?? ''

        // Always update the read-only preview
        const numberFirst = NUMBER_FIRST_COUNTRIES.includes(cc)
        let streetPart
        if (gStreet && gNumber) {
          streetPart = numberFirst ? `${gNumber} ${gStreet}` : `${gStreet} ${gNumber}`
        } else {
          streetPart = gStreet || null
        }
        const preview = streetPart && gCity ? `${streetPart}, ${gCity}`
          : streetPart ?? gCity ?? data.display_name ?? null
        setGeocodePreview(preview)

        // Skip field pre-fill if this reverse-geocode was triggered by a forward-geocode pin move
        if (suppressNextFieldsUpdateRef.current) {
          suppressNextFieldsUpdateRef.current = false
          return
        }

        if (!streetEditedRef.current) setStreet(gStreet)
        if (!numberEditedRef.current) setNumber(gNumber)
        if (!cityEditedRef.current)   setCity(gCity)
      })
    return () => ctrl.abort()
  }, [debouncedDraft, i18n.language])

  // ── Forward geocode: fires 800ms after typing stops ─────────────────────────
  // Only attempts when both street (≥2 chars) and city (≥2 chars) are present.
  const fullQuery   = [street.trim(), number.trim(), city.trim()].filter(Boolean).join(' ')
  const isRichEnough = street.trim().length >= 2 && city.trim().length >= 2
  const searchQuery  = isRichEnough ? fullQuery : ''
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 800)

  useEffect(() => {
    if (!debouncedSearchQuery) {
      setForwardSearching(false)
      setNotFoundVisible(false)
      return
    }

    let cancelled = false
    setForwardSearching(true)
    setNotFoundVisible(false)
    clearTimeout(notFoundTimerRef.current)

    forwardGeocode(debouncedSearchQuery, countryCodeRef.current ?? 'il').then(result => {
      if (cancelled) return
      setForwardSearching(false)
      if (result) {
        suppressNextFieldsUpdateRef.current = true
        setDraft({ lat: result.lat, lng: result.lng })
      } else {
        setNotFoundVisible(true)
        notFoundTimerRef.current = setTimeout(() => {
          if (!cancelled) setNotFoundVisible(false)
        }, 3000)
      }
    })

    return () => {
      cancelled = true
      setForwardSearching(false)
    }
  }, [debouncedSearchQuery])

  function handleConfirm() {
    const label = buildLabel(street, number, city, countryCode)
      ?? geocodePreview
      ?? (draft ? `${draft.lat.toFixed(4)}, ${draft.lng.toFixed(4)}` : null)

    dismiss()
    onConfirm({
      lat:            draft?.lat,
      lng:            draft?.lng,
      address_label:  label,
      address_street: street.trim() || null,
      address_number: number.trim() || null,
      address_city:   city.trim()   || null,
    })
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={dismiss}
          />

          {/* Sheet */}
          <motion.div
            className="fixed inset-x-0 bottom-0 z-[60] flex flex-col bg-surface-elevated rounded-t-3xl overflow-hidden"
            style={{ height: '90dvh' }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={SPRING}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100 dark:border-edge shrink-0">
              <h2 className="font-semibold text-neutral-900 dark:text-ink">{t('location.chooseLocation')}</h2>
              <button
                onClick={dismiss}
                className="rounded-full p-2 text-neutral-500 dark:text-ink-subtle hover:bg-neutral-100 dark:hover:bg-surface-elevated transition-colors"
                style={{ minHeight: 44, minWidth: 44 }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Map — 48vh leaves room for the address fields below */}
            <div className="shrink-0" style={{ height: '48vh' }}>
              <Suspense fallback={<div className="h-full bg-neutral-100 dark:bg-surface-elevated animate-pulse" />}>
                <MapPicker position={draft} onChange={handleDraftChange} height="100%" />
              </Suspense>
            </div>

            {/* Address fields */}
            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
              {/* Read-only geocode preview */}
              {geocodePreview && (
                <p className="text-xs text-neutral-400 dark:text-ink-subtle truncate">
                  {t('consumer.locationSheet.fromMap', { address: geocodePreview })}
                </p>
              )}

              {/* Street + House number on one row */}
              <div className="flex gap-2">
                <div className="flex flex-col gap-1 flex-[7]">
                  <label className="text-xs font-medium text-neutral-500 dark:text-ink-subtle">
                    {t('consumer.locationSheet.fields.street')}
                  </label>
                  <input
                    type="text"
                    dir="auto"
                    value={street}
                    onChange={e => { setStreet(e.target.value); streetEditedRef.current = true }}
                    placeholder={t('consumer.locationSheet.fields.streetPlaceholder')}
                    className="input text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1 flex-[3]">
                  <label className="text-xs font-medium text-neutral-500 dark:text-ink-subtle">
                    {t('consumer.locationSheet.fields.number')}
                  </label>
                  <input
                    type="text"
                    dir="auto"
                    value={number}
                    onChange={e => { setNumber(e.target.value); numberEditedRef.current = true }}
                    placeholder={t('consumer.locationSheet.fields.numberPlaceholder')}
                    className="input text-sm"
                  />
                </div>
              </div>

              {/* City on its own row */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-neutral-500">
                  {t('consumer.locationSheet.fields.city')}
                </label>
                <input
                  type="text"
                  dir="auto"
                  value={city}
                  onChange={e => { setCity(e.target.value); cityEditedRef.current = true }}
                  placeholder={t('consumer.locationSheet.fields.cityPlaceholder')}
                  className="input text-sm"
                />
              </div>

              {/* Forward geocode status */}
              {forwardSearching && (
                <div className="flex items-center gap-1.5 text-xs text-neutral-400 dark:text-ink-subtle">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {t('consumer.locationSheet.searching')}
                </div>
              )}
              {notFoundVisible && (
                <p className="text-xs text-danger-500">
                  {t('consumer.locationSheet.notFound')}
                </p>
              )}
            </div>

            {/* Confirm */}
            <div className="px-4 py-4 shrink-0 border-t border-neutral-100 dark:border-edge safe-bottom">
              <button
                onClick={handleConfirm}
                disabled={!draft}
                className="btn-primary w-full"
              >
                <Check className="h-4 w-4" />
                {t('location.confirmLocation')}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
