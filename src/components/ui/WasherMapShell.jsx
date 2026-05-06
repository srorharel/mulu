import { Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'

// Full-viewport dark shell for the map-first Dashboard.
// Direction is driven globally by useDirection hook in App.jsx — no hardcoded dir here.
// overflow-hidden prevents the full-bleed map from creating a page-level scrollbar.
export default function WasherMapShell() {
  const { profile } = useAuth()
  const isDark = profile?.display_preference !== 'light'

  return (
    <div className={`${isDark ? 'dark ' : ''}h-full overflow-hidden bg-surface text-ink`}>
      <Outlet />
    </div>
  )
}
