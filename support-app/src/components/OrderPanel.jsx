import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Package, User, Droplets, Gauge } from 'lucide-react'
import { fetchOrderDetails } from '../lib/support.js'
import { supabase } from '../lib/supabase.js'

const CAR_LABELS = { sedan: 'Sedan', suv: 'SUV', pickup: 'Pickup', van: 'Van' }
const TERMINAL_ORDER_STATUSES = ['completed', 'cancelled']
const TERMINAL_CONV_STATUSES  = ['resolved', 'closed']

function formatDate(iso) {
  return new Date(iso).toLocaleString()
}

export default function OrderPanel({ orderId, conversationStatus }) {
  const { t } = useTranslation()
  const [order,      setOrder]      = useState(null)
  const [loading,    setLoading]    = useState(false)
  const [confirming, setConfirming] = useState(null) // 'cancel' | 'complete' | null
  const [acting,     setActing]     = useState(false)
  const [toast,      setToast]      = useState(null) // { type: 'success'|'error', msg }

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
      <div className="h-6 w-6 animate-spin rounded-full border-4 border-accent border-t-transparent" />
    </div>
  )

  if (!order) return null

  return (
    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
      <h3 className="font-bold text-ink text-sm">{t('order.title')}</h3>

      {/* Order summary */}
      <div className="card flex flex-col gap-2 text-sm">
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-ink-muted shrink-0" />
          <span className="text-ink">
            {CAR_LABELS[order.car_type]} — {t(`serviceLabels.${order.service_type || 'wash'}`)}
          </span>
        </div>
        <div className="flex justify-between text-ink-muted">
          <span>{t('order.status')}</span>
          <span className="font-medium text-ink capitalize">{order.status.replace('_', ' ')}</span>
        </div>
        <div className="flex justify-between text-ink-muted">
          <span>{t('order.total')}</span>
          <span className="font-bold text-accent">₪{order.total_price}</span>
        </div>
        {order.address_label && (
          <p className="text-xs text-ink-muted pt-1 border-t border-edge">{order.address_label}</p>
        )}
        {(order.addon_wiper_fluid || order.addon_tire_pressure) && (
          <div className="flex gap-2 pt-1 border-t border-edge">
            {order.addon_wiper_fluid    && <span className="flex items-center gap-1 text-xs text-ink-muted"><Droplets className="h-3 w-3" />{t('order.wiperFluid')}</span>}
            {order.addon_tire_pressure && <span className="flex items-center gap-1 text-xs text-ink-muted"><Gauge className="h-3 w-3" />{t('order.tirePressure')}</span>}
          </div>
        )}
      </div>

      {/* Consumer */}
      {order.consumer && (
        <div className="card flex flex-col gap-1.5 text-sm">
          <div className="flex items-center gap-2 mb-1">
            <User className="h-4 w-4 text-ink-muted" />
            <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">{t('order.consumer')}</span>
          </div>
          <p className="font-semibold text-ink">{order.consumer.full_name || '—'}</p>
          {order.consumer.phone && (
            <a href={`tel:${order.consumer.phone}`} className="text-accent text-xs hover:underline">
              {order.consumer.phone}
            </a>
          )}
        </div>
      )}

      {/* Washer */}
      {order.washer && (
        <div className="card flex flex-col gap-1.5 text-sm">
          <div className="flex items-center gap-2 mb-1">
            <User className="h-4 w-4 text-ink-muted" />
            <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">{t('order.washer')}</span>
          </div>
          <p className="font-semibold text-ink">{order.washer.full_name || '—'}</p>
          {order.washer.phone && (
            <a href={`tel:${order.washer.phone}`} className="text-accent text-xs hover:underline">
              {order.washer.phone}
            </a>
          )}
        </div>
      )}

      <p className="text-xs text-ink-muted">{t('order.created')}: {formatDate(order.created_at)}</p>

      {/* Agent order actions */}
      {showActions && (
        <div className="flex flex-col gap-2 pt-3 border-t border-edge">
          {confirming === 'cancel' ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-ink">{t('orderActions.cancel.confirmTitle')}</p>
              <p className="text-xs text-ink-muted leading-snug">{t('orderActions.cancel.confirmBody')}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirming(null)}
                  className="btn-ghost text-xs px-2 py-1 flex-1"
                >
                  {t('orderActions.cancel.confirmNo')}
                </button>
                <button
                  onClick={() => doAction('cancelled')}
                  disabled={acting}
                  className="flex-1 text-xs font-semibold px-2 py-1 rounded-lg border border-red-300 bg-red-50 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50"
                >
                  {acting ? '…' : t('orderActions.cancel.confirmYes')}
                </button>
              </div>
            </div>
          ) : confirming === 'complete' ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-semibold text-ink">{t('orderActions.complete.confirmTitle')}</p>
              <p className="text-xs text-ink-muted leading-snug">{t('orderActions.complete.confirmBody')}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirming(null)}
                  className="btn-ghost text-xs px-2 py-1 flex-1"
                >
                  {t('orderActions.complete.confirmNo')}
                </button>
                <button
                  onClick={() => doAction('completed')}
                  disabled={acting}
                  className="btn-primary text-xs px-2 py-1 flex-1 disabled:opacity-50"
                >
                  {acting ? '…' : t('orderActions.complete.confirmYes')}
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                onClick={() => setConfirming('cancel')}
                className="w-full text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-300/60 text-red-600 hover:bg-red-50 transition-colors"
              >
                {t('orderActions.cancel.button')}
              </button>
              <button
                onClick={() => setConfirming('complete')}
                className="btn-primary text-xs w-full"
              >
                {t('orderActions.complete.button')}
              </button>
            </>
          )}
        </div>
      )}

      {/* Inline toast */}
      {toast && (
        <div className={`fixed bottom-4 end-4 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-lg z-50 ${
          toast.type === 'success' ? 'bg-accent text-white' : 'bg-red-500 text-white'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
