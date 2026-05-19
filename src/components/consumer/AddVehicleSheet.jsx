import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase.js'
import { useToast } from '../ui/Toast.jsx'
import { useHistoryDismissible } from '../../hooks/useHistoryDismissible.js'
import { formatPlate } from '../../lib/formatPlate.js'
import MotionButton from '../ui/MotionButton.jsx'
import LicensePlatePicker from './LicensePlatePicker.jsx'

const SPRING = { type: 'spring', stiffness: 300, damping: 30 }

const EMPTY_VEHICLE = { make: null, model: null, year: null, plate: null, color: null, category: null, isValid: false }

export default function AddVehicleSheet({ open, onClose, onAdded, consumerId }) {
  const { t } = useTranslation()
  const showToast = useToast()

  const [vehicleData, setVehicleData] = useState(EMPTY_VEHICLE)
  const [nickname, setNickname] = useState('')
  const [saving, setSaving] = useState(false)

  const { dismiss } = useHistoryDismissible(open, onClose, 'add-vehicle-sheet')

  // Auto-fill nickname from the confirmed plate; clear it if the plate is un-confirmed.
  useEffect(() => {
    if (vehicleData.isValid && vehicleData.plate && nickname === '') {
      setNickname(formatPlate(vehicleData.plate))
    }
    if (!vehicleData.isValid) {
      setNickname('')
    }
  }, [vehicleData.isValid, vehicleData.plate]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reset all state when the sheet closes.
  useEffect(() => {
    if (!open) {
      setVehicleData(EMPTY_VEHICLE)
      setNickname('')
    }
  }, [open])

  async function handleSave() {
    if (!vehicleData.isValid || !nickname.trim()) return
    setSaving(true)
    const { data, error } = await supabase
      .from('vehicles')
      .insert({
        consumer_id: consumerId,
        plate:       vehicleData.plate,
        nickname:    nickname.trim(),
        make:        vehicleData.make,
        model:       vehicleData.model,
        year:        vehicleData.year,
        color:       vehicleData.color,
        category:    vehicleData.category,
      })
      .select('*')
      .single()
    setSaving(false)
    if (error) { showToast(t('common.error'), 'error'); return }
    onAdded(data)
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={dismiss}
          />

          <motion.div
            className="fixed inset-x-0 bottom-0 z-[60] flex flex-col bg-surface-elevated rounded-t-[28px] overflow-hidden"
            style={{ maxHeight: '92dvh' }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={SPRING}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-9 h-1 bg-neutral-400/40 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-100 dark:border-edge shrink-0">
              <h2 className="text-base font-bold text-ink">{t('consumer.vehicles.add.title')}</h2>
              <button
                onClick={dismiss}
                className="rounded-full p-2 text-ink-muted hover:bg-neutral-100 dark:hover:bg-surface-elevated transition-colors"
                style={{ minHeight: 44, minWidth: 44 }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-5 pt-4 pb-3 flex flex-col gap-4">
              <LicensePlatePicker onChange={setVehicleData} />

              {vehicleData.isValid && (
                <div className="flex flex-col gap-1.5">
                  <label className="label">{t('consumer.vehicles.add.nicknameLabel')}</label>
                  <input
                    className="input"
                    value={nickname}
                    onChange={e => setNickname(e.target.value)}
                    placeholder={t('consumer.vehicles.add.nicknamePlaceholder')}
                    maxLength={40}
                    autoFocus
                  />
                  <p className="text-xs text-ink-muted">{t('consumer.vehicles.add.nicknameHint')}</p>
                </div>
              )}
            </div>

            {/* Footer CTA — only shown once the plate is confirmed */}
            {vehicleData.isValid && (
              <div className="px-5 py-4 border-t border-neutral-100 dark:border-edge shrink-0 safe-bottom">
                <MotionButton
                  onClick={handleSave}
                  disabled={saving || !nickname.trim()}
                  className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t('consumer.vehicles.add.save')}
                </MotionButton>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
