import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase.js'

export function useNearbyJobs(position, enabled = true) {
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function fetchJobs(lat, lng) {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase.rpc('nearby_jobs', {
      washer_lat: lat,
      washer_lng: lng,
      radius_km: 15,
    })
    if (error) setError(error.message)
    else setJobs(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (!position || !enabled) return
    fetchJobs(position.lat, position.lng)

    const channel = supabase
      .channel('pending_orders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: "status=eq.pending" },
        () => fetchJobs(position.lat, position.lng)
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [position?.lat, position?.lng, enabled])

  return { jobs, loading, error, refresh: () => position && fetchJobs(position.lat, position.lng) }
}
