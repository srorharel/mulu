import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { Car, Phone, Camera } from 'lucide-react'
import { fetchOrderDetails } from '../lib/support.js'
import { supabase } from '../lib/supabase.js'
import { useReverseGeocode } from '../lib/geocode.js'
import Pill from './Pill.jsx'
import PhotoLightbox from './PhotoLightbox.jsx'

const PHOTO_SLOTS = ['front', 'back', 'driver', 'passenger']

const MiniMap = lazy(() => import('./MiniMap.jsx'))

function WasherLocationCard({ washerLoc }) {
  const { t, i18n } = useTranslation()
  const address = useReverseGeocode(washerLoc?.lat, washerLoc?.lng)
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  const hasLoc = washerLoc?.lat != null && washerLoc?.lng != null

  return (
    <div className="rounded-xl border border-edge bg-surface p-3 flex flex-col gap-2">
      <p className={`text-[10.5px] text-ink-subtle font-bold ${i18n.language === 'en' ? 'uppercase tracking-[0.05em]' : 'font-semibold'}`}>
        {t('user.location')}
      </p>
      {hasLoc ? (
        <>
          <Suspense fallback={<div className="h-[150px] rounded-lg bg-surface-elevated animate-pulse" />}>
            <MiniMap lat={washerLoc.lat} lng={washerLoc.lng} />
          </Suspense>
          {address && <p className="text-xs text-ink leading-snug">{address}</p>}
          <p className="text-xs text-ink-muted">
            {t('user.lastSeen', { time: washerLoc.at
              ? new Date(washerLoc.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : '—'
            })}
          </p>
        </>
      ) : (
        <p className="text-sm text-ink-muted">{t('user.locationUnavailable')}</p>
      )}
    </div>
  )
}

// Customer-uploaded vehicle photos (the 4 angles captured at booking), the same
// set the washer sees in JobDrawer. New orders use car_photo_{slot}; legacy orders
// use car_photo_1/2_path. Signed against the `car-photos` bucket on demand.
function CustomerPhotos({ order }) {
  const { t, i18n } = useTranslation()
  const [urls, setUrls]                   = useState(null) // null = loading
  const [lightboxIndex, setLightboxIndex] = useState(null)

  const isNewShape = !!order.car_photo_front

  useEffect(() => {
    let cancelled = false
    async function load() {
      setUrls(null)
      const paths = isNewShape
        ? PHOTO_SLOTS.map(slot => ({ key: slot, path: order[`car_photo_${slot}`] }))
        : [order.car_photo_1_path, order.car_photo_2_path]
            .filter(Boolean)
            .map((path, i) => ({ key: `legacy_${i}`, path }))
      const signed = await Promise.all(
        paths.map(async ({ key, path }) => {
          if (!path) return { key, url: null }
          const { data } = await supabase.storage.from('car-photos').createSignedUrl(path, 3600)
          return { key, url: data?.signedUrl ?? null }
        })
      )
      if (!cancelled) setUrls(Object.fromEntries(signed.map(s => [s.key, s.url])))
    }
    load()
    return () => { cancelled = true }
  }, [order.id, isNewShape]) // eslint-disable-line react-hooks/exhaustive-deps

  // Thumbnails rendered in fixed slot order (new shape) or as captured (legacy)
  const slots = isNewShape
    ? PHOTO_SLOTS.map(slot => ({ key: slot, label: t(`order.photoSlots.${slot}`) }))
    : [order.car_photo_1_path, order.car_photo_2_path]
        .filter(Boolean)
        .map((_, i) => ({ key: `legacy_${i}`, label: '' }))

  // Only resolved (non-null) URLs are navigable in the lightbox
  const lightboxPhotos = useMemo(
    () => slots.map(s => ({ ...s, url: urls?.[s.key] })).filter(p => p.url),
    [slots, urls],
  )

  return (
    <div>
      <p className={`text-[10.5px] text-ink-subtle font-bold ${i18n.language === 'en' ? 'uppercase tracking-[0.05em]' : 'font-semibold'} mb-1.5`}>
        {t('order.customerPhotos')}
      </p>
      <div className={`grid gap-1.5 ${isNewShape ? 'grid-cols-4' : 'grid-cols-2'}`}>
        {slots.map(({ key, label }) => {
          const url = urls?.[key]
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                if (!url) return
                const idx = lightboxPhotos.findIndex(p => p.key === key)
                if (idx >= 0) setLightboxIndex(idx)
              }}
              disabled={!url}
              className={`flex flex-col rounded-xl border overflow-hidden transition-colors ${
                url ? 'border-edge hover:border-agent/50 cursor-pointer' : 'border-edge/40 cursor-default'
              } bg-surface`}
            >
              {urls === null ? (
                <div className="w-full aspect-square animate-pulse bg-surface-elevated" />
              ) : url ? (
                <img src={url} alt={label || t('order.customerPhotos')} className="w-full aspect-square object-cover" />
              ) : (
                <div className="w-full aspect-square flex items-center justify-center opacity-40">
                  <Camera className="h-4 w-4 text-ink-muted" />
                </div>
              )}
              {label && (
                <span className="text-[11px] text-ink-muted font-medium text-center py-1 px-1 truncate">{label}</span>
              )}
            </button>
          )
        })}
      </div>

      <PhotoLightbox
        photos={lightboxPhotos}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
        onNavigate={setLightboxIndex}
      />
    </div>
  )
}

const TERMINAL_ORDER_STATUSES = ['completed', 'cancelled']
const TERMINAL_CONV_STATUSES  = ['resolved', 'closed']

function statusPillColor(status) {
  if (!status) return 'subtle'
  if (status === 'completed')        return 'success'
  if (status === 'cancelled')        return 'danger'
  if (status === 'pending_approval') return 'warning'
  if (['accepted', 'en_route', 'arrived', 'in_progress'].includes(status)) return 'agent'
  return 'subtle'
}

function nameToHue(name = '') {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

function nameInitials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('')
}

function PartyRow({ roleLabel, name, phone, hue, online }) {
  const initials = nameInitials(name || '')
  return (
    <div className="flex items-center gap-2.5 p-2.5 rounded-xl border border-edge bg-surface">
      <div className="relative shrink-0">
        <div
          className="flex items-center justify-center rounded-full text-white font-bold"
          style={{
            width: 36, height: 36, fontSize: 12,
            background: `linear-gradient(135deg, hsl(${hue} 50% 55%), hsl(${(hue + 40) % 360} 50% 35%))`,
          }}
        >
          {initials || '?'}
        </div>
        {online && (
          <span
            className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface"
            style={{ background: 'var(--color-success)' }}
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[9.5px] text-ink-subtle font-bold uppercase tracking-[0.05em]">{roleLabel}</p>
        <p className="text-[13px] font-semibold text-ink leading-snug truncate">{name || '—'}</p>
      </div>
      {phone && (
        <a
          href={`tel:${phone}`}
          className="shrink-0 flex items-center justify-center rounded-lg border border-edge hover:bg-surface-elevated transition-colors"
          style={{ width: 30, height: 30 }}
          aria-label={`Call ${name}`}
        >
          <Phone size={14} className="text-ink-muted" />
        </a>
      )}
    </div>
  )
}

export default function OrderPanel({ orderId, conversationStatus, openerRole }) {
  const { t, i18n } = useTranslation()
  const [order,      setOrder]      = useState(null)
  const [loading,    setLoading]    = useState(false)
  const [confirming, setConfirming] = useState(null) // 'cancel' | 'complete' | null
  const [acting,     setActing]     = useState(false)
  const [toast,      setToast]      = useState(null)

  const load = useCallback(async () => {
    if (!orderId) { setOrder(null); return }
    const { data } = await fetchOrderDetails(orderId)
    setOrder(data)
  }, [orderId])

  useEffect(() => {
    if (!orderId) { setOrder(null); return }
    setLoading(true)
    load().finally(() => setLoading(false))

    const ch = supabase
      .channel(`order-panel-${orderId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        () => load()
      )
      .subscribe()

    return () => supabase.removeChannel(ch)
  }, [orderId, load])

  async function doAction(newStatus) {
    setActing(true)
    const { error } = await supabase.rpc('transition_order_status', {
      order_id:   orderId,
      new_status: newStatus,
    })
    setActing(false)
    setConfirming(null)
    if (error) {
      showToast('error', t('orderActions.error'))
    } else {
      showToast('success', newStatus === 'cancelled'
        ? t('orderActions.toasts.cancelled')
        : t('orderActions.toasts.completed')
      )
      await load()
    }
  }

  async function doSetUnderground(value) {
    setActing(true)
    const { error } = await supabase.rpc('agent_set_order_underground', {
      p_order_id: orderId,
      p_value:    value,
    })
    setActing(false)
    setConfirming(null)
    if (error) {
      showToast('error', t('orderActions.error'))
    } else {
      showToast('success', value
        ? t('orderActions.toasts.marked')
        : t('orderActions.toasts.regular')
      )
      await load()
    }
  }

  function showToast(type, msg) {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3000)
  }

  const showActions = (
    conversationStatus &&
    !TERMINAL_CONV_STATUSES.includes(conversationStatus) &&
    order &&
    !TERMINAL_ORDER_STATUSES.includes(order.status)
  )

  if (!orderId) return (
    <div className="flex-1 flex items-center justify-center p-6">
      <p className="text-sm text-ink-muted">{t('order.noOrder')}</p>
    </div>
  )

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-4 border-agent border-t-transparent" />
    </div>
  )

  if (!order) return null

  const consumerName = order.consumer?.full_name || '—'
  const washerName   = order.washer?.full_name   || '—'
  const plate        = order.car_plate
  const vehicleParts = [order.car_make, order.car_model, order.car_year && String(order.car_year)].filter(Boolean)
  const hasCustomerPhotos = !!(order.car_photo_front || order.car_photo_1_path || order.car_photo_2_path)

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Linked order header */}
      <div className="px-[18px] pt-[16px] pb-3 border-b border-edge">
        <p className={`text-[10.5px] text-ink-subtle font-bold ${i18n.language === 'en' ? 'uppercase tracking-[0.05em]' : 'font-semibold'}`}>
          {t('order.linkedOrder')}
        </p>
        <div className="flex items-center justify-between mt-1">
          <span className="font-mono text-[15px] font-bold text-ink">{order.id?.slice(0, 8)}…</span>
          <div className="flex items-center gap-1.5">
            {order.is_underground_parking && (
              <Pill color="warning" dot>{t('orderActions.underground.badge')}</Pill>
            )}
            <Pill color={statusPillColor(order.status)} dot>
              {t(`orderStatus.${order.status}`)}
            </Pill>
          </div>
        </div>
      </div>

      <div className="px-[14px] py-[14px] flex flex-col gap-3">
        {/* Vehicle */}
        {(plate || vehicleParts.length > 0) && (
          <div className="flex items-start gap-2.5 p-2.5 rounded-xl border border-edge bg-surface">
            <Car size={18} className="text-ink-muted shrink-0 mt-0.5" />
            <div className="min-w-0">
              {plate && (
                <span className="font-mono text-[12px] font-bold text-ink block">{plate}</span>
              )}
              {vehicleParts.length > 0 && (
                <span className="text-[12px] text-ink-muted">{vehicleParts.join(' · ')}</span>
              )}
              {order.car_color && (
                <span className="text-[12px] text-ink-muted ms-1">· {order.car_color}</span>
              )}
            </div>
          </div>
        )}

        {/* Customer-uploaded vehicle photos (same 4 angles the washer sees) */}
        {hasCustomerPhotos && <CustomerPhotos order={order} />}

        {/* Address */}
        {order.address_label && (
          <div>
            <p className="text-[10.5px] text-ink-subtle font-semibold uppercase tracking-[0.04em] mb-1">{t('order.address')}</p>
            <p className="text-[13px] text-ink">{order.address_label}</p>
          </div>
        )}

        {/* Parties */}
        <PartyRow
          roleLabel={t('order.consumer')}
          name={consumerName}
          phone={order.consumer?.phone}
          hue={nameToHue(consumerName)}
        />
        {order.washer && (
          <PartyRow
            roleLabel={t('order.washer')}
            name={washerName}
            phone={order.washer?.phone}
            hue={nameToHue(washerName)}
            online={order.washer?.is_online}
          />
        )}

        {/* Washer live location — shown when conversation was opened by consumer */}
        {openerRole === 'consumer' && order.washer?.last_lat != null && (
          <WasherLocationCard washerLoc={{
            lat: order.washer.last_lat,
            lng: order.washer.last_lng,
            at:  order.washer.last_location_at,
          }} />
        )}

        {/* Pricing */}
        <div className="p-3 rounded-xl border border-edge bg-surface">
          <p className={`text-[10.5px] text-ink-subtle font-bold ${i18n.language === 'en' ? 'uppercase tracking-[0.05em]' : 'font-semibold'} mb-2`}>
            {t('order.pricing')}
          </p>
          <div className="flex justify-between text-[12.5px] text-ink-muted py-0.5">
            <span>{t('order.washerPayout')}</span>
            <span className="font-semibold text-ink">₪{order.payout_amount ?? '—'}</span>
          </div>
          <div className="flex justify-between text-[12.5px] border-t border-edge mt-2 pt-2">
            <span className="text-ink-muted font-semibold">{t('order.consumerTotal')}</span>
            <span className="text-[16px] font-bold text-ink" style={{ letterSpacing: '-0.3px' }}>
              ₪{order.total_price}
            </span>
          </div>
        </div>

        {/* Agent actions */}
        {showActions && (
          <div className="border-t border-edge pt-3 flex flex-col gap-2">
            {confirming === 'cancel' ? (
              <div className="flex flex-col gap-2">
                <p className="text-[12px] font-semibold text-ink">{t('orderActions.cancel.confirmTitle')}</p>
                <p className="text-[12px] text-ink-muted leading-snug">{t('orderActions.cancel.confirmBody')}</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirming(null)} className="btn-ghost text-xs px-2 py-1 flex-1">
                    {t('orderActions.cancel.confirmNo')}
                  </button>
                  <button
                    onClick={() => doAction('cancelled')}
                    disabled={acting}
                    className="flex-1 text-xs font-semibold px-2 py-1 rounded-lg border border-danger/40 text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
                  >
                    {acting ? '…' : t('orderActions.cancel.confirmYes')}
                  </button>
                </div>
              </div>
            ) : confirming === 'complete' ? (
              <div className="flex flex-col gap-2">
                <p className="text-[12px] font-semibold text-ink">{t('orderActions.complete.confirmTitle')}</p>
                <p className="text-[12px] text-ink-muted leading-snug">{t('orderActions.complete.confirmBody')}</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirming(null)} className="btn-ghost text-xs px-2 py-1 flex-1">
                    {t('orderActions.complete.confirmNo')}
                  </button>
                  <button
                    onClick={() => doAction('completed')}
                    disabled={acting}
                    className="flex-1 text-xs font-bold px-2 py-1 rounded-lg text-white disabled:opacity-50"
                    style={{ background: 'var(--color-agent)' }}
                  >
                    {acting ? '…' : t('orderActions.complete.confirmYes')}
                  </button>
                </div>
              </div>
            ) : confirming === 'underground' ? (
              <div className="flex flex-col gap-2">
                <p className="text-[12px] font-semibold text-ink">{t('orderActions.underground.confirmTitle')}</p>
                <p className="text-[12px] text-ink-muted leading-snug">
                  {order.is_underground_parking
                    ? t('orderActions.underground.confirmBodyUnmark')
                    : t('orderActions.underground.confirmBodyMark')}
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirming(null)} className="btn-ghost text-xs px-2 py-1 flex-1">
                    {t('orderActions.underground.confirmNo')}
                  </button>
                  <button
                    onClick={() => doSetUnderground(!order.is_underground_parking)}
                    disabled={acting}
                    className="flex-1 text-xs font-bold px-2 py-1 rounded-lg text-white disabled:opacity-50"
                    style={{ background: 'var(--color-agent)' }}
                  >
                    {acting ? '…' : t('orderActions.underground.confirmYes')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setConfirming('underground')}
                  className="text-[12px] font-bold px-3 py-2.5 rounded-xl border border-edge text-ink hover:bg-surface-elevated transition-colors"
                >
                  {order.is_underground_parking
                    ? t('orderActions.underground.unmark')
                    : t('orderActions.underground.mark')}
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setConfirming('cancel')}
                    className="text-[12px] font-bold px-3 py-2.5 rounded-xl border border-danger/40 text-danger hover:bg-danger/10 transition-colors"
                  >
                    {t('orderActions.cancel.button')}
                  </button>
                  <button
                    onClick={() => setConfirming('complete')}
                    className="text-[12px] font-bold px-3 py-2.5 rounded-xl text-white transition-colors"
                    style={{ background: 'var(--color-agent)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-agent-deep)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-agent)' }}
                  >
                    {t('orderActions.complete.button')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Inline toast */}
      {toast && (
        <div className={`fixed bottom-4 end-4 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-lg z-50 text-white ${
          toast.type === 'success' ? 'bg-agent' : 'bg-danger'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
