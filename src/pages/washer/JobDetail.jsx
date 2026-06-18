import { useState, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, Car, MapPin, Navigation, Clock, Lock, Loader2, ParkingSquare, Banknote } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../components/ui/Toast.jsx'
import { useRealtimeOrder } from '../../hooks/useRealtimeOrder.js'
import { payoutForTier } from '../../lib/payout.js'
import PageShell from '../../components/ui/PageShell.jsx'
import Editable from '../../components/editable/Editable.jsx'

// Relative "posted X ago" — minutes / hours / days, i18n-driven. Uses a plain {{n}}
// var (not i18next `count`) so no plural-suffix resolution kicks in across locales.
function postedAgo(iso, t) {
  if (!iso) return null
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1)  return t('washer.jobDetail.postedAgo.justNow')
  if (min < 60) return t('washer.jobDetail.postedAgo.minutes', { n: min })
  const hr = Math.floor(min / 60)
  if (hr < 24)  return t('washer.jobDetail.postedAgo.hours', { n: hr })
  return t('washer.jobDetail.postedAgo.days', { n: Math.floor(hr / 24) })
}

// One labelled info line: tinted icon chip + label/value. Brand-green in light
// (saturated, AA on the light tint), mint accent in dark — matching the app.
function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="w-[38px] h-[38px] rounded-xl bg-primary-100 dark:bg-accent-muted flex items-center justify-center shrink-0">
        <Icon className="h-[19px] w-[19px] text-primary-700 dark:text-accent" strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-ink-muted leading-none">{label}</p>
        <p className="text-[15px] font-semibold text-ink truncate mt-1">{value}</p>
      </div>
    </div>
  )
}

export default function JobDetail() {
  const { id }     = useParams()
  const navigate   = useNavigate()
  const { state }  = useLocation()
  const showToast  = useToast()
  const { t }      = useTranslation()
  const { profile } = useAuth()
  // Live order: realtime keeps `status` current while the washer is deciding, so
  // if another washer accepts this job first the Accept button disappears and the
  // "unavailable" notice shows — no stale "pending" screen to tap into. (Realtime
  // is best-effort; the accept failure handler below is the hard guarantee.)
  const { order, loading, error: fetchError } = useRealtimeOrder(id)
  const [accepting, setAccepting] = useState(false)
  const acceptingRef              = useRef(false)
  // Set when an accept loses the race to another washer (the order is no longer
  // claimable). Flips the page to its unavailable state regardless of realtime.
  const [taken, setTaken]         = useState(false)

  async function acceptJob() {
    if (acceptingRef.current) return
    acceptingRef.current = true
    setAccepting(true)
    const { error } = await supabase.rpc('transition_order_status', {
      order_id: id, new_status: 'accepted',
    })
    acceptingRef.current = false
    setAccepting(false)
    if (error) {
      // "You already have an active/pending-approval job" is about THIS washer,
      // not the order — surface it verbatim and keep them on the page.
      if (/active or pending-approval job/i.test(error.message || '')) {
        showToast(error.message, 'error')
        return
      }
      // Any other failure accepting a pending job means it is no longer claimable
      // — the order row is locked + status-checked server-side, so a concurrent
      // accept by another washer is rejected here. Flip to the unavailable state
      // (button gone, can't re-tap) and say plainly that someone else got it.
      setTaken(true)
      showToast(t('washer.jobDetail.alreadyTaken'), 'error')
      return
    }
    showToast(t('washer.jobDetail.accepted'), 'success')
    navigate('/washer', {
      state: {
        acceptedJob: { id: order.id, lat: order.lat, lng: order.lng },
      },
    })
  }

  if (loading) return (
    <PageShell noNav>
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    </PageShell>
  )

  if (!order) return (
    <PageShell noNav>
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-danger-500 text-sm">{fetchError || t('washer.jobDetail.notFound')}</p>
      </div>
    </PageShell>
  )

  const payout       = payoutForTier(profile?.current_tier)
  const vehicleLabel = t(`carLabels.${order.car_type}`, { defaultValue: '' })
  const serviceLabel = t(`serviceLabels.${order.service_type || 'wash'}`)
  // Distance is passed from the job list (nearby_jobs row) via nav state — shown
  // only when present (e.g. deep links / map entry won't have it).
  const distanceKm   = state?.job?.distance_km
  const posted       = postedAgo(order.created_at, t)
  const isPending    = order.status === 'pending' && !taken

  return (
    <PageShell noNav>
      <div className="px-5 pt-6 pb-8 flex flex-col gap-5 min-h-full">
        <button onClick={() => navigate('/washer')} className="flex items-center gap-2 text-ink-muted text-sm -ms-1">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t('washer.jobDetail.back')}
        </button>

        <h1 className="text-xl font-bold text-ink">{t('washer.jobDetail.title')}</h1>

        {order.is_underground_parking && (
          <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-warning-500/10 border border-warning-500/30 text-warning-600 dark:text-warning-500">
            <ParkingSquare className="h-4 w-4 shrink-0" />
            <span className="text-sm font-semibold">{t('washer.drawer.underground.badge')}</span>
          </div>
        )}

        {/* ── Payout hero — the number is what the washer decides on ── */}
        <div className="rounded-3xl border border-primary-200 dark:border-accent/25 bg-primary-50 dark:bg-accent-muted p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary-100 dark:bg-accent/20 flex items-center justify-center shrink-0">
            <Banknote className="h-6 w-6 text-primary-700 dark:text-accent" strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-semibold text-primary-700 dark:text-accent">{t('washer.jobDetail.payoutLabel')}</p>
            <p className="text-[30px] font-extrabold text-primary-700 dark:text-accent leading-none mt-1" dir="ltr">₪{payout}</p>
          </div>
          <span className="text-[11px] font-medium text-primary-700/80 dark:text-accent/80 self-start">{serviceLabel}</span>
        </div>

        {/* ── Decision info ── */}
        <div className="rounded-3xl border border-edge bg-surface-elevated px-4 divide-y divide-edge">
          {vehicleLabel && <InfoRow icon={Car} label={t('washer.jobDetail.info.vehicle')} value={vehicleLabel} />}
          {order.address_label && <InfoRow icon={MapPin} label={t('washer.jobDetail.info.area')} value={order.address_label} />}
          {distanceKm != null && (
            <InfoRow icon={Navigation} label={t('washer.jobDetail.info.distance')} value={t('washer.jobDetail.distanceKm', { km: distanceKm })} />
          )}
          {posted && <InfoRow icon={Clock} label={t('washer.jobDetail.info.posted')} value={posted} />}
        </div>

        {/* ── Bottom action area (pinned low on short screens) ── */}
        <div className="mt-auto flex flex-col gap-4 pt-2">
          <div className="flex items-center gap-2.5 px-1">
            <Lock className="h-4 w-4 text-ink-muted shrink-0" />
            <p className="text-xs text-ink-muted leading-relaxed">{t('washer.jobDetail.accessHidden')}</p>
          </div>

          {!isPending && (
            <div className="rounded-xl bg-warning-500/10 border border-warning-500/30 text-warning-600 dark:text-warning-500 text-sm text-center py-3 px-4">
              {t('washer.jobDetail.unavailable')}
            </div>
          )}

          {isPending && (
            <Editable id="washer.job.acceptCta">
              <button
                onClick={acceptJob}
                disabled={accepting}
                className="w-full h-[54px] rounded-2xl bg-gradient-to-b from-primary-500 to-primary-700 text-white font-extrabold text-[16px] flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ boxShadow: '0 8px 22px rgba(38,181,95,0.40), inset 0 1px 0 rgba(255,255,255,0.3)' }}
              >
                {accepting && <Loader2 className="h-5 w-5 animate-spin" />}
                {accepting ? t('washer.jobDetail.accepting') : t('washer.jobDetail.acceptJob')}
              </button>
            </Editable>
          )}
        </div>
      </div>
    </PageShell>
  )
}
