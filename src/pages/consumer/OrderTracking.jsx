import { useState, useEffect, Fragment, lazy, Suspense } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, MessageCircle, MessageSquare, Phone, Star, Check, ParkingSquare } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase.js'
import IsraeliPlate from '../../components/ui/IsraeliPlate.jsx'
import { formatPlate } from '../../lib/formatPlate.js'
import { useRealtimeOrder } from '../../hooks/useRealtimeOrder.js'
import { useReverseGeocode, looksLikeCoords } from '../../lib/geocode.js'
import { useToast } from '../../components/ui/Toast.jsx'
import SupportChatSheet from '../../components/support/SupportChatSheet.jsx'
import OrderChatSheet from '../../components/chat/OrderChatSheet.jsx'
import { FEATURES } from '../../lib/featureFlags.js'
import { useCall } from '../../context/CallContext.jsx'
import ConfirmDialog from '../../components/ui/ConfirmDialog.jsx'
import TipCard from '../../components/consumer/TipCard.jsx'
import { cancellationFeeFor } from '../../lib/pricing.js'
import { getOrCreateOrderConversation } from '../../lib/support.js'
import { useOrderUnreadCount } from '../../hooks/useOrderUnreadCount.js'
import { useOrderWasherTracking } from '../../hooks/useOrderWasherTracking.js'
import MapBG from '../../components/ui/MapBG.jsx'
import Editable from '../../components/editable/Editable.jsx'

// Lazy so Leaflet stays out of the eagerly-loaded main bundle (OrderTracking is a
// static router import) — mirrors how WorkerMap/MapPicker are lazy-loaded.
const OrderTrackingMap = lazy(() => import('../../components/consumer/OrderTrackingMap.jsx'))

// Consumer Terms §7.1–7.2: free to cancel while pending/accepted; cancellable
// with a 50 ₪ fee once the washer is en_route/arrived (the fee is enforced
// server-side in transition_order_status — migration 0116).
const CANCELLABLE     = new Set(['pending', 'accepted', 'en_route', 'arrived'])
const CANCEL_FEE_SET  = new Set(['en_route', 'arrived'])

const STATUS_TO_STEP = {
  pending: 0, accepted: 1, en_route: 2, arrived: 2,
  in_progress: 3, pending_approval: 3, completed: 4, cancelled: -1,
}

const ACTIVE_STATUSES = new Set(['accepted', 'en_route', 'arrived', 'in_progress', 'pending_approval'])

// Statuses during which a washer-ETA makes sense (still travelling / just arrived).
// Once in_progress the washer is on-site washing, so no "min away" is shown.
const ETA_STATUSES = new Set(['accepted', 'en_route', 'arrived'])

// Terminal statuses — the order is done; no "book another car" prompt.
const TERMINAL_STATUSES = new Set(['completed', 'cancelled'])

// Session-dismiss key — mirrors ConsumerLayout so we don't double-pop the modal
// when the consumer is already on this screen watching the status change.
const sessionDismissKey = (orderId) => `rating_modal_dismissed_${orderId}`

function getWasherInitials(profile) {
  const name = profile?.full_name || ''
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return 'W'
}

// ── 5-step horizontal progress dots ──────────────────────────────────────────
function TrackingDots({ status, t }) {
  const steps = [
    { id: 'requested', label: t('consumer.tracking.step.requested') },
    { id: 'assigned',  label: t('consumer.tracking.step.assigned')  },
    { id: 'enRoute',   label: t('consumer.tracking.step.enRoute')   },
    { id: 'washing',   label: t('consumer.tracking.step.washing')   },
    { id: 'complete',  label: t('consumer.tracking.step.complete')  },
  ]
  const currentStep = STATUS_TO_STEP[status] ?? 0

  return (
    <div className="flex items-center gap-1.5 px-1">
      {steps.map((step, i) => {
        const done   = i < currentStep
        const active = i === currentStep
        return (
          <Fragment key={step.id}>
            <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
              <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                done   ? 'bg-primary-600' :
                active ? 'bg-primary-600 ring-[3px] ring-primary-200' :
                         'bg-edge'
              }`}>
                {done && <Check className="h-[9px] w-[9px] text-white" strokeWidth={4} />}
              </div>
              <p className={`text-[9.5px] leading-tight text-center ${
                active ? 'font-bold text-ink' : 'font-medium text-ink-muted'
              }`}>{step.label}</p>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-[0.3] h-0.5 rounded-full mb-4 shrink-0 ${done ? 'bg-primary-500' : 'bg-edge'}`} />
            )}
          </Fragment>
        )
      })}
    </div>
  )
}

// ── Washer info card — ADR-018: no rating shown to consumer ──────────────────
function WasherCard({ profile, orderId, onMessage, openingMessage, onOrderChat, chatDisabled, unreadCount, t }) {
  const initials    = getWasherInitials(profile)
  const name        = profile?.full_name || t('consumer.tracking.washer.unknown')
  const washerPhone = profile?.phone || null
  const { startCall } = useCall()

  return (
    <div className="flex items-center gap-3 p-3 bg-primary-50 dark:bg-accent-muted rounded-glass-sm">
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0 border-2 border-white shadow-sm"
        style={{ background: 'linear-gradient(135deg, #9CDEB6, #26B55F)' }}
      >
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-bold text-ink truncate">{name}</p>
      </div>
      <div className="flex gap-2 shrink-0">
        {/* Support chat: consumer → agent */}
        <button
          onClick={onMessage}
          disabled={openingMessage}
          aria-label={t('consumer.tracking.washer.message')}
          className="w-10 h-10 rounded-[12px] bg-white dark:bg-surface-elevated flex items-center justify-center text-primary-800 shadow-sm"
        >
          <MessageCircle className="h-[18px] w-[18px]" />
        </button>
        {/* Order chat: consumer ↔ washer */}
        <button
          onClick={onOrderChat}
          disabled={chatDisabled}
          aria-label={t('consumer.tracking.washer.chatWasher')}
          className={`relative w-10 h-10 rounded-[12px] bg-white flex items-center justify-center text-primary-800 shadow-sm transition-opacity ${chatDisabled ? 'opacity-40' : ''}`}
        >
          <MessageSquare className="h-[18px] w-[18px]" />
          {unreadCount > 0 && !chatDisabled && (
            <span className="absolute top-0.5 end-0.5 w-2.5 h-2.5 rounded-full bg-danger-500 shrink-0" />
          )}
        </button>
        {/* Call washer. With in-app calls ON: a masked WebRTC call (no real
            number exposed). With the flag OFF: the existing tel: link. */}
        {FEATURES.inAppCalls ? (
          profile?.id ? (
            <button
              onClick={() => startCall({ peerId: profile.id, peerName: name, orderId })}
              disabled={chatDisabled}
              aria-label={t('call.callWasher')}
              className={`w-10 h-10 rounded-[12px] bg-white flex items-center justify-center text-primary-800 shadow-sm transition-opacity ${chatDisabled ? 'opacity-40' : ''}`}
            >
              <Phone className="h-[18px] w-[18px]" />
            </button>
          ) : null
        ) : washerPhone ? (
          <a
            href={chatDisabled ? undefined : `tel:${washerPhone}`}
            aria-label={t('consumer.tracking.washer.callWasher')}
            className={`w-10 h-10 rounded-[12px] bg-white flex items-center justify-center text-primary-800 shadow-sm transition-opacity ${chatDisabled ? 'opacity-40 pointer-events-none' : ''}`}
          >
            <Phone className="h-[18px] w-[18px]" />
          </a>
        ) : null}
      </div>
    </div>
  )
}

function CheckBadge() {
  return (
    <div className="w-[22px] h-[22px] rounded-full bg-primary-500 flex items-center justify-center shadow-[0_1px_3px_rgba(38,181,95,0.4)] shrink-0">
      <Check className="h-[11px] w-[11px] text-white" strokeWidth={3.5} />
    </div>
  )
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function OrderTracking() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { order, loading, error } = useRealtimeOrder(id)
  const showToast = useToast()
  const { t } = useTranslation()

  const [cancelling, setCancelling]         = useState(false)
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  const [supportConvId, setSupportConvId]   = useState(null)
  const [supportOpen, setSupportOpen]       = useState(false)
  const [openingSupport, setOpeningSupport] = useState(false)
  const [orderChatOpen, setOrderChatOpen]   = useState(false)
  const [washerProfile, setWasherProfile]   = useState(null)
  const [prevStatus, setPrevStatus]         = useState(null)

  const chatDisabled = order && ['pending_approval', 'completed', 'cancelled'].includes(order.status)
  const unreadCount  = useOrderUnreadCount(order?.id)

  // Live washer position + ETA (polls the scoped get_order_washer_location RPC).
  const { location: washerLocation, etaMin, stale: locationStale } = useOrderWasherTracking({
    orderId: id,
    status:  order?.status,
    jobLat:  order?.lat,
    jobLng:  order?.lng,
  })

  useEffect(() => {
    if (!order?.washer_id) { setWasherProfile(null); return }
    supabase
      .from('profiles')
      .select('id, full_name, phone')
      .eq('id', order.washer_id)
      .single()
      .then(({ data }) => setWasherProfile(data ?? null))
  }, [order?.washer_id])

  // When the order transitions to completed while the consumer is watching,
  // clear session-dismiss so ConsumerLayout fires the rating modal.
  useEffect(() => {
    if (!order?.id) return
    if (prevStatus !== null && prevStatus !== 'completed' && order.status === 'completed') {
      sessionStorage.removeItem(sessionDismissKey(order.id))
    }
    setPrevStatus(order.status)
  }, [order?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  const isLegacyAddress = looksLikeCoords(order?.address_label)
  const { address: geocodedAddress } = useReverseGeocode(
    isLegacyAddress ? order?.lat : null,
    isLegacyAddress ? order?.lng : null,
  )
  const displayAddress = isLegacyAddress
    ? (geocodedAddress ?? order?.address_label)
    : order?.address_label

  async function handleOpenSupport() {
    setOpeningSupport(true)
    const counterpartyId = order?.washer_id || null
    const { data, error: err } = await getOrCreateOrderConversation(id, counterpartyId)
    setOpeningSupport(false)
    if (err || !data) { showToast(t('support.errors.createFailed'), 'error'); return }
    setSupportConvId(data.id)
    setSupportOpen(true)
  }

  async function handleCancel() {
    // Capture the fee-bearing status before the row flips to 'cancelled'.
    const fee = cancellationFeeFor(order?.status, order?.total_price)
    setCancelling(true)
    const { error: rpcError } = await supabase.rpc('transition_order_status', {
      order_id: id, new_status: 'cancelled',
    })
    setCancelling(false)
    if (rpcError) { showToast(rpcError.message, 'error'); return }
    showToast(
      fee > 0
        ? t('consumer.tracking.cancelledWithFee', { fee })
        : t('consumer.tracking.cancelled'),
      'success',
    )
    navigate('/history')
  }

  const cancelFee = cancellationFeeFor(order?.status, order?.total_price)

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-surface">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    )
  }

  if (error || !order) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 p-6 bg-surface">
        <p className="text-danger-500 text-sm">{error ?? t('consumer.tracking.orderNotFound')}</p>
        <button onClick={() => navigate('/history')} className="btn-primary">
          {t('consumer.tracking.back')}
        </button>
      </div>
    )
  }

  const isActive        = ACTIVE_STATUSES.has(order.status)
  const washerFirstName = washerProfile?.full_name?.split(' ')[0] || t('consumer.tracking.washer.unknown')
  const heading  = t(`consumer.tracking.heading.${order.status}`,  { defaultValue: order.status })
  const subtitle = t(`consumer.tracking.subtitle.${order.status}`, { name: washerFirstName, defaultValue: '' })
  const categoryLabel   = order.category ? t(`carLabels.${order.category}`) : null

  return (
    <div className="h-full flex flex-col bg-surface">

      {/* ── Map area ─────────────────────────────────────────────────────── */}
      {/* `isolate` keeps the z-[400] fade gradient + overlays contained — without
          it they escape this (un-z-indexed) div and paint over the bottom sheet. */}
      <div className="relative isolate shrink-0 overflow-hidden h-[55vh] min-h-[200px]">
        <Suspense fallback={<MapBG className="absolute inset-0 w-full h-full" />}>
          <OrderTrackingMap
            jobLat={order.lat}
            jobLng={order.lng}
            washerLocation={washerLocation}
          />
        </Suspense>

        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-b from-transparent to-surface pointer-events-none z-[400]" />

        <div
          className="absolute start-4 end-4 flex items-center justify-between z-20"
          style={{ top: 'max(1rem, env(safe-area-inset-top, 1rem))' }}
        >
          <button
            onClick={() => navigate(-1)}
            aria-label={t('consumer.tracking.back')}
            className="w-10 h-10 rounded-[14px] bg-white/85 backdrop-blur-[14px] flex items-center justify-center shadow-sm text-ink"
          >
            <ArrowLeft className="h-5 w-5 rtl:rotate-180" />
          </button>

          {isActive && (
            <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/85 backdrop-blur-[14px] shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-600 shadow-[0_0_0_3px_rgba(71,209,127,0.25)]" />
              <span className="text-[12px] font-bold text-primary-800">{t('consumer.tracking.live')}</span>
            </div>
          )}
        </div>

        {isActive && (
          <div className="absolute left-1/2 -translate-x-1/2 z-20" style={{ top: 72 }}>
            <div className={`flex items-center gap-2 px-4 py-2.5 rounded-full shadow-[0_6px_20px_rgba(0,0,0,0.10),0_0_0_1px_rgba(0,0,0,0.04)] ${
              order.status === 'arrived' ? 'bg-primary-50 dark:bg-accent-muted' : 'bg-white dark:bg-surface-elevated'
            }`}>
              <span className={`w-2 h-2 rounded-full shrink-0 ${order.status === 'arrived' ? 'bg-primary-700' : 'bg-primary-500'}`} />
              <p className={`text-[14px] font-bold tracking-[-0.2px] ${order.status === 'arrived' ? 'text-primary-700' : 'text-ink'}`}>
                {t(`consumer.tracking.eta_pill.${order.status}`, t('consumer.tracking.eta_pill.accepted'))}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom sheet ─────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto bg-surface-elevated rounded-t-[28px] shadow-[0_-8px_30px_rgba(0,0,0,0.12)] -mt-7 relative z-10">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-edge" />
        </div>

        <div className="px-4 pb-8 flex flex-col gap-4">
          {/* Status heading */}
          <Editable id="consumer.tracking.statusCard">
          <div className="pt-1">
            <p className="text-[12px] font-semibold text-primary-700 uppercase tracking-[0.3px] leading-none">
              {heading}
            </p>
            {subtitle ? (
              <p className="text-[20px] font-extrabold text-ink tracking-[-0.4px] mt-1 leading-tight">
                {subtitle}
              </p>
            ) : null}
          </div>
          </Editable>

          {/* Live washer ETA — straight-line/avg-speed estimate (v1). */}
          {ETA_STATUSES.has(order.status) && (locationStale || etaMin != null) && (
            <div className="flex items-center gap-1.5 self-start px-3 py-1.5 rounded-full bg-primary-50 dark:bg-accent-muted border border-primary-200/60 dark:border-accent/30">
              <span className="w-1.5 h-1.5 rounded-full bg-primary-500 shrink-0" />
              <span className="text-[13px] font-bold text-primary-700 dark:text-accent">
                {locationStale
                  ? t('consumer.tracking.locating')
                  : t('consumer.tracking.etaAway', { min: etaMin })}
              </span>
            </div>
          )}

          {order.is_underground_parking && (
            <div className="flex items-center gap-1.5 self-start px-2.5 py-1 rounded-full bg-primary-50 dark:bg-accent-muted border border-primary-200/60 dark:border-accent/30">
              <ParkingSquare className="h-3.5 w-3.5 text-primary-700 dark:text-accent shrink-0" />
              <span className="text-[11px] font-bold text-primary-700 dark:text-accent">{t('consumer.tracking.underground')}</span>
            </div>
          )}

          <TrackingDots status={order.status} t={t} />

          {(order.car_plate || order.car_make) && (
            <div
              className="rounded-glass p-3.5 bg-white dark:bg-surface-elevated border border-edge"
              data-testid="vehicle-card"
            >
              <div className="flex items-center gap-3 justify-between">
                {/* RTL leading: badge + label */}
                <div className="flex items-center gap-2 shrink-0">
                  <CheckBadge />
                  <span className="text-primary-500 text-sm font-medium whitespace-nowrap">
                    {t('order.vehicle')}
                  </span>
                </div>

                {/* Middle: horizontal details, single string, allowed to truncate */}
                <div className="flex-1 min-w-0 text-end">
                  <p className="truncate text-ink font-semibold tabular-nums">
                    {[order.car_make, order.car_model, order.car_year, order.car_color, categoryLabel]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>

                {/* LTR leading: plate, vertically centered with row */}
                <div className="shrink-0" dir="ltr">
                  <IsraeliPlate number={formatPlate(order.car_plate)} />
                </div>
              </div>
            </div>
          )}

          {order.washer_id && (
            <WasherCard
              profile={washerProfile}
              orderId={id}
              onMessage={handleOpenSupport}
              openingMessage={openingSupport}
              onOrderChat={() => setOrderChatOpen(true)}
              chatDisabled={!!chatDisabled}
              unreadCount={unreadCount}
              t={t}
            />
          )}

          {/* Pending approval — awaiting verification banner */}
          {order.status === 'pending_approval' && (
            <div className="rounded-glass p-5 text-center bg-primary-50/50 dark:bg-accent-muted/50 border border-primary-200/50">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-primary-500/10 flex items-center justify-center">
                <div className="h-5 w-5 animate-spin rounded-full border-[2.5px] border-primary-500 border-t-transparent" />
              </div>
              <p className="text-[15px] font-bold text-ink">{t('consumer.tracking.pendingApproval.title')}</p>
              <p className="text-sm text-ink-muted mt-1.5 max-w-xs mx-auto">{t('consumer.tracking.pendingApproval.body')}</p>
              <p className="text-xs text-ink-muted/70 mt-3">{t('consumer.tracking.pendingApproval.helper')}</p>
            </div>
          )}

          {/* Completed banner */}
          {order.status === 'completed' && (
            <div className="rounded-glass p-4 text-center bg-primary-50 dark:bg-accent-muted border border-primary-200">
              <p className="font-semibold text-primary-700">{t('consumer.tracking.completed')}</p>
            </div>
          )}

          {/* Tip the washer — gratuity, stored separately from the wash price (§6.7) */}
          {order.status === 'completed' && order.washer_id && (
            <TipCard order={order} />
          )}

          {/* Read-only rating badge — shown after consumer has rated */}
          {order.rated_at && (
            <div className="flex items-center justify-center gap-1.5 py-2">
              {[1,2,3,4,5].map(n => (
                <Star
                  key={n}
                  className="h-4 w-4 text-warning-500"
                  fill="currentColor"
                />
              )).slice(0, 5)}
              <span className="text-[12px] text-ink-muted ms-1">
                {t('rating.already.submitted', { stars: '…' })}
              </span>
            </div>
          )}

          {/* Cancelled banner */}
          {order.status === 'cancelled' && (
            <div className="rounded-glass p-4 text-center bg-danger-50 border border-danger-200">
              <p className="font-semibold text-danger-600">{t('consumer.tracking.cancelled')}</p>
              {order.cancellation_reason && (
                <p className="text-sm text-ink-muted mt-1">{order.cancellation_reason}</p>
              )}
            </div>
          )}

          {displayAddress && (
            <p className="text-[12px] text-ink-muted text-center px-4 leading-snug">
              {displayAddress}
            </p>
          )}

          <div className="flex flex-col gap-3 pt-1 pb-2">
            {/* Secondary, non-destructive: book another wash while this order runs. */}
            {!TERMINAL_STATUSES.has(order.status) && (
              <button
                onClick={() => navigate('/home')}
                className="w-full rounded-glass py-3 text-[14px] font-bold text-primary-700 dark:text-accent bg-primary-50 dark:bg-accent-muted border border-primary-200/60 dark:border-accent/30 active:scale-[0.99] transition"
              >
                {t('consumer.tracking.anotherCar')}
              </button>
            )}
            <div className="flex items-center justify-between">
              {CANCELLABLE.has(order.status) ? (
                <button
                  onClick={() => setCancelConfirmOpen(true)}
                  disabled={cancelling}
                  className="text-[13px] font-semibold text-danger-500 disabled:opacity-50 text-start"
                >
                  {cancelling ? t('consumer.tracking.cancelling') : t('consumer.tracking.cancelOrder')}
                </button>
              ) : (
                <div />
              )}
              <div className="text-end">
                <p className="text-[11px] text-ink-muted font-medium">{t('consumer.tracking.total')}</p>
                <p className="text-[16px] font-extrabold text-ink tracking-[-0.3px]">₪{order.total_price}</p>
                {Number(order.discount_amount) > 0 && (
                  <p className="text-[11px] font-semibold text-primary-600 dark:text-accent">
                    {t('consumer.tracking.firstWashDiscount', {
                      percent: order.discount_percent,
                      amount:  Number(order.discount_amount),
                    })}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={cancelConfirmOpen}
        onConfirm={() => { setCancelConfirmOpen(false); handleCancel() }}
        onCancel={() => setCancelConfirmOpen(false)}
        title={t('consumer.tracking.cancelConfirm.title')}
        message={cancelFee > 0
          ? t('consumer.tracking.cancelConfirm.messageFee', { fee: cancelFee })
          : t('consumer.tracking.cancelConfirm.messageFree')}
        confirmLabel={t('consumer.tracking.cancelConfirm.confirm')}
        cancelLabel={t('consumer.tracking.cancelConfirm.keep')}
        destructive
      />

      <SupportChatSheet
        open={supportOpen}
        convId={supportConvId}
        onClose={() => setSupportOpen(false)}
      />
      <OrderChatSheet
        open={orderChatOpen}
        orderId={order?.id}
        orderStatus={order?.status}
        otherPartyName={washerProfile?.full_name || t('consumer.tracking.washer.unknown')}
        onClose={() => setOrderChatOpen(false)}
      />
    </div>
  )
}
