import { useState, useEffect, lazy, Suspense } from 'react'
import { motion } from 'framer-motion'
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

const WorkerMap = lazy(() => import('../../components/washer/WorkerMap.jsx'))

const SPRING = { type: 'spring', stiffness: 300, damping: 28 }

export default function WasherDashboard() {
  const { profile, refreshProfile } = useAuth()
  const { user }                    = useAuth()
  const showToast                   = useToast()
  const { t }                       = useTranslation()

  const [online, setOnline]               = useState(profile?.is_online ?? false)
  const [toggling, setToggling]           = useState(false)
  const [activeJob, setActiveJob]         = useState(null)
  const [selectedJobId, setSelectedJobId] = useState(null)
  const [menuOpen, setMenuOpen]           = useState(false)

  const { position, permissionState, requestPermission } = useGeolocation({ watch: online })
  const { jobs, loading } = useNearbyJobs(position, online)

  useEffect(() => {
    if (!online || !position) return
    supabase
      .from('profiles')
      .update({ current_location: `POINT(${position.lng} ${position.lat})` })
      .eq('id', user.id)
  }, [position?.lat, position?.lng, online]) // eslint-disable-line react-hooks/exhaustive-deps

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

  function handleJobPinTap(jobId) {
    setSelectedJobId(jobId)
    setTimeout(() => setSelectedJobId(null), 1000)
  }

  return (
    <div className="relative h-full">
      <Suspense fallback={<div className="absolute inset-0 bg-surface" />}>
        <WorkerMap
          washerPosition={position}
          jobs={jobs}
          activeJob={activeJob}
          onJobPinTap={handleJobPinTap}
        />
      </Suspense>

      <motion.button
        whileTap={{ scale: 0.92 }}
        transition={SPRING}
        onClick={() => setMenuOpen(true)}
        aria-label={t('washer.dashboard.openMenu')}
        className="fixed z-40 flex items-center justify-center rounded-2xl bg-glass border border-glass-border text-ink shadow-lg backdrop-blur-xl"
        style={{
          top:              'max(1rem, calc(env(safe-area-inset-top, 0px) + 0.5rem))',
          insetInlineStart: '1rem',
          width:            44,
          height:           44,
        }}
      >
        <Menu className="h-5 w-5" />
      </motion.button>

      {permissionState === 'idle' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-6">
          <div className="bg-glass border border-glass-border backdrop-blur-xl rounded-2xl p-6 flex flex-col gap-4 max-w-sm w-full shadow-xl">
            <p className="text-base font-bold text-ink">{t('washer.dashboard.locationPrompt.title')}</p>
            <p className="text-sm text-ink-muted">{t('washer.dashboard.locationPrompt.body')}</p>
            <button onClick={requestPermission} className="btn-primary">
              {t('washer.dashboard.locationPrompt.button')}
            </button>
          </div>
        </div>
      )}

      {permissionState === 'denied' && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-6">
          <div className="bg-glass border border-glass-border backdrop-blur-xl rounded-2xl p-6 flex flex-col gap-3 max-w-sm w-full shadow-xl">
            <p className="text-base font-bold text-ink">{t('washer.dashboard.locationDenied.title')}</p>
            <p className="text-sm text-ink-muted">{t('washer.dashboard.locationDenied.body')}</p>
          </div>
        </div>
      )}

      <WasherMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        online={online}
      />

      <NavLauncher activeJob={activeJob} />

      <JobDrawer
        jobs={jobs}
        loading={loading}
        selectedJobId={selectedJobId}
        online={online}
        onToggle={toggleOnline}
        toggling={toggling}
        activeJob={activeJob}
      />
    </div>
  )
}
