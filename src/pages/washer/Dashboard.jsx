import { useState, useEffect, lazy, Suspense } from 'react'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useGeolocation } from '../../hooks/useGeolocation.js'
import { useToast } from '../../components/ui/Toast.jsx'
import { useNearbyJobs } from '../../hooks/useNearbyJobs.js'
import JobDrawer from '../../components/washer/JobDrawer.jsx'
import OnlineToggle from '../../components/washer/OnlineToggle.jsx'

const WorkerMap = lazy(() => import('../../components/washer/WorkerMap.jsx'))


export default function WasherDashboard() {
  const { profile, refreshProfile } = useAuth()
  const { user }                    = useAuth()
  const showToast                   = useToast()

  const [online, setOnline]           = useState(profile?.is_online ?? false)
  const [toggling, setToggling]       = useState(false)
  const [activeJob, setActiveJob]     = useState(null)   // { id, lat, lng }
  const [selectedJobId, setSelectedJobId] = useState(null) // pin-tap → drawer sync

  // Live GPS — watch mode only while online; falls back to one-shot when offline.
  // useGeolocation tears down watchPosition and runs getCurrentPosition once
  // when watch flips false, then re-mounts watchPosition when it flips true.
  const { position } = useGeolocation({ watch: online })

  const { jobs, loading } = useNearbyJobs(position, online)

  // Broadcast washer position to Supabase whenever GPS updates while online.
  useEffect(() => {
    if (!online || !position) return
    supabase
      .from('profiles')
      .update({ current_location: `POINT(${position.lng} ${position.lat})` })
      .eq('id', user.id)
  }, [position?.lat, position?.lng, online]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch the washer's active job (if any) to draw the polyline route.
  // Uses get_washer_active_job() RPC which extracts lat/lng from the PostGIS geometry.
  // Re-runs when online state changes (going online might reveal an active job).
  useEffect(() => {
    supabase
      .rpc('get_washer_active_job')
      .maybeSingle()
      .then(({ data }) => {
        setActiveJob(data ?? null)
      })
  }, [user.id, online])

  async function toggleOnline() {
    const next = !online
    if (next && !position) {
      showToast('Enable GPS and try again — location is required to go online', 'error')
      return
    }
    setToggling(true)
    const update = next && position
      ? { is_online: true,  current_location: `POINT(${position.lng} ${position.lat})` }
      : { is_online: false, current_location: null }

    const { error } = await supabase.from('profiles').update(update).eq('id', profile.id)
    if (!error) {
      setOnline(next)
      await refreshProfile()
    }
    setToggling(false)
  }

  function handleJobPinTap(jobId) {
    setSelectedJobId(jobId)
    // Clear after a short window so re-tapping the same pin re-triggers the effect.
    setTimeout(() => setSelectedJobId(null), 1000)
  }

  return (
    // Full-viewport container — WasherMapShell provides dark+RTL context.
    // position:relative so WorkerMap's absolute inset fills this layer.
    <div className="relative h-full">
      {/* ── Base layer: full-screen dark map ─────────────────────── */}
      <Suspense fallback={<div className="absolute inset-0 bg-surface" />}>
        <WorkerMap
          washerPosition={position}
          jobs={jobs}
          activeJob={activeJob}
          onJobPinTap={handleJobPinTap}
        />
      </Suspense>

      {/* ── Online/Offline FAB — top-start (RTL: physical right) ─── */}
      <OnlineToggle
        online={online}
        onToggle={toggleOnline}
        disabled={toggling}
      />

      {/* ── Glass drawer — job list with 3 snap points ───────────── */}
      <JobDrawer
        jobs={jobs}
        loading={loading}
        selectedJobId={selectedJobId}
        online={online}
      />
    </div>
  )
}
