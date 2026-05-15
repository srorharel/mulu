import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useGeolocation } from '../../hooks/useGeolocation.js'
import { useToast } from '../../components/ui/Toast.jsx'
import { useNearbyJobs } from '../../hooks/useNearbyJobs.js'
import JobDrawer from '../../components/washer/JobDrawer.jsx'
import WasherMenu from '../../components/washer/WasherMenu.jsx'
import NavLauncher from '../../components/washer/NavLauncher.jsx'
import MapBG from '../../components/ui/MapBG.jsx'

const WorkerMap = lazy(() => import('../../components/washer/WorkerMap.jsx'))

const SPRING = { type: 'spring', stiffness: 300, damping: 28 }

// Dark-glass pill: washer avatar + online/offline toggle + menu trigger.
// Tapping the left area (avatar + status text) calls onToggle.
// Tapping the ··· icon on the right calls onMenuOpen.
function OnlinePill({ online, toggling, profile, user, onToggle, onMenuOpen, t }) {
  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : (user?.email?.[0] ?? '?').toUpperCase()

  const PILL_STYLE = {
    background: 'rgba(26,29,39,0.70)',
    backdropFilter: 'blur(16px) saturate(160%)',
    WebkitBackdropFilter: 'blur(16px) saturate(160%)',
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
  }

  return (
    <div className="flex items-center rounded-full overflow-hidden shrink-0" style={PILL_STYLE}>
      {/* Toggle area: avatar + status */}
      <button
        onClick={onToggle}
        disabled={toggling}
        aria-label={t('washer.toggle.ariaLabel')}
        className="flex items-center gap-2.5 ps-2 pe-3 py-2 disabled:opacity-70"
      >
        <div
          className="w-[34px] h-[34px] rounded-full flex items-center justify-center text-white font-bold text-[13px] shrink-0"
          style={{
            background: 'radial-gradient(circle at 35% 30%, #B9E5CB, #26B55F)',
            border: '2px solid rgba(255,255,255,0.15)',
          }}
        >
          {initials}
        </div>
        <div className="text-start">
          <p className="text-[12px] leading-none" style={{ color: 'rgba(163,163,163,1)', fontWeight: 500 }}>
            {t('washer.dashboard.youre')}
          </p>
          <div className="flex items-center gap-1.5 mt-[5px]">
            <span
              className="w-[7px] h-[7px] rounded-full shrink-0"
              style={{
                background: online ? '#7DD9A2' : '#737373',
                boxShadow: online ? '0 0 8px #7DD9A2' : 'none',
              }}
            />
            <span className="text-[14px] font-bold text-white leading-none">
              {toggling ? '…' : online ? t('washer.toggle.online') : t('washer.toggle.offline')}
            </span>
          </div>
        </div>
      </button>

      {/* Divider */}
      <div className="w-px h-8 shrink-0" style={{ background: 'rgba(255,255,255,0.10)' }} />

      {/* Menu trigger */}
      <button
        onClick={onMenuOpen}
        aria-label={t('washer.dashboard.openMenu')}
        className="px-3 py-2 flex items-center justify-center"
      >
        <Menu className="h-4 w-4" style={{ color: 'rgba(255,255,255,0.55)' }} />
      </button>
    </div>
  )
}

// ADR-015: static placeholder — no DB query for today's earnings.
function EarningsWidget({ t }) {
  const WIDGET_STYLE = {
    background: 'rgba(26,29,39,0.70)',
    backdropFilter: 'blur(16px) saturate(160%)',
    WebkitBackdropFilter: 'blur(16px) saturate(160%)',
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 6px 20px rgba(0,0,0,0.35)',
  }
  return (
    <div className="px-3.5 py-2.5 rounded-2xl text-end shrink-0" style={WIDGET_STYLE}>
      <p
        className="text-[10px] font-semibold tracking-[0.4px] leading-none"
        style={{ color: 'rgba(163,163,163,1)' }}
      >
        {t('washer.dashboard.today')}
      </p>
      {/* dir="ltr" keeps ₪ left-of-dash in RTL bidi context */}
      <p className="text-[16px] font-extrabold tracking-[-0.3px] mt-0.5" style={{ color: '#7DD9A2' }} dir="ltr">
        ₪—
      </p>
    </div>
  )
}

export default function WasherDashboard() {
  const { profile, refreshProfile } = useAuth()
  const { user }                    = useAuth()
  const showToast                   = useToast()
  const { t }                       = useTranslation()
  const location                    = useLocation()

  const [online, setOnline]               = useState(profile?.is_online ?? false)
  const lastPersistedAtRef = useRef(0)
  const [toggling, setToggling]           = useState(false)
  const [activeJob, setActiveJob]         = useState(null)
  const [selectedJobId, setSelectedJobId] = useState(null)
  const [menuOpen, setMenuOpen]           = useState(false)

  const { position, permissionState, requestPermission } = useGeolocation({ watch: online })
  const { jobs, loading } = useNearbyJobs(position, online)

  // Write current_location (PostGIS) whenever position changes while online.
  useEffect(() => {
    if (!online || !position) return
    supabase
      .from('profiles')
      .update({ current_location: `POINT(${position.lng} ${position.lat})` })
      .eq('id', user.id)
  }, [position?.lat, position?.lng, online]) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist last-known lat/lng for agent location card — throttled to every 10s.
  useEffect(() => {
    console.log('[location-persist] effect fired', { lat: position?.lat, lng: position?.lng, userId: user?.id })
    if (!position || !user?.id) {
      console.log('[location-persist] skipping — missing position or user')
      return
    }
    const now     = Date.now()
    const elapsed = now - lastPersistedAtRef.current
    if (elapsed < 10_000) {
      console.log('[location-persist] throttled —', elapsed, 'ms since last write')
      return
    }
    console.log('[location-persist] writing to DB', { lat: position.lat, lng: position.lng })
    lastPersistedAtRef.current = now
    supabase
      .from('profiles')
      .update({ last_lat: position.lat, last_lng: position.lng, last_location_at: new Date().toISOString() })
      .eq('id', user.id)
      .select('id')
      .then(({ data, error }) => {
        if (error) {
          console.error('[location-persist] write failed (error):', error)
          lastPersistedAtRef.current = 0
        } else if (!data || data.length === 0) {
          console.error('[location-persist] write matched 0 rows — RLS may be blocking. user.id:', user.id)
          lastPersistedAtRef.current = 0
        } else {
          console.log('[location-persist] write succeeded, row:', data[0]?.id)
        }
      })
  }, [position?.lat, position?.lng, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Apply accepted job passed via navigation state immediately.
  useEffect(() => {
    const accepted = location.state?.acceptedJob
    if (accepted?.id) {
      setActiveJob(accepted)
      window.history.replaceState({}, document.title)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch active job as safety net.
  useEffect(() => {
    let cancelled = false
    supabase
      .rpc('get_washer_active_job')
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) { console.error('[Dashboard] Failed to fetch active job:', error); return }
        if (data) setActiveJob(data)
      })
    return () => { cancelled = true }
  }, [user.id, online])

  // Detect consumer-side cancel via realtime.
  useEffect(() => {
    if (!activeJob?.id) return
    const channel = supabase
      .channel(`dash-active:${activeJob.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'orders',
        filter: `id=eq.${activeJob.id}`,
      }, (payload) => {
        if (payload.new.status === 'completed' || payload.new.status === 'cancelled') {
          setActiveJob(null)
        }
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [activeJob?.id])

  async function toggleOnline() {
    const next = !online
    if (next && !position) {
      showToast(t('washer.dashboard.gpsRequired'), 'error')
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

  function handleJobDone()        { setActiveJob(null) }
  function handleJobPinTap(jobId) { setSelectedJobId(jobId); setTimeout(() => setSelectedJobId(null), 1000) }

  // Guard: can't go offline while a job is active.
  function handleToggle() {
    if (activeJob) { showToast(t('washer.online.cantGoOfflineActive'), 'error'); return }
    toggleOnline()
  }

  return (
    <div className="relative h-full">

      {/* ── Real map (lazy) — dark MapBG as Suspense fallback ── */}
      <Suspense fallback={<MapBG dark className="absolute inset-0 w-full h-full" />}>
        <WorkerMap
          washerPosition={position}
          jobs={jobs}
          activeJob={activeJob}
          onJobPinTap={handleJobPinTap}
        />
      </Suspense>

      {/* ── Top chrome: online pill (start) + earnings widget (end) ── */}
      {/* inset-x-4 (physical left/right) avoids inset-inline-* WebView gaps in RTL */}
      <div
        className="fixed inset-x-4 flex items-center gap-3 z-40"
        style={{ top: 'max(0.5rem, calc(env(safe-area-inset-top, 0px) + 0.5rem))' }}
      >
        <OnlinePill
          online={online}
          toggling={toggling}
          profile={profile}
          user={user}
          onToggle={handleToggle}
          onMenuOpen={() => setMenuOpen(true)}
          t={t}
        />
        <div className="flex-1" />
        <EarningsWidget t={t} />
      </div>

      {/* ── GPS permission banners ── */}
      {permissionState === 'idle' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-6">
          <div className="bg-glass border border-glass-border backdrop-blur-xl rounded-glass p-6 flex flex-col gap-4 max-w-sm w-full shadow-glass">
            <p className="text-base font-bold text-ink">{t('washer.dashboard.locationPrompt.title')}</p>
            <p className="text-sm text-ink-muted">{t('washer.dashboard.locationPrompt.body')}</p>
            <button onClick={requestPermission} className="btn-primary">
              {t('washer.dashboard.locationPrompt.button')}
            </button>
          </div>
        </div>
      )}

      {permissionState === 'denied' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-6">
          <div className="bg-glass border border-glass-border backdrop-blur-xl rounded-glass p-6 flex flex-col gap-3 max-w-sm w-full shadow-glass">
            <p className="text-base font-bold text-ink">{t('washer.dashboard.locationDenied.title')}</p>
            <p className="text-sm text-ink-muted">{t('washer.dashboard.locationDenied.body')}</p>
          </div>
        </div>
      )}

      {/* ── Persistent components ── */}
      <WasherMenu open={menuOpen} onClose={() => setMenuOpen(false)} online={online} />
      <NavLauncher activeJob={activeJob} />
      <JobDrawer
        jobs={jobs}
        loading={loading}
        selectedJobId={selectedJobId}
        online={online}
        onToggle={toggleOnline}
        toggling={toggling}
        activeJob={activeJob}
        onJobDone={handleJobDone}
        position={position}
      />
    </div>
  )
}
