import { Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'

// Route-layout wrapper for standard washer pages (not the full-bleed Dashboard).
// Applies dir="rtl" for Hebrew layout and conditionally applies the dark class
// based on the washer's display_preference. Defaults to dark if profile not yet loaded.
export default function WasherShell() {
  const { profile } = useAuth()
  const isDark = profile?.display_preference !== 'light'

  return (
    <div dir="rtl" className={`${isDark ? 'dark ' : ''}h-full bg-surface text-ink`}>
      <Outlet />
    </div>
  )
}
