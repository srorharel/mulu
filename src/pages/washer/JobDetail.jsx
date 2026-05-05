import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Car, DollarSign, MapPin, Lock, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase.js'
import { useToast } from '../../components/ui/Toast.jsx'
import PageShell from '../../components/ui/PageShell.jsx'

const CAR_LABELS     = { sedan: 'Sedan', suv: 'SUV', pickup: 'Pickup', van: 'Van' }
const SERVICE_LABELS = { exterior: 'Exterior', interior: 'Interior', full: 'Full Wash' }

export default function JobDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const showToast = useToast()
  const [order, setOrder]         = useState(null)
  const [loading, setLoading]     = useState(true)
  const [accepting, setAccepting] = useState(false)
  const acceptingRef              = useRef(false)
  const [fetchError, setFetchError] = useState('')

  useEffect(() => {
    supabase.from('orders').select('*').eq('id', id).single()
      .then(({ data, error }) => {
        if (error) setFetchError(error.message)
        else setOrder(data)
        setLoading(false)
      })
  }, [id])

  async function acceptJob() {
    if (acceptingRef.current) return
    acceptingRef.current = true
    setAccepting(true)
    const { error } = await supabase.rpc('transition_order_status', {
      order_id: id, new_status: 'accepted',
    })
    acceptingRef.current = false
    setAccepting(false)
    if (error) { showToast(error.message, 'error'); return }
    showToast("Job accepted — let's go!", 'success')
    navigate(`/washer/active/${id}`)
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
        <p className="text-danger-500 text-sm">{fetchError || 'Job not found'}</p>
      </div>
    </PageShell>
  )

  const hasAddons = order.addon_wiper_fluid || order.addon_tire_pressure

  return (
    <PageShell noNav>
      <div className="px-5 pt-6 pb-8 flex flex-col gap-5">
        <button onClick={() => navigate('/washer')} className="flex items-center gap-2 text-ink-muted text-sm -ml-1">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> Back
        </button>

        <h1 className="text-xl font-bold">Job details</h1>

        <div className="card flex flex-col gap-3">
          {/* Car + service */}
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-primary-50 dark:bg-accent-muted p-2">
              <Car className="h-5 w-5 text-primary-500 dark:text-accent" />
            </span>
            <div>
              <p className="font-semibold">{CAR_LABELS[order.car_type]}</p>
              <p className="text-sm text-ink-muted">{SERVICE_LABELS[order.service_type]}</p>
            </div>
          </div>

          {/* Add-ons */}
          {hasAddons && (
            <div className="flex items-center gap-2 text-sm text-ink-muted pl-1">
              <span className="text-xs font-medium text-ink-muted uppercase tracking-wide">Add-ons</span>
              {order.addon_wiper_fluid   && (
                <span className="bg-neutral-100 dark:bg-edge rounded px-2 py-0.5 text-xs dark:text-ink-muted">
                  💧 Wiper Fluid
                </span>
              )}
              {order.addon_tire_pressure && (
                <span className="bg-neutral-100 dark:bg-edge rounded px-2 py-0.5 text-xs dark:text-ink-muted">
                  🛞 Tire Pressure
                </span>
              )}
            </div>
          )}

          {/* Payout */}
          <div className="flex items-center gap-3">
            <span className="rounded-lg bg-primary-50 dark:bg-accent-muted p-2">
              <DollarSign className="h-5 w-5 text-primary-500 dark:text-accent" />
            </span>
            <div>
              <p className="font-semibold">₪{order.base_price} payout</p>
              <p className="text-xs text-ink-muted">Customer pays ₪{order.total_price} incl. platform fee</p>
            </div>
          </div>

          {/* Address */}
          {order.address_label && (
            <div className="flex items-center gap-3">
              <span className="rounded-lg bg-primary-50 dark:bg-accent-muted p-2 shrink-0">
                <MapPin className="h-5 w-5 text-primary-500 dark:text-accent" />
              </span>
              <p className="text-sm text-ink-muted truncate">{order.address_label}</p>
            </div>
          )}

          {/* Site resources */}
          <div className="border-t border-neutral-100 dark:border-edge pt-3 flex items-center gap-3 text-sm flex-wrap">
            <span className="text-xs font-medium text-ink-muted uppercase tracking-wide w-full">Site resources</span>
            <span className={order.site_has_water ? 'text-primary-600 dark:text-accent font-medium' : 'text-ink-muted'}>
              💧 {order.site_has_water ? 'Water available' : 'No water'}
            </span>
            <span className="text-neutral-200 dark:text-edge">·</span>
            <span className={order.site_has_power ? 'text-primary-600 dark:text-accent font-medium' : 'text-ink-muted'}>
              🔌 {order.site_has_power ? 'Power available' : 'Bring own power'}
            </span>
          </div>

          {/* Key location placeholder — hidden until accept */}
          <div className="border-t border-neutral-100 dark:border-edge pt-3 flex items-center gap-3">
            <span className="rounded-lg bg-neutral-50 dark:bg-surface p-2 shrink-0">
              <Lock className="h-5 w-5 text-neutral-300 dark:text-ink-muted" />
            </span>
            <p className="text-sm text-ink-muted italic">Access instructions revealed after accepting.</p>
          </div>
        </div>

        {order.status !== 'pending' && (
          <div className="card bg-warning-50 text-warning-600 text-sm text-center">
            This job is no longer available
          </div>
        )}

        {order.status === 'pending' && (
          <button onClick={acceptJob} disabled={accepting} className="btn-primary mt-auto">
            {accepting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {accepting ? 'Accepting…' : 'Accept Job'}
          </button>
        )}
      </div>
    </PageShell>
  )
}
