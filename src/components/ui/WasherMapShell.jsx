import { Outlet } from 'react-router-dom'
import { useTheme } from '../../hooks/useTheme.js'

// Full-viewport shell for the map-first Dashboard and Active Job view.
// Theme is resolved through useTheme() — same canonical pattern as WasherShell.
// Floating overlays (OnlinePill, JobDrawer, WasherMenu, EarningsWidget) use
// semantic tokens and adapt automatically when .dark toggles here. Tile source
// follows the same isDark via mapTiles() in src/lib/mapTheme.js.
export default function WasherMapShell() {
  const { isDark } = useTheme()

  return (
    <div
      data-layout="washer"
      className={`${isDark ? 'dark ' : ''}h-full overflow-hidden bg-surface text-ink`}
    >
      <Outlet />
    </div>
  )
}
