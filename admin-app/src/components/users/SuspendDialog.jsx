import { useState } from 'react'
import { X, Ban, AlertCircle } from 'lucide-react'
import { adminSuspend } from '../../lib/adminUsers.js'

export default function SuspendDialog({ userId, onClose, onDone }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState(null)

  async function doSuspend() {
    setBusy(true); setError(null)
    try { await adminSuspend(userId, reason); onDone?.() }
    catch (e) { setError(e.message) }
    finally    { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl border border-edge shadow-2xl w-full max-w-md p-5 flex flex-col gap-3" onClick={e => e.stopPropagation()}>
        <header className="flex items-center gap-2">
          <Ban size={16} className="text-danger" />
          <h3 className="font-bold text-ink flex-1">Suspend account</h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink p-1"><X size={14} /></button>
        </header>
        <p className="text-[12.5px] text-ink-muted">
          The user is signed out on next profile fetch and shown
          “Account suspended. Contact support.” Reason is recorded in the audit log.
        </p>
        <textarea rows={3} className="input" placeholder="Reason (≥3 chars)" value={reason} onChange={e => setReason(e.target.value)} />
        {error && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-xl border border-danger/30 bg-danger/10 text-danger text-xs">
            <AlertCircle size={14} className="shrink-0 mt-0.5" /><span className="font-mono">{error}</span>
          </div>
        )}
        <div className="flex gap-2 justify-end">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="btn border border-danger/50 text-danger hover:bg-danger/10"
            onClick={doSuspend}
            disabled={busy || reason.trim().length < 3}
          >
            {busy ? 'Suspending…' : 'Suspend'}
          </button>
        </div>
      </div>
    </div>
  )
}
