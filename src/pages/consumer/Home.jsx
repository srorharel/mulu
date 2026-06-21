import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ChevronRight, User, MapPin, Car, Camera, Sparkles, Gift,
  ShieldCheck, Lock, RefreshCw,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase.js'
import { consumerBreakdown, FIRST_WASH_DISCOUNT_PERCENT } from '../../lib/pricing.js'
import { useConsumerActiveOrders } from '../../hooks/useConsumerActiveOrders.js'
import { useFirstWashDiscount } from '../../hooks/useFirstWashDiscount.js'
import { useAuth } from '../../context/AuthContext.jsx'
import PageShell from '../../components/ui/PageShell.jsx'
import GlassCard from '../../components/ui/GlassCard.jsx'
import MotionButton from '../../components/ui/MotionButton.jsx'
import WashMark from '../../components/ui/WashMark.jsx'
import Editable from '../../components/editable/Editable.jsx'

// Derive up to 2 initials from profile.full_name, falling back to the email prefix.
function getInitials(profile, user) {
  const name = profile?.full_name || ''
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  const emailPrefix = user?.email?.split('@')[0] || ''
  return emailPrefix.slice(0, 2).toUpperCase() || null
}

// Return a time-of-day greeting key: morning / afternoon / evening.
function greetingKey() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

// Tinted icon chip used by the how-it-works steps and the why-MULU rows.
function IconChip({ icon: Icon }) {
  return (
    <div className="w-11 h-11 rounded-[14px] bg-primary-50 text-primary-700 flex items-center justify-center shrink-0">
      <Icon className="h-[22px] w-[22px]" />
    </div>
  )
}

export default function ConsumerHome() {
  const navigate          = useNavigate()
  const { user, profile } = useAuth()
  const { t }             = useTranslation()

  const { orders: activeOrders }        = useConsumerActiveOrders()
  const { eligible: firstWashEligible }  = useFirstWashDiscount(user?.id)

  // Most-relevant saved vehicle (default first) drives the one-tap re-book row.
  const [topVehicle, setTopVehicle] = useState(null)
  useEffect(() => {
    if (!user?.id) return
    supabase
      .from('vehicles')
      .select('make, model, plate')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .then(({ data }) => setTopVehicle(data?.[0] ?? null))
  }, [user?.id])

  const initials  = getInitials(profile, user)
  const firstName = profile?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || ''
  const greeting  = t(`consumer.home.greeting.${greetingKey()}`, { name: firstName })

  // Cheapest category (private) is the headline "from" price.
  const fromPrice = consumerBreakdown('private').total

  const steps = [
    { icon: MapPin, title: t('consumer.home.hub.how.step1Title'), body: t('consumer.home.hub.how.step1Body') },
    { icon: Car,    title: t('consumer.home.hub.how.step2Title'), body: t('consumer.home.hub.how.step2Body') },
    { icon: Camera, title: t('consumer.home.hub.how.step3Title'), body: t('consumer.home.hub.how.step3Body') },
  ]

  const reasons = [
    { icon: MapPin,      title: t('consumer.home.hub.why.toCarTitle'),    body: t('consumer.home.hub.why.toCarBody') },
    { icon: ShieldCheck, title: t('consumer.home.hub.why.verifiedTitle'), body: t('consumer.home.hub.why.verifiedBody') },
    { icon: Lock,        title: t('consumer.home.hub.why.secureTitle'),   body: t('consumer.home.hub.why.secureBody') },
  ]

  const vehicleLabel = topVehicle
    ? [topVehicle.make, topVehicle.model].filter(Boolean).join(' ')
    : null

  return (
    <PageShell>
      <div className="bg-mesh min-h-full flex flex-col">

        {/* ── Header ── */}
        <div className="px-5 pt-4 pb-2 flex items-center justify-between shrink-0">
          <WashMark />
          <button
            type="button"
            onClick={() => navigate('/profile')}
            aria-label={t('nav.profile')}
            className="w-[38px] h-[38px] rounded-[14px] flex items-center justify-center text-white font-bold text-[14px] shadow-[0_2px_6px_rgba(38,181,95,0.3)]"
            style={{ background: 'linear-gradient(135deg, #B9E5CB, #47D17F)' }}
          >
            {initials ?? <User className="h-5 w-5" />}
          </button>
        </div>

        {/* ── Greeting ── */}
        <div className="px-5 pt-1 pb-4 shrink-0">
          <p className="text-[13px] font-medium text-ink-muted tracking-[0.2px]">{greeting}</p>
        </div>

        {/* ── Scrollable content ── */}
        <div className="flex-1 px-4 flex flex-col gap-3 pb-2">

          {/* Active orders — time-sensitive, pinned to the top */}
          {activeOrders.length > 0 && (
            <div className="flex flex-col gap-2" data-testid="active-orders">
              <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-[0.4px] px-1">
                {t('consumer.home.activeOrders')}
              </p>
              {activeOrders.map(o => (
                <MotionButton
                  key={o.id}
                  type="button"
                  onClick={() => navigate(`/order/${o.id}`)}
                  className="flex items-center gap-3 w-full text-start rounded-glass bg-glass border border-glass-border backdrop-blur-xl shadow-glass px-4 py-3"
                >
                  <span className="w-2 h-2 rounded-full bg-primary-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-bold text-ink truncate">
                      {t(`consumer.tracking.heading.${o.status}`, { defaultValue: o.status })}
                    </p>
                    {o.address_label && (
                      <p className="text-[12px] text-ink-muted truncate">{o.address_label}</p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-ink-muted shrink-0 rtl:rotate-180" />
                </MotionButton>
              ))}
            </div>
          )}

          {/* ── Hero booking CTA — the single dominant action ── */}
          <Editable id="consumer.home.hub.hero">
          <MotionButton
            type="button"
            onClick={() => navigate('/book')}
            aria-label={t('consumer.home.hub.heroCta')}
            className="w-full text-start rounded-[20px] border-none bg-gradient-to-br from-primary-500 to-primary-700 p-5 shadow-[0_10px_30px_rgba(38,181,95,0.35)]"
          >
            <div className="flex items-center gap-1.5 text-white/85 text-[11px] font-semibold">
              <Sparkles className="h-[14px] w-[14px]" />
              <span>{t('consumer.home.hub.heroEyebrow')}</span>
            </div>
            <p className="text-white text-[22px] font-extrabold tracking-[-0.5px] leading-tight mt-2">
              {t('consumer.home.hub.heroTitle')}
            </p>
            <p className="text-white/85 text-[13px] mt-1">
              {t('consumer.home.hub.heroSubtitle')}
            </p>
            <div className="flex items-center justify-between mt-4">
              <span className="inline-flex items-center gap-1.5 bg-white text-primary-700 font-bold text-[14px] rounded-2xl px-4 py-2.5 shadow-sm">
                {t('consumer.home.hub.heroCta')}
                <ChevronRight className="h-[17px] w-[17px] rtl:rotate-180" strokeWidth={2.5} />
              </span>
              <span className="text-white/90 text-[13px] font-semibold">
                {t('consumer.home.hub.fromPrice', { price: fromPrice })}
              </span>
            </div>
          </MotionButton>
          </Editable>

          {/* First-wash gift strip */}
          {firstWashEligible && (
            <div className="bg-primary-50 border border-primary-100 rounded-glass px-4 py-3 flex items-center gap-2.5">
              <Gift className="h-[18px] w-[18px] text-primary-700 shrink-0" />
              <p className="text-[12px] font-bold text-primary-700">
                {t('consumer.home.hub.firstWashBadge', { percent: FIRST_WASH_DISCOUNT_PERCENT })}
              </p>
            </div>
          )}

          {/* Quick re-book — one tap to wash a saved vehicle again */}
          {vehicleLabel && (
            <MotionButton
              type="button"
              onClick={() => navigate('/book')}
              aria-label={t('consumer.home.hub.rebookTitle')}
              className="flex items-center gap-3 w-full text-start rounded-glass bg-glass border border-glass-border backdrop-blur-xl shadow-glass px-4 py-3"
            >
              <div className="w-9 h-9 rounded-[11px] bg-primary-50 text-primary-700 flex items-center justify-center shrink-0">
                <RefreshCw className="h-[18px] w-[18px]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-ink leading-tight">{t('consumer.home.hub.rebookTitle')}</p>
                <p className="text-[11px] text-ink-muted truncate">{vehicleLabel}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-ink-subtle shrink-0 rtl:rotate-180" />
            </MotionButton>
          )}

          {/* How it works */}
          <GlassCard className="p-4">
            <p className="text-[10px] font-bold text-primary-700 uppercase tracking-[0.4px] mb-3">
              {t('consumer.home.hub.howTitle')}
            </p>
            <div className="flex items-start justify-between gap-2">
              {steps.map((s, i) => (
                <div key={i} className="flex-1 flex flex-col items-center text-center gap-1.5">
                  <IconChip icon={s.icon} />
                  <p className="text-[12px] font-bold text-ink leading-tight mt-0.5">{s.title}</p>
                  <p className="text-[10.5px] text-ink-muted leading-snug">{s.body}</p>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Why MULU */}
          <GlassCard className="p-4">
            <p className="text-[10px] font-bold text-primary-700 uppercase tracking-[0.4px] mb-3">
              {t('consumer.home.hub.whyTitle')}
            </p>
            <div className="flex flex-col gap-3">
              {reasons.map((r, i) => (
                <div key={i} className="flex items-center gap-3">
                  <IconChip icon={r.icon} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-ink leading-tight">{r.title}</p>
                    <p className="text-[11px] text-ink-muted mt-0.5 leading-snug">{r.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Service-area note */}
          <div className="flex items-center justify-center gap-1.5 text-ink-subtle pt-1 pb-2">
            <MapPin className="h-[13px] w-[13px]" />
            <p className="text-[11px] font-medium">{t('consumer.home.hub.serviceArea')}</p>
          </div>
        </div>
      </div>
    </PageShell>
  )
}
