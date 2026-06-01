import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useTheme } from '../../hooks/useTheme.js'
import { supabase } from '../../lib/supabase.js'
import { useWasherLocationBroadcast } from '../../hooks/useWasherLocationBroadcast.js'

// Route-layout wrapper for standard washer pages (not the full-bleed Dashboard).
// Direction is driven globally by useDirection hook in App.jsx — no hardcoded dir here.
// Theme is resolved through useTheme() — do not read display_preference or role directly here.
export default function WasherShell() {
  const { isDark } = useTheme()

  // Keep broadcasting the washer's location while they have an active job but are on
  // a sub-page (the Dashboard, which normally broadcasts, is unmounted here). One
  // fetch on mount is enough: a washer can't gain/lose an active job while sitting on
  // a sub-page — acceptance navigates to the Dashboard, and job-done lives there too.
  const [hasActiveJob, setHasActiveJob] = useState(false)
  useEffect(() => {
    let cancelled = false
    supabase.rpc('get_washer_active_job').maybeSingle().then(({ data }) => {
      if (!cancelled) setHasActiveJob(!!data?.id)
    })
    return () => { cancelled = true }
  }, [])
  useWasherLocationBroadcast(hasActiveJob)

  return (
    <div data-layout="washer" className={`${isDark ? 'dark ' : ''}h-full bg-surface text-ink`}>
      <Outlet />
    </div>
  )
}
