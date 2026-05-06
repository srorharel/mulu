import { Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'

// Full-viewport dark+RTL shell for the map-first Dashboard.
// BottomNav is NOT rendered here — Dashboard uses the slide-out WasherMenu instead.
// overflow-hidden prevents the full-bleed map from creating a page-level scrollbar.
// Conditionally applies the dark class based on display_preference (defaults to dark).
export default function WasherMapShell() {
  const { profile } = useAuth()
  const isDark = profile?.display_preference !== 'light'

  return (
    <div dir="rtl" className={`${isDark ? 'dark ' : ''}h-full overflow-hidden bg-surface text-ink`}>
      <Outlet />
    </div>
  )
}
