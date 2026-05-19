import { useState, useEffect, Fragment } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, MessageCircle, MessageSquare, Phone, Star, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase.js'
import { useRealtimeOrder } from '../../hooks/useRealtimeOrder.js'
import { useReverseGeocode, looksLikeCoords } from '../../lib/geocode.js'
import { useToast } from '../../components/ui/Toast.jsx'
import SupportChatSheet from '../../components/support/SupportChatSheet.jsx'
import OrderChatSheet from '../../components/chat/OrderChatSheet.jsx'
import { getOrCreateOrderConversation } from '../../lib/support.js'
import { useOrderUnreadCount } from '../../hooks/useOrderUnreadCount.js'
import MapBG from '../../components/ui/MapBG.jsx'

const CANCELLABLE = new Set(['pending', 'accepted'])

const STATUS_TO_STEP = {
  pending: 0, accepted: 1, en_route: 2, arrived: 2,
  in_progress: 3, pending_approval: 3, completed: 4, cancelled: -1,
}

const ACTIVE_STATUSES = new Set(['accepted', 'en_route', 'arrived', 'in_progress', 'pending_approval'])

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
function WasherCard({ profile, onMessage, openingMessage, onOrderChat, chatDisabled, unreadCount, t }) {
  const initials    = getWasherInitials(profile)
  const name        = profile?.full_name || t('consumer.tracking.washer.unknown')
  const washerPhone = profile?.phone || null

  return (
    <div className="flex items-center gap-3 p-3 bg-primary-50 rounded-glass-sm">
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
          className="w-10 h-10 rounded-[12px] bg-white flex items-center justify-center text-primary-800 shadow-sm"
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
        {/* Call washer — only rendered when phone is known */}
        {washerPhone ? (
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

// ── Main screen ───────────────────────────────────────────────────────────────
export default function OrderTracking() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { order, loading, error } = useRealtimeOrder(id)
  const showToast = useToast()
  const { t } = useTranslation()

  const [cancelling, setCancelling]         = useState(false)
  const [supportConvId, setSupportConvId]   = useState(null)
  const [supportOpen, setSupportOpen]       = useState(false)
  const [openingSupport, setOpeningSupport] = useState(false)
  const [orderChatOpen, setOrderChatOpen]   = useState(false)
  const [washerProfile, setWasherProfile]   = useState(null)
  const [prevStatus, setPrevStatus]         = useState(null)

  const chatDisabled = order && ['pending_approval', 'completed', 'cancelled'].includes(order.status)
  const unreadCount  = useOrderUnreadCount(order?.id)

  useEffect(() => {
    if (!order?.washer_id) { setWasherProfile(null); return }
    supabase
      .from('profiles')
      .select('id, full_name, phone')
      .eq('id', order.washer_id)
      .single()
      .then(({ data }) => setWasherProfile(data ?? null))
  }, [order?.washer_id])

  // When the order transitions to pending_approval while the consumer is watching,
  // mark this order so ConsumerLayout fires the modal immediately on its next realtime event.
  // ConsumerLayout's realtime listener handles the actual modal open; we just clear any
  // session-dismiss so it isn't suppressed.
  useEffect(() => {
    if (!order?.id) return
    if (prevStatus !== null && prevStatus !== 'pending_approval' && order.status === 'pending_approval') {
      // Clear any prior session-dismiss so the modal shows
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
    setCancelling(true)
    const { error: rpcError } = await supabase.rpc('transition_order_status', {
      order_id: id, new_status: 'cancelled',
    })
    setCancelling(false)
    if (rpcError) { showToast(rpcError.message, 'error'); return }
    showToast(t('consumer.tracking.cancelled'), 'success')
    navigate('/history')
  }

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

  return (
    <div className="h-full flex flex-col bg-white">

      {/* ── Map area ─────────────────────────────────────────────────────── */}
      <div className="relative shrink-0 overflow-hidden h-[55vh] min-h-[200px]">
        <MapBG className="absolute inset-0 w-full h-full" />

        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 390 600"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          <path d="M 75 355 Q 135 285 180 250 T 210 195"
            stroke="#26B55F" strokeWidth="4" strokeLinecap="round" fill="none" />
          <path d="M 75 355 Q 135 285 180 250 T 210 195"
            stroke="white" strokeWidth="1.5" strokeLinecap="round"
            fill="none" strokeDasharray="2 6" />
          <g transform="translate(210,195)">
            <circle r="20" fill="rgba(125,217,162,0.22)" />
            <circle r="13" fill="white" stroke="#26B55F" strokeWidth="2" />
            <circle r="4" fill="#26B55F" />
          </g>
          <g transform="translate(75,355)">
            <circle r="20" fill="#26B55F" stroke="white" strokeWidth="3" />
            <text y="5" textAnchor="middle" fontSize="13" fill="white" fontWeight="800"
              fontFamily="Inter,system-ui,sans-serif">
              {getWasherInitials(washerProfile)}
            </text>
          </g>
        </svg>

        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-b from-transparent to-white pointer-events-none" />

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
              order.status === 'arrived' ? 'bg-primary-50' : 'bg-white'
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
      <div className="flex-1 min-h-0 overflow-y-auto bg-white rounded-t-[28px] shadow-[0_-8px_30px_rgba(0,0,0,0.12)] -mt-7 relative z-10">
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-edge" />
        </div>

        <div className="px-4 pb-8 flex flex-col gap-4">
          {/* Status heading */}
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

          <TrackingDots status={order.status} t={t} />

          {order.washer_id && (
            <WasherCard
              profile={washerProfile}
              onMessage={handleOpenSupport}
              openingMessage={openingSupport}
              onOrderChat={() => setOrderChatOpen(true)}
              chatDisabled={!!chatDisabled}
              unreadCount={unreadCount}
              t={t}
            />
          )}

          {/* Completed banner */}
          {order.status === 'completed' && (
            <div className="rounded-glass p-4 text-center bg-primary-50 border border-primary-200">
              <p className="font-semibold text-primary-700">{t('consumer.tracking.completed')}</p>
            </div>
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

          <div className="flex items-center justify-between pt-1 pb-2">
            {CANCELLABLE.has(order.status) ? (
              <button
                onClick={handleCancel}
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
            </div>
          </div>
        </div>
      </div>

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
