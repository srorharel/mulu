import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { useLocation } from 'react-router-dom'
import { useMotionValue } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase.js'
import { replayAll } from '../../lib/offlineSync/engine.js'
import { subscribeOnline } from '../../lib/offlineSync/connectivity.js'
import { cacheActiveJob, readCachedActiveJob, removeCachedOrder } from '../../lib/offlineCache.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useGeolocation } from '../../hooks/useGeolocation.js'
import { useTheme } from '../../hooks/useTheme.js'
import { useToast } from '../../components/ui/Toast.jsx'
import { useNearbyJobs } from '../../hooks/useNearbyJobs.js'
import { useAppForeground } from '../../hooks/useAppForeground.js'
import { useTodayEarnings } from '../../hooks/useTodayEarnings.js'
import { payoutForTier } from '../../lib/payout.js'
import JobDrawer, { getSnaps } from '../../components/washer/JobDrawer.jsx'
import RecenterButton from '../../components/washer/RecenterButton.jsx'
import WasherMenu from '../../components/washer/WasherMenu.jsx'
import NavLauncher from '../../components/washer/NavLauncher.jsx'
import MapBG from '../../components/ui/MapBG.jsx'
import Editable from '../../components/editable/Editable.jsx'

const WorkerMap = lazy(() => import('../../components/washer/WorkerMap.jsx'))

const SPRING = { type: 'spring', stiffness: 300, damping: 28 }

// Dark-glass pill: washer avatar + online/offline toggle + menu trigger.
// Tapping the left area (avatar + status text) calls onToggle.
// Tapping the ··· icon on the right calls onMenuOpen.
function OnlinePill({ online, toggling, profile, user, onToggle, onMenuOpen, t }) {
  const initials = profile?.full_name
    ? profile.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : (user?.email?.[0] ?? '?').toUpperCase()

  // Semantic glass tokens so the pill adapts to washer light/dark mode (the
  // WasherMapShell toggles .dark above us). Avatar gradient + online dot are
  // brand colors that read on both themes.
  return (
    <div className="flex items-center rounded-full overflow-hidden shrink-0 bg-glass border border-glass-border backdrop-blur-xl shadow-glass dark:shadow-glass-dark">
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
          <p className="text-[12px] leading-none font-medium text-ink-muted">
            {t('washer.dashboard.youre')}
          </p>
          <div className="flex items-center gap-1.5 mt-[5px]">
            <span
              className="w-[7px] h-[7px] rounded-full shrink-0"
              style={{
                background: online ? '#26B55F' : '#9ca3af',
                boxShadow: online ? '0 0 8px #7DD9A2' : 'none',
              }}
            />
            <span className="text-[14px] font-bold text-ink leading-none">
              {toggling ? '…' : online ? t('washer.toggle.online') : t('washer.toggle.offline')}
            </span>
          </div>
        </div>
      </button>

      {/* Divider */}
      <div className="w-px h-8 shrink-0 bg-glass-border" />

      {/* Menu trigger */}
      <button
        onClick={onMenuOpen}
        aria-label={t('washer.dashboard.openMenu')}
        className="px-3 py-2 flex items-center justify-center"
      >
        <Menu className="h-4 w-4 text-ink-muted" />
      </button>
    </div>
  )
}

// ── Tier change banner ────────────────────────────────────────────────────────
// Shows when profile.tier_changed_at is within last 24h and user hasn't dismissed it.
// Direction (up vs down) is inferred from localStorage-cached previous tier.
function TierBanner({ profile, t }) {
  const changedAt = profile?.tier_changed_at
  const tier      = profile?.current_tier

  const [visible, setVisible] = useState(false)
  const [wentUp,  setWentUp]  = useState(true)

  useEffect(() => {
    if (!changedAt || tier == null) return
    const ageMs   = Date.now() - new Date(changedAt).getTime()
    if (ageMs > 24 * 60 * 60 * 1000) return // older than 24h

    const dismissKey = `tier_banner_dismissed_${changedAt}`
    if (localStorage.getItem(dismissKey)) return

    // Direction is computed ONCE per tier change and pinned in localStorage —
    // the effect below overwrites washer_previous_tier on every load, so a
    // remount within the 24h window would otherwise recompute a downgrade as
    // tier >= prevTier and flip the banner to the "tier up" copy.
    const dirKey = `tier_banner_dir_${changedAt}`
    let dir = localStorage.getItem(dirKey)
    if (dir == null) {
      const prevTierRaw = localStorage.getItem('washer_previous_tier')
      const prevTier    = prevTierRaw != null ? Number(prevTierRaw) : null
      dir = (prevTier == null || tier >= prevTier) ? 'up' : 'down'
      localStorage.setItem(dirKey, dir)
    }
    setWentUp(dir === 'up')
    setVisible(true)
  }, [changedAt, tier])

  // Always update previous-tier cache on each load
  useEffect(() => {
    if (tier != null) localStorage.setItem('washer_previous_tier', String(tier))
  }, [tier])

  function dismiss() {
    if (!changedAt) return
    localStorage.setItem(`tier_banner_dismissed_${changedAt}`, '1')
    setVisible(false)
  }

  if (!visible || tier == null) return null

  const payout = payoutForTier(tier)
  const text   = wentUp
    ? t('washer.tier.banner.up',   { stars: tier, payout })
    : t('washer.tier.banner.down', { stars: tier, payout })

  return (
    <div
      className="fixed inset-x-4 z-50 flex items-center gap-3 rounded-2xl px-4 py-3 shadow-lg"
      style={{
        top: 'max(5.5rem, calc(env(safe-area-inset-top, 0px) + 5.5rem))',
        background: wentUp ? 'rgba(38,181,95,0.95)' : 'rgba(26,29,39,0.92)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.12)',
      }}
    >
      <p className="flex-1 text-[13px] font-semibold text-white leading-snug">{text}</p>
      <button
        onClick={dismiss}
        aria-label={t('washer.tier.banner.dismiss')}
        className="shrink-0 text-white/70 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

// Today's earnings: sum of payout on the washer's orders approved (completed)
// today. `amount` is null while loading (ADR-015 deferred this to a follow-up;
// now live via useTodayEarnings). Semantic tokens adapt to washer light/dark.
function EarningsWidget({ t, amount }) {
  return (
    <div className="px-3.5 py-2.5 rounded-2xl text-end shrink-0 bg-glass border border-glass-border backdrop-blur-xl shadow-glass dark:shadow-glass-dark">
      <p className="text-[10px] font-semibold tracking-[0.4px] leading-none text-ink-muted">
        {t('washer.dashboard.today')}
      </p>
      {/* dir="ltr" keeps ₪ left-of-number in RTL bidi context. primary-700 in
          light mode (the mint accent fails contrast on the light glass). */}
      <p className="text-[16px] font-extrabold tracking-[-0.3px] mt-0.5 text-primary-700 dark:text-accent" dir="ltr">
        {amount == null ? '₪—' : `₪${Math.round(amount)}`}
      </p>
    </div>
  )
}

export default function WasherDashboard() {
  const { profile, refreshProfile } = useAuth()
  const { user }                    = useAuth()
  const showToast                   = useToast()
  const { t }                       = useTranslation()
  const { isDark }                  = useTheme()
  const location                    = useLocation()

  const [online, setOnline]               = useState(profile?.is_online ?? false)
  const lastPersistedAtRef = useRef(0)
  const [toggling, setToggling]           = useState(false)
  const [activeJob, setActiveJob]         = useState(null)
  const [selectedJobId, setSelectedJobId] = useState(null)
  const [menuOpen, setMenuOpen]           = useState(false)

  // Drawer geometry + live translate-y are owned here and shared with both the
  // JobDrawer (it drags/snaps this value) and the RecenterButton (it tracks it).
  const drawerSnaps = useRef(getSnaps())
  const drawerY     = useMotionValue(drawerSnaps.current.default)
  const recenterRef = useRef(null)

  const { position, permissionState, requestPermission } = useGeolocation({ watch: online })
  const { jobs, loading, refresh: refreshNearby } = useNearbyJobs(position, online)

  // Today's earnings for the top-chrome widget. Re-keyed on activeJob so finishing
  // a job (panel clears) immediately re-sums; the hook also refetches on realtime
  // completion + on foreground.
  const todayEarnings = useTodayEarnings(user?.id, activeJob?.id ?? null)

  // user.id is only read inside the location-write effect; refed so the effect
  // doesn't retrigger on profile object identity changes.
  const userIdRef = useRef(user?.id)
  useEffect(() => { userIdRef.current = user?.id }, [user?.id])

  // Write current_location (PostGIS) whenever position changes while online.
  useEffect(() => {
    if (!userIdRef.current) return
    if (!online || !position) return
    supabase
      .from('profiles')
      .update({ current_location: `POINT(${position.lng} ${position.lat})` })
      .eq('id', userIdRef.current)
  }, [position?.lat, position?.lng, online]) // eslint-disable-line react-hooks/exhaustive-deps

  // Persist last-known lat/lng for agent location card — throttled to every 10s.
  useEffect(() => {
    if (!position || !user?.id) return
    const now     = Date.now()
    const elapsed = now - lastPersistedAtRef.current
    if (elapsed < 10_000) return
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
        }
      })
  }, [position?.lat, position?.lng, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Global underground-capture replay: flush any queued captures on app-init
  // (the app may have been killed while underground) and whenever connectivity
  // returns — runs regardless of whether the active-job panel is mounted.
  useEffect(() => {
    replayAll(supabase).catch(() => {})
    const unsub = subscribeOnline(isOn => { if (isOn) replayAll(supabase).catch(() => {}) })
    return unsub
  }, [])

  // Apply accepted job passed via navigation state immediately.
  useEffect(() => {
    const accepted = location.state?.acceptedJob
    if (accepted?.id) {
      setActiveJob(accepted)
      window.history.replaceState({}, document.title)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Resolve the washer's active job from the server. `allowClear` lets a refetch
  // CLEAR a stale panel when the server says there's no longer an active job —
  // e.g. an agent approved/declined-to-terminal the wash while the app was
  // backgrounded and the realtime 'completed' event was missed (the socket is
  // dead in the background and missed events are not replayed on reconnect).
  // On the initial/online fetch we never clear, so a just-accepted job passed via
  // navigation state can't be wiped by a momentary RPC race.
  const fetchActiveJob = useCallback(async ({ allowClear = false } = {}) => {
    const { data, error } = await supabase.rpc('get_washer_active_job').maybeSingle()
    if (error) {
      console.error('[Dashboard] Failed to fetch active job:', error)
      // Offline fallback: restore the last-known active job so a washer who cold-
      // started the app underground can still reach + finish their wash. Never
      // CLEARS here — only a successful server "no active job" clears the panel.
      const cached = readCachedActiveJob(userIdRef.current)
      if (cached) setActiveJob(prev => prev ?? cached)
      return
    }
    if (data) {
      setActiveJob(prev => (prev?.id === data.id ? prev : data))
      cacheActiveJob(userIdRef.current, data)
    } else if (allowClear) {
      setActiveJob(prev => (prev ? null : prev))
      cacheActiveJob(userIdRef.current, null)  // server confirmed no job → clear cache
    }
  }, [])

  // Clear the active job AND its offline cache (release/complete/cancel) so a
  // later offline cold-start can't restore a job the washer no longer owns.
  // Defined here (above the realtime effect that lists it as a dep) to avoid a
  // TDZ on the dep-array read during render.
  const clearActiveJob = useCallback(() => {
    setActiveJob(prev => { if (prev?.id) removeCachedOrder(prev.id); return null })
    cacheActiveJob(userIdRef.current, null)
  }, [])

  // Fetch active job as safety net (mount + online toggle). Never clears here.
  useEffect(() => { fetchActiveJob() }, [user.id, online, fetchActiveJob])

  // Self-heal when the app returns to the foreground: realtime missed any status
  // change made while backgrounded, so reconcile the active job (and let it clear
  // if the job finished). useRealtimeOrder separately refreshes the panel's order
  // content on the same foreground signal (e.g. a decline reverts it to working).
  const reconcileActiveJob = useCallback(() => { fetchActiveJob({ allowClear: true }) }, [fetchActiveJob])
  useAppForeground(reconcileActiveJob)

  // Belt-and-suspenders for missed realtime: while a job is active, poll the
  // server so a terminal transition (agent approve → completed, consumer cancel,
  // release) clears the panel within ~30s even when the realtime UPDATE never
  // arrives (dead/backgrounded socket, RLS edge cases). Only runs while active.
  useEffect(() => {
    if (!activeJob?.id) return undefined
    const interval = setInterval(reconcileActiveJob, 30_000)
    return () => clearInterval(interval)
  }, [activeJob?.id, reconcileActiveJob])

  // When an active job ENDS (washer release, completion, consumer/agent cancel),
  // the washer re-enters the job pool. nearby_jobs returns nothing while a job is
  // active, so the hook's local list was emptied; a single realtime event for the
  // released order would only re-add THAT order, leaving the window showing just
  // the job that was dropped. Refetch the full nearby list when activeJob clears so
  // the whole pool reappears. Tracks the previous value to fire only on set→null.
  const hadActiveJobRef = useRef(false)
  useEffect(() => {
    const hasActive = !!activeJob
    if (hadActiveJobRef.current && !hasActive) refreshNearby()
    hadActiveJobRef.current = hasActive
  }, [activeJob?.id, refreshNearby]) // eslint-disable-line react-hooks/exhaustive-deps

  // Detect terminal transitions (cancel, complete) via realtime.
  useEffect(() => {
    if (!activeJob?.id) return
    const channel = supabase
      .channel(`dash-active:${activeJob.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'orders',
        filter: `id=eq.${activeJob.id}`,
      }, (payload) => {
        const newStatus = payload.new.status
        if (newStatus === 'completed' || newStatus === 'cancelled') {
          clearActiveJob()
        }
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [activeJob?.id, clearActiveJob])

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

  function handleJobDone()        { clearActiveJob() }
  function handleJobPinTap(jobId) { setSelectedJobId(jobId); setTimeout(() => setSelectedJobId(null), 1000) }

  // Guard: can't go offline while a job is active.
  function handleToggle() {
    if (activeJob) { showToast(t('washer.online.cantGoOfflineActive'), 'error'); return }
    toggleOnline()
  }

  return (
    <div className="relative h-full">

      {/* ── Real map (lazy) — MapBG (theme-matched) as Suspense fallback ── */}
      <Suspense fallback={<MapBG dark={isDark} className="absolute inset-0 w-full h-full" />}>
        <WorkerMap
          washerPosition={position}
          jobs={jobs}
          activeJob={activeJob}
          onJobPinTap={handleJobPinTap}
          recenterRef={recenterRef}
        />
      </Suspense>

      {/* ── Top chrome: online pill (start) + earnings widget w/ Waze under it (end) ── */}
      {/* inset-x-4 (physical left/right) avoids inset-inline-* WebView gaps in RTL */}
      <div
        className="fixed inset-x-4 flex items-start gap-3 z-40"
        style={{ top: 'max(0.5rem, calc(env(safe-area-inset-top, 0px) + 0.5rem))' }}
      >
        <Editable id="washer.dashboard.onlinePill">
          <div>
            <OnlinePill
              online={online}
              toggling={toggling}
              profile={profile}
              user={user}
              onToggle={handleToggle}
              onMenuOpen={() => setMenuOpen(true)}
              t={t}
            />
          </div>
        </Editable>
        <div className="flex-1" />
        {/* Earnings square, with the nav launcher anchored directly below it (same
            outer edge in both LTR/RTL — top-left in he, top-right in en). */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <EarningsWidget t={t} amount={todayEarnings} />
          <NavLauncher activeJob={activeJob} />
        </div>
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

      {/* ── Tier change banner ── */}
      <TierBanner profile={profile} t={t} />

      {/* ── Persistent components ── */}
      {/* NavLauncher is mounted in the top-chrome (under EarningsWidget) above. */}
      <WasherMenu open={menuOpen} onClose={() => setMenuOpen(false)} online={online} />

      {/* Recenter FAB: physical-left, bottom glued to the JobDrawer's top edge via
          the shared drawerY motion value. Hidden while a job is active. */}
      <RecenterButton
        drawerY={drawerY}
        expandedH={drawerSnaps.current.expandedH}
        visible={!activeJob && !!(position && Number.isFinite(position.lat) && Number.isFinite(position.lng))}
        onRecenter={() => recenterRef.current?.()}
      />

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
        drawerY={drawerY}
        snaps={drawerSnaps.current}
      />
    </div>
  )
}
