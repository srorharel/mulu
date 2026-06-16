import { useState } from 'react'
import { X, ExternalLink, AlertCircle, Copy } from 'lucide-react'
import { adminCreateImpersonationToken } from '../../lib/adminUsers.js'

const MAIN_APP_URL = import.meta.env.VITE_MAIN_APP_URL || ''

export default function ImpersonateLauncher({ userId, onClose }) {
  const [busy, setBusy]     = useState(false)
  const [error, setError]   = useState(null)
  const [token, setToken]   = useState(null)  // { token, expires_at, target_user }
  const [ttl, setTtl]       = useState(600)

  async function issue() {
    setBusy(true); setError(null)
    try { setToken(await adminCreateImpersonationToken(userId, ttl)) }
    catch (e) { setError(e.message) }
    finally   { setBusy(false) }
  }

  const url = token ? `${MAIN_APP_URL || window.location.origin.replace(':3002', ':3000')}/?impersonate_token=${encodeURIComponent(token.token)}` : ''

  function copy() {
    navigator.clipboard?.writeText(url).catch(() => {})
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface rounded-2xl border border-edge shadow-2xl w-full max-w-lg p-5 flex flex-col gap-3" onClick={e => e.stopPropagation()}>
        <header className="flex items-center gap-2">
          <ExternalLink size={16} className="text-admin-deep" />
          <h3 className="font-bold text-ink flex-1">Impersonate user</h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink p-1"><X size={14} /></button>
        </header>
        <p className="text-[12px] text-ink-muted">
          Issues a one-time token. Opening the main app with the URL below signs you in as the target user.
          Every action while impersonating is audit-logged. The target user’s app shows a permanent banner while the token is active.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="label-uppercase">TTL (seconds)</label>
          <input type="number" min={30} max={3600} value={ttl} onChange={e => setTtl(Number(e.target.value))} className="input w-32" />
          <button className="btn-primary ms-auto" onClick={issue} disabled={busy}>
            {busy ? 'Issuing…' : token ? 'Re-issue' : 'Issue token'}
          </button>
        </div>
        {error && (
          <div className="flex items-start gap-2 px-3 py-2 rounded-xl border border-danger/30 bg-danger/10 text-danger text-xs">
            <AlertCircle size={14} className="shrink-0 mt-0.5" /><span className="font-mono">{error}</span>
          </div>
        )}
        {token && (
          <div className="card border-admin/30 bg-admin-soft">
            <p className="text-[10.5px] uppercase tracking-wider text-admin-deep font-bold">One-time URL. Copy or open it now</p>
            <p className="font-mono text-[11.5px] text-ink mt-1 break-all select-all">{url}</p>
            <p className="text-[10.5px] text-ink-subtle mt-1">expires {new Date(token.expires_at).toLocaleString()}</p>
            <div className="flex gap-2 mt-2">
              <button className="btn-ghost text-xs" onClick={copy}><Copy size={12} /> Copy</button>
              <a className="btn-primary text-xs" href={url} target="_blank" rel="noreferrer"><ExternalLink size={12} /> Open</a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
