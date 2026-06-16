import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase.js'
import { useToast } from '../ui/Toast.jsx'
import { formatPlate } from '../../lib/formatPlate.js'

const MODAL_SPRING = { type: 'spring', stiffness: 350, damping: 30 }

// Shown post-booking when the consumer booked with a free-text plate.
// onSaved(vehicle) — called after INSERT succeeds; caller navigates away.
// onDismiss()      — called when skipped; caller navigates away.
export default function SaveVehicleDialog({ open, plateData, consumerId, onSaved, onDismiss }) {
  const { t } = useTranslation()
  const showToast = useToast()
  const [nickname, setNickname] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open && plateData?.plate) setNickname(formatPlate(plateData.plate))
    if (!open) { setNickname(''); setSaving(false) }
  }, [open, plateData?.plate])

  async function handleSave() {
    if (!nickname.trim()) return
    setSaving(true)
    const { data, error } = await supabase
      .from('vehicles')
      .insert({
        consumer_id: consumerId,
        plate:       plateData.plate,
        nickname:    nickname.trim(),
        make:        plateData.make,
        model:       plateData.model,
        year:        plateData.year,
        color:       plateData.color,
        category:    plateData.category,
      })
      .select('*')
      .single()
    setSaving(false)
    if (error) { showToast(t('common.error'), 'error'); return }
    onSaved(data)
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onDismiss}
          />

          <div className="fixed inset-0 z-[51] flex items-end sm:items-center justify-center pointer-events-none px-6 pb-8 sm:pb-0">
            <motion.div
              role="dialog"
              aria-modal="true"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={MODAL_SPRING}
              className="pointer-events-auto w-full max-w-sm bg-surface-elevated border border-edge rounded-3xl p-6 flex flex-col gap-5 shadow-2xl"
            >
              <div className="flex flex-col gap-4">
                <p className="text-base font-bold text-ink">{t('consumer.home.saveVehicle.title')}</p>
                <div className="flex flex-col gap-1.5">
                  <label className="label">{t('consumer.home.saveVehicle.nicknameLabel')}</label>
                  <input
                    className="input"
                    value={nickname}
                    onChange={e => setNickname(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && nickname.trim()) handleSave() }}
                    placeholder={t('consumer.home.saveVehicle.nicknamePlaceholder')}
                    maxLength={40}
                    autoFocus
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={onDismiss} className="btn-ghost flex-1">
                  {t('consumer.home.saveVehicle.skip')}
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !nickname.trim()}
                  className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t('consumer.home.saveVehicle.save')}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
