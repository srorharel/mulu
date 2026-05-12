import { Outlet } from 'react-router-dom'
import { useTheme } from '../../hooks/useTheme.js'

// Route-layout wrapper for standard washer pages (not the full-bleed Dashboard).
// Direction is driven globally by useDirection hook in App.jsx — no hardcoded dir here.
// Theme is resolved through useTheme() — do not read display_preference or role directly here.
export default function WasherShell() {
  const { isDark } = useTheme()

  return (
    <div data-layout="washer" className={`${isDark ? 'dark ' : ''}h-full bg-surface text-ink`}>
      <Outlet />
    </div>
  )
}
