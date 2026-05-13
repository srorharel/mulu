import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Package, User, Droplets, Gauge } from 'lucide-react'
import { fetchOrderDetails } from '../lib/support.js'

const CAR_LABELS    = { sedan: 'Sedan', suv: 'SUV', pickup: 'Pickup', van: 'Van' }
const SERVICE_LABELS = { exterior: 'Exterior', interior: 'Interior', full: 'Full Wash' }

function formatDate(iso) {
  return new Date(iso).toLocaleString()
}

export default function OrderPanel({ orderId }) {
  const { t } = useTranslation()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!orderId) { setOrder(null); return }
    setLoading(true)
    fetchOrderDetails(orderId).then(({ data }) => { setOrder(data); setLoading(false) })
  }, [orderId])

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
            {CAR_LABELS[order.car_type]} — {SERVICE_LABELS[order.service_type]}
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
    </div>
  )
}
