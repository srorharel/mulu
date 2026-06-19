import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CreditCard, Trash2, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import PageShell from '../../components/ui/PageShell.jsx'
import GlassCard from '../../components/ui/GlassCard.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'
import { useToast } from '../../components/ui/Toast.jsx'
import { useSavedCards } from '../../hooks/useSavedCards.js'
import { cardLabel } from '../../lib/payments.js'

// Manage saved cards (card-on-file). Reached from consumer Settings (only shown
// when FEATURES.payments). The token is never exposed here — the list reads only
// brand/last4/expiry; removal deletes the row (and best-effort revokes the token
// at the processor on the server side).
export default function PaymentMethods() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const showToast = useToast()
  const { cards, loading, remove, makeDefault } = useSavedCards()
  const [confirmId, setConfirmId] = useState(null)
  const [removing, setRemoving]   = useState(false)

  async function handleRemove() {
    setRemoving(true)
    const { error } = await remove(confirmId)
    setRemoving(false)
    setConfirmId(null)
    showToast(error ? t('error.message') : t('consumer.payment.removed'), error ? 'error' : 'success')
  }

  async function handleDefault(id) {
    const { error } = await makeDefault(id)
    if (error) showToast(t('error.message'), 'error')
  }

  return (
    <PageShell>
      <div className="bg-mesh min-h-full flex flex-col">
        <div className="px-5 pt-4 pb-2 flex items-center gap-3 shrink-0">
          <button
            onClick={() => navigate(-1)}
            aria-label={t('common.back')}
            className="w-10 h-10 rounded-[14px] bg-white/60 backdrop-blur-xl border border-glass-border flex items-center justify-center text-ink shadow-sm"
          >
            <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
          </button>
          <h1 className="text-[22px] font-extrabold text-ink tracking-[-0.5px]">
            {t('consumer.payment.title')}
          </h1>
        </div>

        <div className="flex-1 px-4 pb-8 pt-2 flex flex-col gap-3">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-7 w-7 animate-spin text-primary-500" />
            </div>
          ) : cards.length === 0 ? (
            <div className="flex-1 flex items-center justify-center px-6">
              <div className="flex flex-col items-center gap-3 text-center">
                <CreditCard className="h-12 w-12 text-ink-muted/30" />
                <p className="font-semibold text-ink">{t('consumer.payment.empty')}</p>
                <p className="text-sm text-ink-muted">{t('consumer.payment.emptyDesc')}</p>
              </div>
            </div>
          ) : (
            cards.map((c) => (
              <GlassCard key={c.id} className="p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center shrink-0">
                  <CreditCard className="h-[18px] w-[18px] text-primary-600" strokeWidth={2.2} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-bold text-ink tabular-nums">{cardLabel(c)}</p>
                  {c.is_default ? (
                    <span className="text-[11px] font-semibold text-primary-700">{t('consumer.payment.default')}</span>
                  ) : (
                    <button
                      onClick={() => handleDefault(c.id)}
                      className="text-[11px] font-semibold text-primary-600 hover:underline"
                    >
                      {t('consumer.payment.makeDefault')}
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setConfirmId(c.id)}
                  aria-label={t('consumer.payment.remove')}
                  className="w-9 h-9 rounded-xl bg-danger-50 flex items-center justify-center shrink-0"
                >
                  <Trash2 className="h-[18px] w-[18px] text-danger-500" />
                </button>
              </GlassCard>
            ))
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmId}
        destructive
        title={t('consumer.payment.removeConfirm')}
        message={t('consumer.payment.removeConfirmBody')}
        confirmLabel={t('consumer.payment.remove')}
        cancelLabel={t('common.cancel')}
        loading={removing}
        onConfirm={handleRemove}
        onCancel={() => setConfirmId(null)}
      />
    </PageShell>
  )
}
