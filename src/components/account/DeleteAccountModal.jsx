import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, X } from 'lucide-react'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../ui/Toast.jsx'
import { unregisterToken } from '../../lib/notifications.js'

// Type-to-confirm account-deletion modal. On confirm it calls the delete-account
// Edge Function (authenticated as the caller), then unregisters the push token
// and signs out. Used from consumer + washer settings and the /account/delete
// web route.
export default function DeleteAccountModal({ onClose }) {
  const { t, i18n } = useTranslation()
  const { signOut } = useAuth()
  const showToast = useToast()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)

  const confirmWord = t('account.delete.confirmWord')
  const canDelete = typed.trim() === confirmWord && !busy
  const dir = i18n.language === 'he' ? 'rtl' : 'ltr'

  async function handleDelete() {
    if (typed.trim() !== confirmWord) return
    setBusy(true)
    const { error } = await supabase.functions.invoke('delete-account', { body: {} })
    if (error) {
      setBusy(false)
      showToast(t('account.delete.error'), 'error')
      return
    }
    // Success — clear the device token, then sign out (clears session + redirects).
    try { await unregisterToken() } catch { /* best-effort; web no-ops */ }
    await signOut()
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
    >
      <div
        dir={dir}
        role="dialog"
        aria-modal="true"
        aria-label={t('account.delete.title')}
        className="w-full max-w-sm bg-white dark:bg-surface-elevated rounded-[28px] shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: 'min(90dvh, 640px)' }}
      >
        <div className="px-6 pt-5 pb-3 flex items-start justify-between shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-danger-500" />
            <p className="text-[17px] font-bold text-ink">{t('account.delete.title')}</p>
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            disabled={busy}
            className="w-8 h-8 flex items-center justify-center rounded-full text-ink-muted hover:bg-surface ms-3 shrink-0 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 pb-2 flex-1 overflow-y-auto">
          <p className="text-sm text-ink-muted mb-3">{t('account.delete.intro')}</p>
          <ul className="list-disc ms-5 flex flex-col gap-1 text-sm text-ink mb-4">
            <li>{t('account.delete.consequences.profile')}</li>
            <li>{t('account.delete.consequences.media')}</li>
            <li>{t('account.delete.consequences.retained')}</li>
          </ul>
          <label className="text-xs text-ink-muted">
            {t('account.delete.confirmPrompt', { word: confirmWord })}
          </label>
          <input
            value={typed}
            onChange={e => setTyped(e.target.value)}
            aria-label={t('account.delete.confirmInputLabel')}
            className="w-full mt-1 h-11 rounded-xl border border-edge bg-surface px-3 text-sm text-ink outline-none focus:ring-2 focus:ring-danger-400"
          />
        </div>

        <div className="px-6 pb-6 pt-3 flex flex-col gap-2 shrink-0">
          <button
            onClick={handleDelete}
            disabled={!canDelete}
            className="w-full py-3 rounded-xl bg-danger-500 text-white text-sm font-semibold disabled:opacity-40"
          >
            {busy ? '…' : t('account.delete.confirmButton')}
          </button>
          <button
            onClick={onClose}
            disabled={busy}
            className="w-full py-2.5 rounded-xl border border-edge text-sm font-semibold text-ink-muted disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
