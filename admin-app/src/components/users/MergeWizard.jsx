import { useEffect, useState } from 'react'
import { X, GitMerge, Search, AlertCircle, AlertTriangle } from 'lucide-react'
import { searchUsers, adminMergeUsers, fetchUserDetail, roleColor } from '../../lib/adminUsers.js'

// 3-step merge: pick "merge from" user → write reason → confirm → call RPC.
// keepUserId is the user we keep (the one whose detail panel is currently open).

export default function MergeWizard({ keepUserId, onClose, onDone }) {
  const [keep, setKeep]       = useState(null)
  const [query, setQuery]     = useState('')
  const [matches, setMatches] = useState([])
  const [merge, setMerge]     = useState(null)
  const [reason, setReason]   = useState('')
  const [step, setStep]       = useState(1)
  const [busy, setBusy]       = useState(false)
  const [error, setError]     = useState(null)

  useEffect(() => { fetchUserDetail(keepUserId).then(setKeep).catch(e => setError(e.message)) }, [keepUserId])

  useEffect(() => {
    if (!query) { setMatches([]); return }
    let cancel = false
    searchUsers(query, 20)
      .then(r => { if (!cancel) setMatches(r.filter(x => x.id !== keepUserId)) })
      .catch(() => { if (!cancel) setMatches([]) })
    return () => { cancel = true }
  }, [query, keepUserId])

  async function doMerge() {
    setBusy(true); setError(null)
    try {
      await adminMergeUsers({ keepUserId, mergeUserId: merge.id, reason })
      onDone?.()
    } catch (e) { setError(e.message) }
    finally    { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl border border-edge shadow-2xl w-full max-w-xl flex flex-col" onClick={e => e.stopPropagation()}>
        <header className="border-b border-edge bg-surface-elevated px-5 py-3 flex items-center gap-2">
          <GitMerge size={16} className="text-admin-deep" />
          <h3 className="font-bold text-ink flex-1">Merge accounts (step {step}/3)</h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink p-1"><X size={14} /></button>
        </header>
        <div className="p-5 flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
          <p className="text-[12px] text-ink-muted">
            All rows referencing the merged user (orders, vehicles, ratings, conversations, etc.)
            are reassigned to the kept user. The merged profile is deleted; its auth.users entry
            must be removed via the user-management Edge Function afterwards.
          </p>
          {keep && (
            <div className="card">
              <p className="text-[10.5px] uppercase tracking-wider text-ink-subtle">Keep</p>
              <p className="text-sm font-semibold text-ink">{keep.full_name}</p>
              <p className="text-[11.5px] text-ink-muted font-mono">{keep.id}</p>
              <span className={`mt-1 inline-block px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded border ${roleColor(keep.role)}`}>{keep.role}</span>
            </div>
          )}

          {step === 1 && (
            <>
              <div className="flex items-center gap-2 bg-surface rounded-xl border border-edge px-3">
                <Search size={14} className="text-ink-subtle" />
                <input className="flex-1 bg-transparent outline-none text-sm py-2" placeholder="Find user to merge from" value={query} onChange={e => setQuery(e.target.value)} />
              </div>
              <div className="border border-edge rounded-xl divide-y divide-edge max-h-[260px] overflow-y-auto">
                {matches.map(m => (
                  <button key={m.id} onClick={() => setMerge(m)} className={`w-full text-start px-3 py-2 hover:bg-surface-elevated-2 ${merge?.id === m.id ? 'bg-admin-soft' : ''}`}>
                    <p className="text-sm text-ink">{m.full_name}</p>
                    <p className="text-[11px] text-ink-muted">{m.role} · <span className="font-mono">{m.id.slice(0,8)}…</span></p>
                  </button>
                ))}
                {matches.length === 0 && <p className="text-center text-sm text-ink-subtle py-6">{query ? 'No matches' : 'Start typing'}</p>}
              </div>
            </>
          )}

          {step === 2 && merge && (
            <>
              <div className="card border-warning/30 bg-warning/5 flex items-start gap-2">
                <AlertTriangle size={16} className="text-warning shrink-0 mt-0.5" />
                <div>
                  <p className="text-[12.5px] text-ink"><strong>{merge.full_name}</strong> ({merge.role}) will be merged into <strong>{keep?.full_name}</strong>.</p>
                  <p className="text-[11.5px] text-ink-muted mt-1">This is irreversible.</p>
                </div>
              </div>
              <textarea rows={3} className="input" placeholder="Reason (≥3 chars)" value={reason} onChange={e => setReason(e.target.value)} />
            </>
          )}

          {step === 3 && (
            <div className="card border-danger/30 bg-danger/5">
              <p className="text-[12.5px] text-ink">About to merge:</p>
              <p className="text-[12px] text-ink-muted">From: {merge?.full_name} ({merge?.id.slice(0,8)}…)</p>
              <p className="text-[12px] text-ink-muted">Into: {keep?.full_name} ({keep?.id.slice(0,8)}…)</p>
              <p className="text-[11.5px] text-ink-muted mt-2">Reason: {reason}</p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-xl border border-danger/30 bg-danger/10 text-danger text-xs">
              <AlertCircle size={14} className="shrink-0 mt-0.5" /><span className="font-mono">{error}</span>
            </div>
          )}
        </div>
        <footer className="border-t border-edge bg-surface-elevated px-5 py-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {step > 1 && <button className="btn-ghost w-full sm:w-auto" onClick={() => setStep(step - 1)} disabled={busy}>Back</button>}
          {step < 3 && (
            <button
              className="btn-primary w-full sm:w-auto"
              onClick={() => setStep(step + 1)}
              disabled={(step === 1 && !merge) || (step === 2 && reason.trim().length < 3)}
            >
              Next
            </button>
          )}
          {step === 3 && (
            <button
              className="btn border border-danger/50 text-danger hover:bg-danger/10 w-full sm:w-auto"
              onClick={doMerge}
              disabled={busy}
            >
              {busy ? 'Merging…' : 'Merge'}
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
