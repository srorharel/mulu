// src/components/AdminBanners.jsx
//
// Renders system banners surfaced by AuthContext: impersonation in progress
// and account-suspended takeover screen.

import { useAuth } from '../context/AuthContext.jsx'
import { clearImpersonationBanner } from '../lib/impersonate.js'

export function ImpersonationBanner() {
  const { impersonation } = useAuth()
  if (!impersonation) return null
  return (
    <div className="bg-amber-500 text-amber-950 text-sm px-4 py-2 text-center font-medium flex items-center justify-center gap-3">
      <span>⚠ Impersonated by admin — every action audited (since {new Date(impersonation.started_at).toLocaleString()})</span>
      <button
        onClick={() => { clearImpersonationBanner(); window.location.reload() }}
        className="underline font-bold text-[12px]"
      >
        End impersonation
      </button>
    </div>
  )
}

export function SuspendedTakeover() {
  const { suspended } = useAuth()
  if (!suspended) return null
  return (
    <div className="fixed inset-0 z-[100] bg-zinc-950/90 text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        <p className="text-2xl font-bold mb-3">Account suspended</p>
        <p className="text-sm text-zinc-300 mb-2">{suspended.reason || 'Your account has been suspended.'}</p>
        <p className="text-xs text-zinc-400">Contact support if you believe this is a mistake.</p>
      </div>
    </div>
  )
}
