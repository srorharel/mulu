import { Outlet } from 'react-router-dom'
import BottomNav from './BottomNav.jsx'

// Full-viewport dark+RTL shell for the map-first Dashboard.
// Unlike WasherShell (which lets each page own its PageShell+BottomNav),
// this shell renders BottomNav itself because Dashboard has no PageShell.
// overflow-hidden prevents the full-bleed map from creating a page-level scrollbar.
export default function WasherMapShell() {
  return (
    <div dir="rtl" className="dark h-full overflow-hidden bg-surface text-ink">
      <Outlet />
      <BottomNav />
    </div>
  )
}
