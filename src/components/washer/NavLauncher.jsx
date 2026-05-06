import { motion } from 'framer-motion'
import { Navigation } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'

const SPRING = { type: 'spring', stiffness: 300, damping: 28 }

// Floating button to open the active job's location in Waze or Google Maps.
// Only visible when activeJob is set. Reads nav_app_preference from profile.
// Position: bottom-end (trailing edge = physical left in RTL), above the
// collapsed JobDrawer snap point (COLLAPSED_H 120 + BOTTOM_NAV_H 56 + 12 gap).
export default function NavLauncher({ activeJob }) {
  const { profile } = useAuth()

  if (!activeJob) return null

  const pref  = profile?.nav_app_preference ?? 'waze'
  const label = pref === 'google' ? 'Google Maps' : 'Waze'

  const url = pref === 'google'
    ? `https://www.google.com/maps/dir/?api=1&destination=${activeJob.lat},${activeJob.lng}&travelmode=driving`
    : `https://waze.com/ul?ll=${activeJob.lat},${activeJob.lng}&navigate=yes`

  function open() {
    // Use Capacitor's deep-link opener on native; fall back to window.open on web.
    if (window.Capacitor?.Plugins?.App?.openUrl) {
      window.Capacitor.Plugins.App.openUrl({ url })
    } else {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      whileTap={{ scale: 0.92 }}
      transition={SPRING}
      onClick={open}
      aria-label={`Open in ${label}`}
      className="fixed z-40 flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-sm font-semibold shadow-lg backdrop-blur-xl border bg-glass border-glass-border text-ink"
      style={{
        bottom: 188,
        insetInlineEnd: '1rem',
      }}
    >
      <Navigation className="h-4 w-4 text-accent" />
      {label}
    </motion.button>
  )
}
