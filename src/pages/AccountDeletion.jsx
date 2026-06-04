import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext.jsx'
import DeleteAccountModal from '../components/account/DeleteAccountModal.jsx'

// Public /account/delete route — reachable logged-in OR logged-out (this is the
// URL submitted to Google Play / App Store for account-deletion). Logged-in runs
// the same in-app deletion flow; logged-out shows instructions + support contact
// and a statement of what is deleted vs retained.
export default function AccountDeletion() {
  const { t, i18n } = useTranslation()
  const { user, loading } = useAuth()
  const [open, setOpen] = useState(false)

  if (loading) return null
  const dir = i18n.language === 'he' ? 'rtl' : 'ltr'

  return (
    <div dir={dir} className="min-h-screen bg-surface flex items-center justify-center p-6">
      <div className="w-full max-w-md flex flex-col gap-4">
        <h1 className="text-2xl font-extrabold text-ink">{t('account.delete.webTitle')}</h1>

        {user ? (
          <>
            <p className="text-sm text-ink-muted">{t('account.delete.webLoggedInIntro')}</p>
            <button
              onClick={() => setOpen(true)}
              className="w-fit px-5 py-3 rounded-xl bg-danger-500 text-white text-sm font-semibold"
            >
              {t('account.delete.title')}
            </button>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink">{t('account.delete.webInstructions')}</p>
            <p className="text-sm text-ink">{t('account.delete.webRetained')}</p>
            <p className="text-sm text-ink-muted">
              {t('account.delete.webSupport')}{' '}
              <a className="text-primary-600 underline" href="mailto:support@wash.co.il">support@wash.co.il</a>
            </p>
          </div>
        )}

        {open && <DeleteAccountModal onClose={() => setOpen(false)} />}
      </div>
    </div>
  )
}
