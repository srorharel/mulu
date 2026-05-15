import { Outlet } from 'react-router-dom'

// Full-viewport shell for the map-first Dashboard and Active Job view.
// Always applies .dark — the CartoDB dark_all tile source cannot be changed
// per-session, so every overlay (JobDrawer, WasherMenu, OnlinePill) must
// always use dark tokens. Do not read display_preference or useTheme here.
// WasherShell (non-map pages) still respects the user's display_preference.
export default function WasherMapShell() {
  return (
    <div data-layout="washer" className="dark h-full overflow-hidden bg-surface text-ink">
      <Outlet />
    </div>
  )
}
