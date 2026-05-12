import { Outlet } from 'react-router-dom'
import { useTheme } from '../../hooks/useTheme.js'

// Full-viewport dark shell for the map-first Dashboard.
// Direction is driven globally by useDirection hook in App.jsx — no hardcoded dir here.
// overflow-hidden prevents the full-bleed map from creating a page-level scrollbar.
// Theme is resolved through useTheme() — do not read display_preference or role directly here.
export default function WasherMapShell() {
  const { isDark } = useTheme()

  return (
    <div data-layout="washer" className={`${isDark ? 'dark ' : ''}h-full overflow-hidden bg-surface text-ink`}>
      <Outlet />
    </div>
  )
}
