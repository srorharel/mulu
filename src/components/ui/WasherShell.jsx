import { Outlet } from 'react-router-dom'

// Route-layout wrapper for all washer routes.
// Provides: dir="rtl" (Hebrew RTL), Tailwind dark mode (.dark class),
// and the dark surface background that makes the shell visible in Phase B.
// Each washer page still owns its PageShell + BottomNav internally —
// this wrapper just sets the environment they render inside.
export default function WasherShell() {
  return (
    <div dir="rtl" className="dark h-full bg-surface text-ink">
      <Outlet />
    </div>
  )
}
