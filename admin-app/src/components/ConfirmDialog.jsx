import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

// Reusable confirm dialog for destructive admin actions (per-row reset, etc).
// Renders a backdrop + light card. Escape and backdrop-click cancel.
//
// Usage:
//   <ConfirmDialog
//     open={...}
//     title="Reset to default?"
//     message="..."
//     confirmLabel="Reset"
//     onConfirm={...}
//     onCancel={...}
//     destructive
//   />

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  destructive = false,
  busy = false,
}) {
  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape' && !busy) onCancel?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, busy, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4"
      onClick={() => !busy && onCancel?.()}
    >
      <div
        className="card flex flex-col gap-4 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start gap-3">
          <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${destructive ? 'bg-danger/10 text-danger' : 'bg-admin-soft text-admin-deep'}`}>
            <AlertTriangle size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-bold text-ink mb-1">{title}</h3>
            {message && <p className="text-[13px] text-ink-muted leading-relaxed">{message}</p>}
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} disabled={busy} className="btn-ghost">
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={destructive
              ? 'btn border border-danger/50 text-white bg-danger hover:bg-danger-600'
              : 'btn-primary'}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
