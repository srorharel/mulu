import { useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useHistoryDismissible } from '../../hooks/useHistoryDismissible.js'

const MODAL_SPRING = { type: 'spring', stiffness: 350, damping: 30 }

export default function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
}) {
  const pendingConfirmRef = useRef(false)

  // Route both close paths (back-gesture and user-initiated) through one callback
  // so that the back-gesture history entry is always cleaned up before the
  // caller's open state changes.
  const handleClose = useCallback(() => {
    if (pendingConfirmRef.current) {
      pendingConfirmRef.current = false
      onConfirm()
    } else {
      onCancel()
    }
  }, [onConfirm, onCancel])

  const { dismiss } = useHistoryDismissible(open, handleClose, 'confirm-dialog')

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') dismiss() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, dismiss])

  function handleConfirm() {
    pendingConfirmRef.current = true
    dismiss()
  }

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="confirm-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={dismiss}
          />

          <div className="fixed inset-0 z-[51] flex items-center justify-center pointer-events-none px-6">
            <motion.div
              key="confirm-dialog"
              role="dialog"
              aria-modal="true"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={MODAL_SPRING}
              className="pointer-events-auto w-full max-w-sm bg-glass border border-glass-border backdrop-blur-xl rounded-3xl p-6 flex flex-col gap-5 shadow-2xl"
            >
              <div className="flex flex-col gap-2">
                <p className="text-base font-bold text-ink">{title}</p>
                <p className="text-sm text-ink-muted leading-snug">{message}</p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={dismiss}
                  className="btn-ghost flex-1"
                >
                  {cancelLabel}
                </button>
                <button
                  onClick={handleConfirm}
                  className={`flex-1 ${destructive ? 'btn-ghost text-danger-500' : 'btn-primary'}`}
                >
                  {confirmLabel}
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
