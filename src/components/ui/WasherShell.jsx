import { Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'

// Route-layout wrapper for standard washer pages (not the full-bleed Dashboard).
// Direction is driven globally by useDirection hook in App.jsx — no hardcoded dir here.
// Conditionally applies the dark class based on the washer's display_preference.
export default function WasherShell() {
  const { profile } = useAuth()
  const isDark = profile?.display_preference !== 'light'

  return (
    <div className={`${isDark ? 'dark ' : ''}h-full bg-surface text-ink`}>
      <Outlet />
    </div>
  )
}
