import { useState, useEffect, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { User } from 'lucide-react'
import { fetchUserProfile } from '../lib/support.js'
import { supabase } from '../lib/supabase.js'
import { useReverseGeocode } from '../lib/geocode.js'
import i18n from '../i18n'

const MiniMap = lazy(() => import('./MiniMap.jsx'))

function timeAgo(dateStr) {
  if (!dateStr) return null
  const seconds = Math.max(1, Math.round((Date.now() - new Date(dateStr)) / 1000))
  try {
    const rtf = new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' })
    if (seconds < 60)    return rtf.format(-seconds, 'second')
    if (seconds < 3600)  return rtf.format(-Math.round(seconds / 60), 'minute')
    if (seconds < 86400) return rtf.format(-Math.round(seconds / 3600), 'hour')
    return rtf.format(-Math.round(seconds / 86400), 'day')
  } catch { return `${Math.round(seconds / 60)}m ago` }
}

function WasherLocationCard({ washerLoc }) {
  const { t } = useTranslation()
  const address = useReverseGeocode(washerLoc?.lat, washerLoc?.lng)
  const [, setTick] = useState(0)

  // Re-render every minute so "last seen X ago" stays fresh
  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  const hasLoc = washerLoc?.lat != null && washerLoc?.lng != null

  return (
    <div className="rounded-xl border border-edge bg-surface p-3 flex flex-col gap-2">
      <p className={`text-xs text-ink-muted ${i18n.language === 'en' ? 'font-semibold uppercase tracking-wide' : 'font-bold'}`}>
        {t('user.location')}
      </p>
      {hasLoc ? (
        <>
          <Suspense fallback={<div className="h-[150px] rounded-lg bg-surface-elevated animate-pulse" />}>
            <MiniMap lat={washerLoc.lat} lng={washerLoc.lng} />
          </Suspense>
          {address && <p className="text-xs text-ink leading-snug">{address}</p>}
          <p className="text-xs text-ink-muted">
            {t('user.lastSeen', { time: timeAgo(washerLoc.at) })}
          </p>
        </>
      ) : (
        <p className="text-sm text-ink-muted">{t('user.locationUnavailable')}</p>
      )}
    </div>
  )
}

export default function UserPanel({ openerId }) {
  const { t } = useTranslation()
  const [profile, setProfile] = useState(null)
  const [recentOrders, setRecentOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [washerLoc, setWasherLoc] = useState(null)

  useEffect(() => {
    if (!openerId) return
    setLoading(true)
    setProfile(null)
    setWasherLoc(null)
    fetchUserProfile(openerId).then(async ({ data: prof }) => {
      // A washer's job history lives under washer_id — querying consumer_id
      // for a washer-opened conversation returns nothing (or self-bookings).
      const ordersCol = prof?.role === 'washer' ? 'washer_id' : 'consumer_id'
      const { data: orders } = await supabase
        .from('orders')
        .select('id, status, car_type, service_type, total_price, created_at')
        .eq(ordersCol, openerId)
        .order('created_at', { ascending: false })
        .limit(5)
      setProfile(prof)
      setRecentOrders(orders ?? [])
      setLoading(false)
      if (prof?.role === 'washer') {
        setWasherLoc({
          lat: prof.last_lat,
          lng: prof.last_lng,
          at:  prof.last_location_at,
        })
      }
    })
  }, [openerId])

  // Realtime: track washer location updates while panel is open
  useEffect(() => {
    if (!openerId || profile?.role !== 'washer') return
    const ch = supabase
      .channel(`user-panel-loc:${openerId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${openerId}` },
        (payload) => {
          const { last_lat, last_lng, last_location_at } = payload.new
          setWasherLoc({ lat: last_lat, lng: last_lng, at: last_location_at })
        }
      )
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [openerId, profile?.role])

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-4 border-accent border-t-transparent" />
    </div>
  )

  if (!profile) return null

  return (
    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
      <div className="card flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-agent/16 flex items-center justify-center shrink-0">
          <User className="h-5 w-5 text-agent" />
        </div>
        <div>
          <p className="font-bold text-ink">{profile.full_name || '—'}</p>
          <p className="text-xs text-ink-muted capitalize">{t(`role.${profile.role}`)}</p>
          {profile.phone && (
            <a href={`tel:${profile.phone}`} className="text-xs text-accent hover:underline">
              {profile.phone}
            </a>
          )}
        </div>
      </div>

      {profile.role === 'washer' && (
        <WasherLocationCard washerLoc={washerLoc} />
      )}

      {recentOrders.length > 0 && (
        <div>
          <h4 className={`text-xs text-ink-muted mb-2 ${i18n.language === 'en' ? 'font-semibold uppercase tracking-wide' : 'font-bold'}`}>
            {t('user.recentOrders')}
          </h4>
          <div className="flex flex-col gap-2">
            {recentOrders.map(order => (
              <div key={order.id} className="card text-sm flex justify-between items-center py-2">
                <div>
                  <p className="text-xs text-ink capitalize">{t(`orderStatus.${order.status}`)}</p>
                  <p className="text-[11px] text-ink-muted">{order.car_type} · {order.service_type}</p>
                </div>
                <span className="text-accent font-bold text-xs">₪{order.total_price}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
