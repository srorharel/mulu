import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useHistoryDismissible } from '../../hooks/useHistoryDismissible.js'
import { formatPlate } from '../../lib/formatPlate.js'
import IsraeliPlate from '../ui/IsraeliPlate.jsx'
import MotionButton from '../ui/MotionButton.jsx'

const SPRING = { type: 'spring', stiffness: 300, damping: 30 }

export default function VehiclePickerSheet({ open, vehicles, selectedId, onSelectVehicle, onEnterNew, onClose }) {
  const { t } = useTranslation()
  const { dismiss } = useHistoryDismissible(open, onClose, 'vehicle-picker-sheet')

  function handleSelect(v) {
    onSelectVehicle(v)
    dismiss()
  }

  function handleEnterNew() {
    onEnterNew()
    dismiss()
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
            style={{ maxHeight: '80dvh' }}
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
              <h2 className="text-base font-bold text-ink">{t('consumer.home.pickVehicle.title')}</h2>
              <button
                onClick={dismiss}
                className="rounded-full p-2 text-ink-muted hover:bg-neutral-100 dark:hover:bg-surface-elevated transition-colors"
                style={{ minHeight: 44, minWidth: 44 }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {vehicles.map(v => (
                <MotionButton
                  key={v.id}
                  type="button"
                  onClick={() => handleSelect(v)}
                  className="w-full flex items-center gap-3 px-5 py-3.5 text-start hover:bg-neutral-50 dark:hover:bg-surface-elevated transition-colors border-b border-neutral-100/60 dark:border-edge"
                >
                  <div dir="ltr" className="shrink-0">
                    <IsraeliPlate number={formatPlate(v.plate)} />
                  </div>
                  <div className="flex-1 min-w-0" dir="auto">
                    <p className="text-[14px] font-semibold text-ink truncate">{v.nickname}</p>
                    {(v.make || v.model) && (
                      <p className="text-[12px] text-ink-muted truncate">
                        {[v.make, v.model, v.year].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                  {v.is_default && (
                    <span className="shrink-0 px-2 py-0.5 rounded-md bg-primary-50 dark:bg-accent-muted border border-primary-200 text-[10px] font-semibold text-primary-700 uppercase tracking-wide">
                      {t('consumer.vehicles.defaultBadge')}
                    </span>
                  )}
                  {selectedId === v.id && (
                    <div className="w-[22px] h-[22px] rounded-full bg-primary-500 flex items-center justify-center shrink-0 ms-1">
                      <Check className="h-[12px] w-[12px] text-white" strokeWidth={3} />
                    </div>
                  )}
                </MotionButton>
              ))}

              {vehicles.length > 0 && <div className="h-px bg-neutral-200 dark:bg-surface-elevated mx-5 my-1" />}

              {/* Enter new plate */}
              <MotionButton
                type="button"
                onClick={handleEnterNew}
                className="w-full flex items-center gap-3 px-5 py-4 text-start hover:bg-neutral-50 dark:hover:bg-surface-elevated transition-colors"
              >
                <div className="w-[38px] h-[38px] rounded-[12px] bg-neutral-100 dark:bg-surface-elevated flex items-center justify-center shrink-0">
                  <Plus className="h-5 w-5 text-ink-muted" />
                </div>
                <p className="text-[14px] font-semibold text-ink">{t('consumer.home.pickVehicle.enterNew')}</p>
              </MotionButton>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
