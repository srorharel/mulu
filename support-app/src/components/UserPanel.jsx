import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { User } from 'lucide-react'
import { fetchUserProfile } from '../lib/support.js'
import { supabase } from '../lib/supabase.js'

export default function UserPanel({ openerId }) {
  const { t } = useTranslation()
  const [profile, setProfile] = useState(null)
  const [recentOrders, setRecentOrders] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!openerId) return
    setLoading(true)
    Promise.all([
      fetchUserProfile(openerId),
      supabase
        .from('orders')
        .select('id, status, car_type, service_type, total_price, created_at')
        .eq('consumer_id', openerId)
        .order('created_at', { ascending: false })
        .limit(5),
    ]).then(([{ data: prof }, { data: orders }]) => {
      setProfile(prof)
      setRecentOrders(orders ?? [])
      setLoading(false)
    })
  }, [openerId])

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-4 border-accent border-t-transparent" />
    </div>
  )

  if (!profile) return null

  return (
    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
      <div className="card flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-accent-muted flex items-center justify-center shrink-0">
          <User className="h-5 w-5 text-accent" />
        </div>
        <div>
          <p className="font-bold text-ink">{profile.full_name || '—'}</p>
          <p className="text-xs text-ink-muted capitalize">{profile.role}</p>
          {profile.phone && (
            <a href={`tel:${profile.phone}`} className="text-xs text-accent hover:underline">
              {profile.phone}
            </a>
          )}
        </div>
      </div>

      {recentOrders.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-ink-muted uppercase tracking-wide mb-2">
            {t('user.recentOrders')}
          </h4>
          <div className="flex flex-col gap-2">
            {recentOrders.map(order => (
              <div key={order.id} className="card text-sm flex justify-between items-center py-2">
                <div>
                  <p className="text-xs text-ink capitalize">{order.status.replace('_', ' ')}</p>
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
