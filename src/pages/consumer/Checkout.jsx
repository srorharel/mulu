import { useState, useEffect } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { ArrowLeft, ShieldCheck, Lock, Loader2, Car, MapPin, CreditCard, Plus, Check } from 'lucide-react'
import { useTranslation, Trans } from 'react-i18next'
import { supabase } from '../../lib/supabase.js'
import { priceBreakdown, VAT_RATE } from '../../lib/pricing.js'
import { FEATURES } from '../../lib/featureFlags.js'
import { useSavedCards } from '../../hooks/useSavedCards.js'
import { chargeSavedCard, confirmScaffoldPayment, cardLabel } from '../../lib/payments.js'
import { useToast } from '../../components/ui/Toast.jsx'
import PageShell from '../../components/ui/PageShell.jsx'
import GlassCard from '../../components/ui/GlassCard.jsx'
import MotionButton from '../../components/ui/MotionButton.jsx'

// Secure payment page (PCI). Reached from the booking flow after the order row
// is created (status='pending'): /checkout/:id. It presents the order summary,
// the saved-card picker (card-on-file, ADR-043), the terms-approval gate
// required before a transaction (Consumer Terms §6.5), and the clearing
// company's PCI-compliant hosted payment surface for new cards.
//
// The card number is captured ONLY inside the provider's iframe
// (VITE_PAYMENT_IFRAME_URL) — it never touches our servers (Privacy §2(ד)).
// Saved cards are charged server-side by the charge-saved-card Edge Function
// using a stored token; the browser never sees the token.
const PAYMENT_IFRAME_URL = import.meta.env.VITE_PAYMENT_IFRAME_URL || ''
const VAT_PERCENT = Math.round(VAT_RATE * 100)

export default function Checkout() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const showToast = useToast()
  const { cards } = useSavedCards()

  const [order, setOrder]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [accepted, setAccepted] = useState(false)
  const [paying, setPaying]   = useState(false)
  const [method, setMethod]   = useState(null)   // null until decided · 'new' | <cardId>
  const [saveNewCard, setSaveNewCard] = useState(false)

  const dir = i18n.language === 'he' ? 'rtl' : 'ltr'
  const hasSavedCards = FEATURES.payments && cards.length > 0

  useEffect(() => {
    let active = true
    setLoading(true)
    supabase
      .from('orders')
      .select('id, status, service_type, car_type, car_make, car_model, car_year, car_color, car_plate, address_label, address_city, total_price')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (!active) return
        if (error || !data) { setNotFound(true); setLoading(false); return }
        if (data.status !== 'pending') { navigate(`/order/${id}`, { replace: true }); return }
        setOrder(data)
        setLoading(false)
      })
    return () => { active = false }
  }, [id, navigate])

  // Pick the initial payment method once saved cards have loaded.
  useEffect(() => {
    if (method !== null) return
    if (hasSavedCards) setMethod((cards.find((c) => c.is_default) ?? cards[0]).id)
    else setMethod('new')
  }, [cards, hasSavedCards, method])

  const usingNewCard = method === 'new' || !hasSavedCards

  async function handlePay() {
    if (!accepted || paying) return
    setPaying(true)
    try {
      if (method && method !== 'new') {
        // Saved card — charged server-side by token (browser never sees it).
        const res = await chargeSavedCard(id, method)
        if (!res.ok) { setPaying(false); showToast(t('consumer.checkout.error'), 'error'); return }
        showToast(t('consumer.checkout.success'), 'success')
        navigate(`/order/${id}`, { replace: true })
        return
      }
      // ─── NEW-CARD / CLEARING-API INTEGRATION POINT ───────────────────────────
      // When the terminal is live, the card is captured inside the hosted iframe.
      // On the provider's verified confirm (postMessage/redirect): if `saveNewCard`,
      // persist the returned token via saveCardFromToken(), then finalize on an
      // AUTHORISED charge whose Edge Function set orders.paid_at server-side.
      //
      // Until that is wired, confirm_scaffold_payment marks the order paid (so it
      // enters the washer pool exactly like a real charge); it REFUSES once
      // app_config.payments_live = true, so it can never bypass a real charge.
      const res = await confirmScaffoldPayment(id)
      if (!res.ok) { setPaying(false); showToast(t('consumer.checkout.error'), 'error'); return }
      showToast(t('consumer.checkout.success'), 'success')
      navigate(`/order/${id}`, { replace: true })
    } catch {
      setPaying(false)
      showToast(t('consumer.checkout.error'), 'error')
    }
  }

  const total   = Number(order?.total_price) || 0
  const { vat } = priceBreakdown(total)
  const vatAmount = Math.round(vat * 100) / 100
  const vehicleLine = order
    ? [order.car_make, order.car_model, order.car_year].filter(Boolean).join(' · ')
    : ''
  const addressLine = order?.address_label || order?.address_city || ''

  return (
    <PageShell noNav>
      <div className="bg-mesh min-h-full flex flex-col" dir={dir}>

        {/* ── Header ── */}
        <div className="px-5 pt-4 pb-2 flex items-center gap-3 shrink-0">
          <button
            onClick={() => navigate(-1)}
            aria-label={t('common.back')}
            className="w-10 h-10 rounded-[14px] bg-glass backdrop-blur-xl border border-glass-border flex items-center justify-center text-ink shadow-sm"
          >
            <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
          </button>
          <h1 className="text-[22px] font-extrabold text-ink tracking-[-0.5px]">
            {t('consumer.checkout.title')}
          </h1>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-7 w-7 animate-spin text-primary-500" />
          </div>
        ) : notFound ? (
          <div className="flex-1 flex items-center justify-center px-6">
            <p className="text-sm text-ink-muted">{t('consumer.checkout.notFound')}</p>
          </div>
        ) : (
          <div className="flex-1 px-4 pt-2 pb-8 flex flex-col gap-3">

            {/* ── Order summary ── */}
            <GlassCard className="p-4">
              <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-[0.4px] mb-3">
                {t('consumer.checkout.summaryTitle')}
              </p>

              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center shrink-0">
                  <Car className="h-[18px] w-[18px] text-primary-600" strokeWidth={2.2} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-bold text-ink">{t('consumer.checkout.serviceWash')}</p>
                  {vehicleLine && <p className="text-[13px] text-ink-muted truncate" dir="auto">{vehicleLine}</p>}
                </div>
              </div>

              {addressLine && (
                <div className="flex items-center gap-3 mt-3">
                  <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center shrink-0">
                    <MapPin className="h-[18px] w-[18px] text-primary-600" strokeWidth={2.2} />
                  </div>
                  <p className="flex-1 min-w-0 text-[13px] text-ink truncate" dir="auto">{addressLine}</p>
                </div>
              )}

              <div className="border-t border-glass-border my-3.5" />

              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[13px] font-semibold text-ink">{t('consumer.checkout.toPay')}</p>
                  <p className="text-[11px] text-ink-muted mt-0.5">
                    {t('consumer.checkout.includesVat', { rate: VAT_PERCENT, amount: vatAmount })}
                  </p>
                </div>
                <span className="text-[26px] font-extrabold text-ink tracking-[-0.6px] leading-none tabular-nums">
                  ₪{total}
                </span>
              </div>
            </GlassCard>

            {/* ── Saved-card picker (only when payments on + cards exist) ── */}
            {hasSavedCards && (
              <GlassCard className="p-2">
                <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-[0.4px] px-2 pt-1.5 pb-1">
                  {t('consumer.checkout.methodTitle')}
                </p>
                {cards.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setMethod(c.id)}
                    className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl text-start"
                  >
                    <CreditCard className="h-[18px] w-[18px] text-ink-muted shrink-0" />
                    <span className="flex-1 text-[14px] font-semibold text-ink tabular-nums">{cardLabel(c)}</span>
                    {c.is_default && (
                      <span className="text-[10px] font-bold text-primary-700 bg-primary-100 rounded-full px-2 py-0.5">
                        {t('consumer.checkout.defaultBadge')}
                      </span>
                    )}
                    <RadioDot on={method === c.id} />
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setMethod('new')}
                  className="w-full flex items-center gap-3 px-2 py-2.5 rounded-xl text-start"
                >
                  <Plus className="h-[18px] w-[18px] text-ink-muted shrink-0" />
                  <span className="flex-1 text-[14px] font-semibold text-ink">{t('consumer.checkout.newCard')}</span>
                  <RadioDot on={usingNewCard} />
                </button>
              </GlassCard>
            )}

            {/* ── Secure payment (new card → hosted iframe) ── */}
            {usingNewCard && (
              <GlassCard className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Lock className="h-[18px] w-[18px] text-primary-600" strokeWidth={2.4} />
                  <p className="text-[15px] font-bold text-ink">{t('consumer.checkout.secureTitle')}</p>
                </div>
                <p className="flex items-start gap-2 text-[12px] leading-relaxed text-ink-muted">
                  <ShieldCheck className="h-4 w-4 text-primary-500 shrink-0 mt-0.5" strokeWidth={2.2} />
                  <span>{t('consumer.checkout.secureBody')}</span>
                </p>

                {PAYMENT_IFRAME_URL ? (
                  // Yaad/Hyp hosted page is cross-origin + emits no auto-height signal
                  // (no postMessage / iframe-resizer), so the parent can't measure it.
                  // Its form is a stable ~1076px single column → give a min-height FLOOR
                  // with headroom (never an inner scroll trap), and cap the width since
                  // the consumer app isn't width-capped on desktop (else the single-
                  // column form would stretch full-bleed).
                  <iframe
                    src={PAYMENT_IFRAME_URL}
                    title={t('consumer.checkout.secureTitle')}
                    allow="payment *"
                    className="mt-3 mx-auto block w-full max-w-[440px] min-h-[1180px] rounded-2xl border border-glass-border bg-white"
                  />
                ) : (
                  <div className="mt-3 rounded-2xl border border-dashed border-primary-200 bg-primary-50/40 px-4 py-6 text-center">
                    <p className="text-[13px] font-semibold text-ink">{t('consumer.checkout.terminalPending')}</p>
                    <p className="text-[11px] text-ink-muted mt-1">{t('consumer.checkout.terminalPendingNote')}</p>
                  </div>
                )}

                {FEATURES.payments && (
                  <label className="flex items-center gap-2.5 mt-3 px-0.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={saveNewCard}
                      onChange={(e) => setSaveNewCard(e.target.checked)}
                      className="h-[18px] w-[18px] shrink-0 rounded border-neutral-300 cursor-pointer accent-primary-600"
                    />
                    <span className="text-[12.5px] text-ink-muted">{t('consumer.checkout.saveCard')}</span>
                  </label>
                )}

                <p className="mt-3 text-[11px] text-ink-muted text-center tracking-[0.2px]">
                  {t('consumer.checkout.acceptedCards')}
                </p>
              </GlassCard>
            )}

            {/* ── Terms approval (required before the transaction) ── */}
            <label className="flex items-start gap-2.5 px-1 pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                aria-label={t('consumer.checkout.terms.aria')}
                className="mt-0.5 h-[18px] w-[18px] shrink-0 rounded border-neutral-300 cursor-pointer accent-primary-600"
              />
              <span className="text-[12.5px] leading-snug text-ink-muted">
                <Trans
                  i18nKey="consumer.checkout.terms.label"
                  components={{
                    terms:   <Link to="/legal/terms" className="text-primary-600 font-medium underline" />,
                    privacy: <Link to="/legal/privacy" className="text-primary-600 font-medium underline" />,
                  }}
                />
              </span>
            </label>

            {/* ── Pay CTA ── */}
            <MotionButton
              onClick={handlePay}
              disabled={!accepted || paying}
              className="mt-1 h-[54px] w-full rounded-2xl border-none bg-gradient-to-b from-primary-500 to-primary-600 text-white font-bold text-[16px] flex items-center justify-center gap-2 disabled:opacity-50 shadow-[0_4px_14px_rgba(38,181,95,0.4)]"
            >
              {paying ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {t('consumer.checkout.paying')}
                </>
              ) : (
                <>
                  <Lock className="h-[18px] w-[18px]" strokeWidth={2.4} />
                  {t('consumer.checkout.payNow', { amount: total })}
                </>
              )}
            </MotionButton>
            {FEATURES.payments ? null : (
              <p className="text-[10.5px] text-ink-muted/70 text-center px-2">
                {t('consumer.checkout.scaffoldNote')}
              </p>
            )}
          </div>
        )}
      </div>
    </PageShell>
  )
}

// Small radio indicator (filled when selected).
function RadioDot({ on }) {
  return (
    <span className={`w-[20px] h-[20px] rounded-full border-2 flex items-center justify-center shrink-0 ${on ? 'border-primary-500 bg-primary-500' : 'border-neutral-300'}`}>
      {on && <Check className="h-3 w-3 text-white" strokeWidth={3.5} />}
    </span>
  )
}
