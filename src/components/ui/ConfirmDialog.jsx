import { useCallback, useEffect, useRef } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import Modal, { modalBtn } from './Modal.jsx'
import { useHistoryDismissible } from '../../hooks/useHistoryDismissible.js'

// Confirm/alert dialog built on the shared Modal scaffold (light + dark).
// A tone-tinted icon chip anchors the dialog; the confirm + cancel are real
// stacked buttons (confirm on top, emphasised in tone; cancel below, neutral).
//
// Back-compat: title / message / confirmLabel / cancelLabel / onConfirm /
// onCancel / destructive are unchanged. New optional props:
//   tone    'default' | 'danger' | 'warning'  (defaults to danger when destructive)
//   icon    a Lucide icon component for the chip (defaults to AlertTriangle for danger)
//   loading shows a spinner on confirm + blocks the action
export default function ConfirmDialog({
  open,
  onConfirm,
  onCancel,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  tone,
  icon,
  loading = false,
}) {
  const resolvedTone = tone ?? (destructive ? 'danger' : 'default')
  const Icon = icon ?? (resolvedTone === 'default' ? undefined : AlertTriangle)
  const confirmCls = resolvedTone === 'danger' ? modalBtn.danger : modalBtn.primary

  const pendingConfirmRef = useRef(false)

  // Route both close paths (back-gesture and user-initiated) through one callback
  // so the back-gesture history entry is always cleaned up before the caller's
  // open state changes.
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
    if (loading) return
    pendingConfirmRef.current = true
    dismiss()
  }

  return (
    <Modal
      open={open}
      onClose={dismiss}
      icon={Icon}
      tone={resolvedTone}
      title={title}
      subtitle={message}
    >
      <div className="flex flex-col gap-2.5">
        <button onClick={handleConfirm} disabled={loading} className={confirmCls}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {confirmLabel}
        </button>
        <button onClick={dismiss} className={modalBtn.neutral}>
          {cancelLabel}
        </button>
      </div>
    </Modal>
  )
}
