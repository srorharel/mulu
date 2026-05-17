import { useState, useEffect, useRef } from 'react'
import { Loader2, CheckCircle, AlertTriangle, AlertCircle, RefreshCw, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useDebouncedValue } from '../../hooks/useDebouncedValue.js'
import { lookupPlate, clearPlateFailure } from '../../lib/vehicleLookup.js'
import { formatPlate } from '../../lib/formatPlate.js'
import IsraeliPlate from '../ui/IsraeliPlate.jsx'

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: CURRENT_YEAR - 1990 + 1 }, (_, i) => CURRENT_YEAR - i)

// onChange({ make, model, year, plate, color, category, isValid })
export default function LicensePlatePicker({ onChange }) {
  const { t } = useTranslation()

  const [plateInput, setPlateInput] = useState('')
  // idle | looking_up | found | confirmed | not_found | error
  const [status, setStatus] = useState('idle')
  const [result, setResult] = useState(null)

  // Manual fallback — values survive state transitions so users don't re-type
  const [manualMake,     setManualMake]     = useState('')
  const [manualModel,    setManualModel]    = useState('')
  const [manualYear,     setManualYear]     = useState('')
  const [manualCategory, setManualCategory] = useState('private')

  const lookupIdRef = useRef(0)
  const normalized  = plateInput.replace(/\D/g, '')
  const debounced   = useDebouncedValue(normalized, 800)

  // Auto-lookup: fires whenever the debounced normalized plate changes
  useEffect(() => {
    if (debounced.length < 7) {
      // Drop back to idle for all non-confirmed states when plate is too short
      setStatus(s => s !== 'confirmed' ? 'idle' : s)
      if (debounced.length === 0) setResult(null)
      return
    }
    // Fires from any non-confirmed state — this is what enables auto-retry
    // when user edits the plate while in not_found or error.
    runLookup(debounced)
  }, [debounced]) // eslint-disable-line react-hooks/exhaustive-deps

  async function runLookup(plate) {
    const id = ++lookupIdRef.current
    setStatus('looking_up')
    const res = await lookupPlate(plate)
    if (id !== lookupIdRef.current) return // superseded by a newer lookup
    setResult(res)
    if      (res.status === 'found')     setStatus('found')
    else if (res.status === 'not_found') setStatus('not_found')
    else                                 setStatus('error')
  }

  async function retry() {
    clearPlateFailure(normalized) // bypass the 60s failure cooldown
    const id = ++lookupIdRef.current
    setStatus('looking_up')
    const res = await lookupPlate(normalized)
    if (id !== lookupIdRef.current) return
    setResult(res)
    if      (res.status === 'found')     setStatus('found')
    else if (res.status === 'not_found') setStatus('not_found')
    else                                 setStatus('error')
  }

  function confirmResult() { setStatus('confirmed') }

  function goManual() {
    setResult(null)
    setStatus('not_found')
  }

  function editPlate() {
    // Clear everything and return to blank idle state
    setPlateInput('')
    setResult(null)
    setStatus('idle')
    setManualMake('')
    setManualModel('')
    setManualYear('')
    setManualCategory('private')
    ++lookupIdRef.current // discard any in-flight lookup
  }

  // Emit validity upward whenever relevant state changes
  useEffect(() => {
    if (status === 'confirmed' && result) {
      onChange({ make: result.make, model: result.model, year: result.year, plate: result.plate, color: result.color, category: result.category, isValid: true })
    } else if (status === 'not_found') {
      const valid = manualMake.trim() && manualModel.trim() && !!manualYear
      onChange({ make: manualMake.trim() || null, model: manualModel.trim() || null, year: manualYear ? parseInt(manualYear, 10) : null, plate: normalized || null, color: null, category: manualCategory, isValid: !!valid })
    } else {
      onChange({ make: null, model: null, year: null, plate: null, color: null, category: null, isValid: false })
    }
  }, [status, result, manualMake, manualModel, manualYear, manualCategory]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived display values ───────────────────────────────────────────────────

  // Border tint per state (Tailwind utilities override the .input base border)
  const borderTint = {
    found:     'border-primary-400',
    not_found: 'border-warning-400',
    error:     'border-danger-400',
  }[status] ?? ''

  // Trailing icon slot — null means empty (no icon rendered)
  function TrailingIcon() {
    if (status === 'looking_up') return <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
    if (status === 'found')      return <CheckCircle className="h-4 w-4 text-primary-500" />
    if (status === 'not_found')  return <AlertTriangle className="h-4 w-4 text-warning-500" />
    if (status === 'error')      return <AlertCircle className="h-4 w-4 text-danger-500" />
    return null
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  //
  // ARCHITECTURE: one single return so the plate <input> is always the same DOM
  // node while status ∈ {idle, looking_up, found, not_found, error}.
  // Confirmed swaps it out for a summary line — that's the only unmount.

  return (
    <div className="flex flex-col gap-3">

      {status === 'confirmed' && result ? (
        /* ── Confirmed summary — IsraeliPlate + car details + checkmark ──
           dir="ltr" on row: plate stays physically left in RTL layouts.
           dir="auto" on text: Hebrew content (colors, car types) flows correctly. */
        <div className="flex items-center gap-3" dir="ltr">
          <IsraeliPlate number={formatPlate(result.plate)} />
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-bold text-ink leading-snug truncate" dir="auto">
              {[result.make, result.model, result.year].filter(Boolean).join(' · ')}
            </p>
            <p className="text-[12px] text-ink-muted flex items-center gap-1.5" dir="auto">
              {[result.color, result.category ? t(`carLabels.${result.category}`) : null].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" onClick={editPlate} className="text-[11px] font-semibold text-primary-700 hover:underline">
              {t('consumer.home.plate.editPlate')}
            </button>
            <div className="w-[26px] h-[26px] rounded-full bg-primary-500 flex items-center justify-center shadow-[0_1px_3px_rgba(38,181,95,0.4)]">
              <Check className="h-[14px] w-[14px] text-white" strokeWidth={3} />
            </div>
          </div>
        </div>
      ) : (
        /* ── Plate input — PERSISTENT across idle/looking_up/found/not_found/error ── */
        <div className="flex flex-col gap-1.5">
          <label className="label" htmlFor="plate-input">{t('consumer.home.fields.plate')}</label>
          <div className="relative">
            <input
              id="plate-input"
              type="text"
              inputMode="numeric"
              className={`input font-mono tracking-widest pr-10 ${borderTint}`}
              value={plateInput}
              onChange={e => setPlateInput(e.target.value)}
              placeholder={t('consumer.home.fields.platePlaceholder')}
              disabled={status === 'looking_up'}
              maxLength={11}
              autoComplete="off"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <TrailingIcon />
            </span>
          </div>
          {status === 'looking_up' && (
            <p className="text-xs text-neutral-500">{t('consumer.home.plate.lookingUp')}</p>
          )}
        </div>
      )}

      {/* ── Found: confirmation card below the (editable) input ─────────────── */}
      {status === 'found' && result && (
        <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white/90 p-4 shadow-sm">
          <div className="flex flex-col gap-0.5">
            <p className="text-xs text-neutral-400 uppercase tracking-wide font-medium">
              {formatPlate(result.plate)}
            </p>
            <p className="text-lg font-bold text-neutral-900 leading-tight">
              {[result.make, result.model].filter(Boolean).join(' ') || '—'}
            </p>
            {(result.year || result.color) && (
              <p className="text-sm text-neutral-500">
                {[result.year, result.color].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <p className="text-sm font-semibold text-neutral-700">{t('consumer.home.plate.isThisYourCar')}</p>
          <div className="flex gap-2">
            <button type="button" onClick={confirmResult} className="btn-primary flex-1 text-sm">
              {t('consumer.home.plate.yesItsMine')}
            </button>
            <button type="button" onClick={goManual} className="btn-outline flex-1 text-sm">
              {t('consumer.home.plate.noEnterManually')}
            </button>
          </div>
        </div>
      )}

      {/* ── Not found: warning + manual fallback inputs ──────────────────────── */}
      {status === 'not_found' && (
        <>
          <div className="rounded-xl border border-warning-200 bg-warning-50 p-3">
            <p className="text-sm text-warning-800">{t('consumer.home.plate.notFound')}</p>
          </div>
          <div>
            <label className="label">{t('consumer.home.plate.makeLabel')}</label>
            <input
              type="text"
              className="input"
              value={manualMake}
              onChange={e => setManualMake(e.target.value)}
              placeholder="e.g. Toyota"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="label">{t('consumer.home.plate.modelLabel')}</label>
            <input
              type="text"
              className="input"
              value={manualModel}
              onChange={e => setManualModel(e.target.value)}
              placeholder="e.g. Corolla"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="label" htmlFor="manual-year">{t('consumer.home.fields.carYear')}</label>
            <select
              id="manual-year"
              className="input"
              value={manualYear}
              onChange={e => setManualYear(e.target.value)}
            >
              <option value="">— {t('consumer.home.fields.carYear')} —</option>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          <div>
            <label className="label">{t('consumer.home.carType')}</label>
            <div className="flex gap-2 mt-1">
              {['private', 'jeep', 'pickup'].map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setManualCategory(cat)}
                  className={`flex-1 rounded-xl border py-2 text-sm font-medium transition-colors ${
                    manualCategory === cat
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-neutral-200 bg-white/70 text-neutral-700'
                  }`}
                >
                  {t(`carLabels.${cat}`)}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Error: error banner + retry / enter-manually ────────────────────── */}
      {status === 'error' && (
        <div className="flex flex-col gap-2">
          <div className="rounded-xl border border-danger-200 bg-danger-50 p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-danger-500 shrink-0 mt-0.5" />
            <p className="text-sm text-danger-700">{t('consumer.home.plate.lookupError')}</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={retry} className="btn-outline flex-1 text-sm">
              <RefreshCw className="h-3.5 w-3.5" />
              {t('consumer.home.plate.retry')}
            </button>
            <button type="button" onClick={goManual} className="btn-ghost flex-1 text-sm">
              {t('consumer.home.plate.enterManually')}
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
