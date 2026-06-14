import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Heart, Loader2, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase.js'
import { useToast } from '../ui/Toast.jsx'

// Post-completion tip (Washer Terms §6.7). The amount is stored on its own column
// (orders.tip_amount) via the consumer-only add_order_tip RPC — never folded into
// the wash price. VAT on the tip is handled later by the payout backend based on
// the washer's tax status; nothing about VAT happens here.
const PRESETS = [10, 20, 30]

export default function TipCard({ order, onTipped }) {
  const { t }       = useTranslation()
  const showToast   = useToast()
  const [sending, setSending] = useState(false)
  const [custom,  setCustom]  = useState('')
  const [tipped,  setTipped]  = useState(null)

  const shownAmount  = tipped ?? Number(order?.tip_amount)
  const alreadyTipped = shownAmount > 0

  async function sendTip(value) {
    if (sending) return
    const amt = Math.round(Number(value) * 100) / 100
    if (!amt || amt <= 0) { showToast(t('consumer.tip.invalid'), 'error'); return }
    setSending(true)
    const { error } = await supabase.rpc('add_order_tip', { p_order_id: order.id, p_amount: amt })
    setSending(false)
    if (error) { showToast(error.message, 'error'); return }
    setTipped(amt)
    showToast(t('consumer.tip.thanks', { amount: amt }), 'success')
    onTipped?.(amt)
  }

  if (alreadyTipped) {
    return (
      <div className="rounded-glass p-4 bg-primary-50 dark:bg-accent-muted border border-primary-200 flex items-center justify-center gap-2">
        <Check className="h-4 w-4 text-primary-600 dark:text-accent shrink-0" />
        <p className="text-sm font-semibold text-primary-700 dark:text-accent">
          {t('consumer.tip.added', { amount: shownAmount })}
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-glass p-4 bg-white dark:bg-surface-elevated border border-edge flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Heart className="h-4 w-4 text-primary-600 dark:text-accent shrink-0" />
        <p className="text-sm font-bold text-ink">{t('consumer.tip.title')}</p>
      </div>
      <p className="text-xs text-ink-muted">{t('consumer.tip.subtitle')}</p>

      <div className="grid grid-cols-3 gap-2">
        {PRESETS.map(p => (
          <button
            key={p}
            type="button"
            disabled={sending}
            onClick={() => sendTip(p)}
            className="py-2.5 rounded-xl border border-primary-200 dark:border-accent/30 bg-primary-50 dark:bg-accent-muted text-primary-700 dark:text-accent font-bold text-sm disabled:opacity-50 active:scale-[0.98] transition"
          >
            ₪{p}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <span className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-muted text-sm" dir="ltr">₪</span>
          <input
            type="number"
            inputMode="decimal"
            min="1"
            value={custom}
            onChange={e => setCustom(e.target.value)}
            placeholder={t('consumer.tip.customPlaceholder')}
            className="w-full ps-7 pe-3 py-2.5 rounded-xl border border-edge bg-surface text-ink text-sm"
          />
        </div>
        <button
          type="button"
          disabled={sending || !custom}
          onClick={() => sendTip(custom)}
          className="px-4 py-2.5 rounded-xl bg-primary-600 text-white font-bold text-sm disabled:opacity-50 flex items-center gap-1.5"
        >
          {sending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t('consumer.tip.send')}
        </button>
      </div>
    </div>
  )
}
