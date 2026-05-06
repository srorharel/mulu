import { useState, useEffect, lazy, Suspense } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const MapPicker = lazy(() => import('../MapPicker.jsx'))

const SPRING = { type: 'spring', stiffness: 300, damping: 30 }

export default function LocationSheet({ open, initialPosition, onConfirm, onClose }) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState(initialPosition)

  useEffect(() => {
    if (open) setDraft(initialPosition)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

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
            onClick={onClose}
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
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-100 shrink-0">
              <h2 className="font-semibold text-neutral-900">{t('location.chooseLocation')}</h2>
              <button
                onClick={onClose}
                className="rounded-full p-2 text-neutral-500 hover:bg-neutral-100 transition-colors"
                style={{ minHeight: 44, minWidth: 44 }}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Map */}
            <div className="flex-1 min-h-0">
              <Suspense fallback={<div className="h-full bg-neutral-100 animate-pulse" />}>
                <MapPicker position={draft} onChange={setDraft} height="100%" />
              </Suspense>
            </div>

            {/* Confirm */}
            <div className="px-4 py-4 shrink-0 border-t border-neutral-100 safe-bottom">
              <button
                onClick={() => onConfirm(draft)}
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
